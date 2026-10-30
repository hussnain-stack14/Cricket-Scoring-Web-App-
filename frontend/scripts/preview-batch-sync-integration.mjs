/* Preview-only 386-operation upload test. Creates dedicated data through protected API routes. */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const deployment = option('--deployment');
if (!args.includes('--confirm-preview-test'))
  throw new Error('Refusing to create Preview test data without --confirm-preview-test.');
if (!deployment || !/^https:\/\/cricket-scoring-web-[a-z0-9-]+\.vercel\.app$/i.test(deployment))
  throw new Error('Use an exact protected Preview deployment URL.');

const temp = await mkdtemp(join(tmpdir(), 'crease-preview-batch-'));
const jarA = join(temp, 'a.cookies');
const jarB = join(temp, 'b.cookies');
const cli =
  process.platform === 'win32'
    ? join(process.env.APPDATA || '', 'npm', 'node_modules', 'vercel', 'dist', 'index.js')
    : 'vercel';
const root = resolve(import.meta.dirname, '../..');
const suffix = randomUUID().slice(0, 8).toUpperCase();
const publicTeamId = `BATCH-${suffix}`;
const password = `Batch${randomUUID().replace(/-/g, '').slice(0, 16)}9`;

function invoke(path, { method = 'GET', body, jar, headers = {} } = {}) {
  const curlArgs = ['curl', path, '--deployment', deployment, '--', '--silent', '--show-error'];
  if (jar) curlArgs.push('--cookie', jar, '--cookie-jar', jar);
  for (const [key, value] of Object.entries(headers)) curlArgs.push('--header', `${key}: ${value}`);
  if (body !== undefined)
    curlArgs.push('--header', 'Content-Type: application/json', '--data', JSON.stringify(body));
  if (method !== 'GET') curlArgs.push('--request', method);
  return new Promise((resolvePromise, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn(process.execPath, [cli, ...curlArgs], { cwd: root, windowsHide: true })
        : spawn(cli, curlArgs, { cwd: root });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (error += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const json = [...output.split(/\r?\n/)].reverse().find((line) => line.trim().startsWith('{'));
      if (code !== 0 || !json)
        return reject(new Error(`Preview request failed for ${path}: ${error || output}`));
      try {
        resolvePromise(JSON.parse(json));
      } catch {
        reject(new Error(`Preview returned invalid JSON for ${path}.`));
      }
    });
  });
}

try {
  const isolation = await invoke('/api/preview/isolation/', { jar: jarA });
  if (!isolation.productionDatabaseReadDenied || !isolation.recoveryDisabled)
    throw new Error('Preview isolation is not verified; no test account was created.');
  await invoke('/api/auth/register/', {
    method: 'POST',
    jar: jarA,
    body: {
      teamName: `Batch Preview ${suffix}`,
      teamId: publicTeamId,
      password,
      confirmPassword: password,
    },
  });
  const sessionA = await invoke('/api/auth/me/', { jar: jarA });
  if (!sessionA.authenticated || !sessionA.workspaceKey)
    throw new Error('Preview session was not established.');

  const changes = Array.from({ length: 386 }, (_, index) => {
    const id = randomUUID();
    return {
      table: 'players',
      recordId: id,
      data: { id, name: `Batch player ${index + 1}` },
      baseRevision: 0,
      changeId: randomUUID(),
      deleted: false,
    };
  });
  const batches = [];
  for (let index = 0; index < changes.length; index += 50)
    batches.push(changes.slice(index, index + 50));
  let acknowledged = 0;
  for (const batch of batches) {
    const result = await invoke('/api/sync/push/', {
      method: 'POST',
      jar: jarA,
      headers: { 'X-Crease-Workspace': sessionA.workspaceKey },
      body: { changes: batch },
    });
    if (result.rejected.length || result.applied.length !== batch.length)
      throw new Error(
        `Batch was not fully acknowledged (${result.rejected?.[0]?.reason || 'unknown error'}).`,
      );
    acknowledged += result.applied.length;
  }
  const duplicate = await invoke('/api/sync/push/', {
    method: 'POST',
    jar: jarA,
    headers: { 'X-Crease-Workspace': sessionA.workspaceKey },
    body: { changes: batches[0] },
  });
  if (duplicate.rejected.length || duplicate.applied.length !== batches[0].length)
    throw new Error('Idempotent retry was not acknowledged.');

  await invoke('/api/auth/login/', {
    method: 'POST',
    jar: jarB,
    body: { teamId: publicTeamId, password },
  });
  const sessionB = await invoke('/api/auth/me/', { jar: jarB });
  const records = [];
  let next = null;
  let until = null;
  do {
    const params = new URLSearchParams({ since: '1970-01-01T00:00:00.000Z' });
    if (until) params.set('until', until);
    if (next) {
      params.set('afterUpdatedAt', next.updatedAt);
      params.set('afterTable', next.table);
      params.set('afterRecordId', next.recordId);
    }
    const page = await invoke(`/api/sync/pull/?${params}`, {
      jar: jarB,
      headers: { 'X-Crease-Workspace': sessionB.workspaceKey },
    });
    records.push(...page.records);
    until = page.until || page.pulledAt;
    next = page.hasMore ? page.nextCursor : null;
  } while (next);
  const players = records.filter((record) => record.table === 'players' && !record.deletedAt);
  if (players.length !== 386 || new Set(players.map((record) => record.recordId)).size !== 386)
    throw new Error('Browser B pull did not receive 386 unique player records.');
  console.log(
    JSON.stringify(
      {
        mode: 'protected Preview 386-operation batch integration',
        batchSizes: batches.map((batch) => batch.length),
        browserA: { queued: 386, acknowledged, pendingAfterAcknowledgments: 0 },
        browserB: {
          activePlayers: players.length,
          uniquePlayerIds: new Set(players.map((x) => x.recordId)).size,
        },
        repeatedFirstBatch: {
          acknowledged: duplicate.applied.length,
          rejected: duplicate.rejected.length,
        },
        previewIsolationVerified: true,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}

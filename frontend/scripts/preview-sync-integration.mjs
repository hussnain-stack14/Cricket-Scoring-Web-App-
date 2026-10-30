/*
 * Creates only dedicated Preview test data through the protected Preview API.
 * It uses separate cookie jars to model independent authenticated clients.
 *
 * npm run test:preview-sync -- --deployment <preview-url> --confirm-preview-test
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { matchStates, overs, result as matchResult } from '../lib/engine.js';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const deployment = option('--deployment');
if (!args.includes('--confirm-preview-test'))
  throw new Error('Refusing to create test data without --confirm-preview-test.');
if (!deployment || !/^https:\/\/cricket-scoring-web-[a-z0-9-]+\.vercel\.app$/i.test(deployment))
  throw new Error('Use the exact protected Preview deployment URL. Production URLs are rejected.');

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'crease-preview-sync-'));
const jarA = join(temporaryDirectory, 'browser-a.cookies');
const jarB = join(temporaryDirectory, 'browser-b.cookies');
const jarC = join(temporaryDirectory, 'browser-c.cookies');
const vercel =
  process.platform === 'win32'
    ? join(process.env.APPDATA || '', 'npm', 'node_modules', 'vercel', 'dist', 'index.js')
    : 'vercel';
const repositoryRoot = resolve(import.meta.dirname, '../..');
const testSuffix = randomUUID().slice(0, 8).toUpperCase();
const publicTeamId = `PREVIEW-${testSuffix}`;
const password = `Preview${randomUUID().replace(/-/g, '').slice(0, 16)}9`;

function invoke(path, { method = 'GET', body, jar, headers = {} } = {}) {
  const curlArgs = ['curl', path, '--deployment', deployment, '--', '--silent', '--show-error'];
  if (jar) curlArgs.push('--cookie', jar, '--cookie-jar', jar);
  for (const [name, value] of Object.entries(headers))
    curlArgs.push('--header', `${name}: ${value}`);
  if (body !== undefined) {
    curlArgs.push('--header', 'Content-Type: application/json', '--data', JSON.stringify(body));
  }
  if (method !== 'GET') curlArgs.push('--request', method);
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn(process.execPath, [vercel, ...curlArgs], { cwd: repositoryRoot, windowsHide: true })
        : spawn(vercel, curlArgs, { cwd: repositoryRoot });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (error += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const lines = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const jsonLine = [...lines].reverse().find((line) => line.startsWith('{'));
      if (code !== 0 || !jsonLine)
        return reject(
          new Error(`Protected Preview request failed for ${path}: ${error || output}`),
        );
      try {
        resolve(JSON.parse(jsonLine));
      } catch {
        reject(new Error(`Preview returned invalid JSON for ${path}.`));
      }
    });
  });
}

function change(table, data, baseRevision = 0, deleted = false, changeId = randomUUID()) {
  return { table, recordId: data.id, data, baseRevision, changeId, deleted };
}

function counts(records) {
  const output = {};
  for (const row of records) {
    const key = `${row.table}:${row.deletedAt ? 'deleted' : 'active'}`;
    output[key] = (output[key] || 0) + 1;
  }
  return output;
}

try {
  const isolation = await invoke('/api/preview/isolation/', { jar: jarA });
  if (
    !isolation.productionDatabaseReadDenied ||
    !isolation.recoveryDisabled ||
    isolation.productionFindPrivilegePresent ||
    isolation.productionWritePrivilegePresent
  )
    throw new Error('Preview isolation is not verified. No test account was created.');

  const registered = await invoke('/api/auth/register/', {
    method: 'POST',
    jar: jarA,
    body: {
      teamName: `Preview Sync ${testSuffix}`,
      teamId: publicTeamId,
      password,
      confirmPassword: password,
    },
  });
  const sessionA = await invoke('/api/auth/me/', { jar: jarA });
  if (!sessionA.authenticated || sessionA.teamId !== publicTeamId || !sessionA.workspaceKey)
    throw new Error(
      'Preview account registration did not establish the expected Browser A session.',
    );
  console.log(
    JSON.stringify({
      previewTestAccount: { publicTeamId, immutableWorkspaceKey: sessionA.workspaceKey },
    }),
  );
  const aliasCheck = await invoke('/api/preview/isolation/?account-alias=1', { jar: jarA });
  if (!aliasCheck.authenticated || !aliasCheck.immutableAliasResolvesToOwnAccount)
    throw new Error('The Preview deployment did not resolve Browser A’s immutable alias.');

  const playerA1 = { id: randomUUID(), name: 'Preview A1' };
  const playerA2 = { id: randomUUID(), name: 'Preview A2' };
  const playerB1 = { id: randomUUID(), name: 'Preview B1' };
  const playerB2 = { id: randomUUID(), name: 'Preview B2' };
  const teamA = {
    id: randomUUID(),
    name: `Preview XI A ${testSuffix}`,
    squad: [playerA1, playerA2],
  };
  const teamB = {
    id: randomUUID(),
    name: `Preview XI B ${testSuffix}`,
    squad: [playerB1, playerB2],
  };
  const match = {
    id: randomUUID(),
    date: '2026-10-30',
    firstBat: 0,
    status: 'live',
    rules: { overs: 1, size: 2, maxBowler: 1, freeHit: true },
    teams: [teamA, teamB],
  };
  const inningsOne = {
    id: randomUUID(),
    matchId: match.id,
    number: 1,
    striker: playerA1.id,
    nonStriker: playerA2.id,
    bowler: playerB1.id,
  };
  const inningsTwo = {
    id: randomUUID(),
    matchId: match.id,
    number: 2,
    striker: playerB1.id,
    nonStriker: playerB2.id,
    bowler: playerA1.id,
  };
  const firstDelivery = {
    id: randomUUID(),
    matchId: match.id,
    inningsId: inningsOne.id,
    seq: 1,
    type: 'delivery',
    bat: 0,
    extra: 'wide',
    extraRuns: 0,
    running: 0,
  };
  const secondDelivery = {
    id: randomUUID(),
    matchId: match.id,
    inningsId: inningsOne.id,
    seq: 2,
    type: 'delivery',
    bat: 4,
    boundary: true,
    extra: 'noBall',
    extraRuns: 0,
    running: 0,
  };
  const thirdDelivery = {
    id: randomUUID(),
    matchId: match.id,
    inningsId: inningsOne.id,
    seq: 3,
    type: 'delivery',
    bat: 1,
    extra: 'none',
    extraRuns: 0,
    running: 1,
  };
  const fourthDelivery = {
    id: randomUUID(),
    matchId: match.id,
    inningsId: inningsOne.id,
    seq: 4,
    type: 'delivery',
    bat: 0,
    extra: 'none',
    extraRuns: 0,
    running: 0,
    wicket: { kind: 'bowled', player: playerA2.id },
  };
  const fifthDelivery = {
    id: randomUUID(),
    matchId: match.id,
    inningsId: inningsTwo.id,
    seq: 5,
    type: 'delivery',
    bat: 4,
    boundary: true,
    extra: 'none',
    extraRuns: 0,
    running: 0,
  };
  const sixthDelivery = {
    id: randomUUID(),
    matchId: match.id,
    inningsId: inningsTwo.id,
    seq: 6,
    type: 'delivery',
    bat: 4,
    boundary: true,
    extra: 'none',
    extraRuns: 0,
    running: 0,
  };
  const completed = {
    ...match,
    status: 'completed',
    syncSnapshot: { innings: 2, events: 6, verified: true },
  };
  const temporaryPlayer = { id: randomUUID(), name: 'Preview tombstone probe' };

  const initialChanges = [
    ...[playerA1, playerA2, playerB1, playerB2].map((player) => change('players', player)),
    change('teams', teamA),
    change('teams', teamB),
    change('matches', match),
    change('players', temporaryPlayer),
  ];
  const pushedInitial = await invoke('/api/sync/push/', {
    method: 'POST',
    jar: jarA,
    headers: { 'X-Crease-Workspace': sessionA.workspaceKey },
    body: { changes: initialChanges },
  });
  if (pushedInitial.applied.length !== initialChanges.length || pushedInitial.rejected.length)
    throw new Error('Browser A initial Preview sync was not fully acknowledged.');

  const historyChanges = [
    change('innings', inningsOne),
    change('innings', inningsTwo),
    change('events', firstDelivery),
    change('events', secondDelivery),
    change('events', thirdDelivery),
    change('events', fourthDelivery),
    change('events', fifthDelivery),
    change('events', sixthDelivery),
  ];
  const pushedHistory = await invoke('/api/sync/push/', {
    method: 'POST',
    jar: jarA,
    headers: { 'X-Crease-Workspace': sessionA.workspaceKey },
    body: { changes: historyChanges },
  });
  if (pushedHistory.applied.length !== historyChanges.length || pushedHistory.rejected.length)
    throw new Error('Browser A innings/event sync was not fully acknowledged.');

  const completeChange = change('matches', completed, 1);
  const completedPush = await invoke('/api/sync/push/', {
    method: 'POST',
    jar: jarA,
    headers: { 'X-Crease-Workspace': sessionA.workspaceKey },
    body: { changes: [completeChange] },
  });
  if (completedPush.applied.length !== 1 || completedPush.rejected.length)
    throw new Error('The Preview server did not verify and acknowledge the completed match.');

  const duplicatePush = await invoke('/api/sync/push/', {
    method: 'POST',
    jar: jarA,
    headers: { 'X-Crease-Workspace': sessionA.workspaceKey },
    body: { changes: historyChanges },
  });
  if (duplicatePush.applied.length !== historyChanges.length || duplicatePush.rejected.length)
    throw new Error('Idempotent retry was not acknowledged.');

  const conflictPush = await invoke('/api/sync/push/', {
    method: 'POST',
    jar: jarA,
    headers: { 'X-Crease-Workspace': sessionA.workspaceKey },
    body: { changes: [change('teams', { ...teamA, name: 'Conflicting stale update' }, 0)] },
  });
  if (conflictPush.applied.length || conflictPush.rejected.length !== 1)
    throw new Error('Stale revision conflict was not preserved.');

  const tombstonePush = await invoke('/api/sync/push/', {
    method: 'POST',
    jar: jarA,
    headers: { 'X-Crease-Workspace': sessionA.workspaceKey },
    body: { changes: [change('players', temporaryPlayer, 1, true)] },
  });
  if (tombstonePush.applied.length !== 1 || tombstonePush.rejected.length)
    throw new Error('Preview tombstone was not acknowledged.');

  const loginC = await invoke('/api/auth/login/', {
    method: 'POST',
    jar: jarC,
    body: { teamId: publicTeamId, password },
  });
  const sessionC = await invoke('/api/auth/me/', { jar: jarC });
  if (!loginC.teamId || sessionC.workspaceKey !== sessionA.workspaceKey)
    throw new Error(
      `Fresh Browser C public-Team-ID login did not resolve the same account (login fields: ${Object.keys(loginC).join(',')}; session fields: ${Object.keys(sessionC).join(',')}).`,
    );
  const loginB = await invoke('/api/auth/login/', {
    method: 'POST',
    jar: jarB,
    body: { teamId: sessionA.workspaceKey, password },
  });
  let sessionB = await invoke('/api/auth/me/', { jar: jarB });
  const immutableAliasLogin = !!loginB.teamId && sessionB.workspaceKey === sessionA.workspaceKey;
  // Continue the sync test with the public alias if the immutable-alias check fails. This gives
  // the report useful cloud-sync coverage while still making the alias failure visible at exit.
  if (!immutableAliasLogin) {
    const publicLoginB = await invoke('/api/auth/login/', {
      method: 'POST',
      jar: jarB,
      body: { teamId: publicTeamId, password },
    });
    sessionB = await invoke('/api/auth/me/', { jar: jarB });
    if (!publicLoginB.teamId || sessionB.workspaceKey !== sessionA.workspaceKey)
      throw new Error(
        'Browser B could not establish the public-alias session for cloud-sync testing.',
      );
  }

  const pulledB = await invoke('/api/sync/pull/?since=1970-01-01T00%3A00%3A00.000Z', {
    jar: jarB,
    headers: { 'X-Crease-Workspace': sessionB.workspaceKey },
  });
  const records = pulledB.records || [];
  const active = records.filter((record) => !record.deletedAt);
  const matchRecord = active.find(
    (record) => record.table === 'matches' && record.recordId === match.id,
  );
  const innings = active.filter(
    (record) => record.table === 'innings' && record.data.matchId === match.id,
  );
  const events = active.filter(
    (record) => record.table === 'events' && record.data.matchId === match.id,
  );
  const state = matchStates(
    matchRecord.data,
    innings.map((record) => record.data),
    events.map((record) => record.data),
  );
  const scorecard = {
    innings: state.map((entry) => ({
      runs: entry.runs,
      wickets: entry.wickets,
      overs: overs(entry.balls),
    })),
    result: matchResult(matchRecord.data, state),
  };
  const uniqueEventIds = new Set(events.map((record) => record.recordId));
  if (
    events.length !== 6 ||
    uniqueEventIds.size !== 6 ||
    scorecard.innings[0]?.runs !== 7 ||
    scorecard.innings[0]?.wickets !== 1 ||
    scorecard.innings[1]?.runs !== 8
  )
    throw new Error('Browser B did not receive the exact verified match history.');

  console.log(
    JSON.stringify(
      {
        mode: 'protected Preview HTTP integration',
        account: { publicTeamId, immutableWorkspaceKeyVerified: immutableAliasLogin },
        browserA: { acknowledged: initialChanges.length + historyChanges.length + 2 },
        browserB: {
          recordCounts: counts(records),
          matchEvents: events.length,
          uniqueEventIds: uniqueEventIds.size,
        },
        browserC: { freshLoginAndWorkspacePullReady: true },
        scorecard,
        scenarios: {
          publicAliasLogin: true,
          immutableAliasLogin,
          completedHistoryVerified: true,
          repeatedUploadIdempotent: true,
          staleRevisionConflictPreserved: true,
          deletionTombstoneAcknowledged: true,
          previewIsolationVerified: true,
        },
        limitations: [
          'This uses independent protected HTTP cookie jars, not installed browser profiles.',
          'Offline IndexedDB, backup import UI, and service-worker update retention require separate browser/device validation.',
        ],
      },
      null,
      2,
    ),
  );
  if (!immutableAliasLogin) {
    process.exitCode = 2;
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

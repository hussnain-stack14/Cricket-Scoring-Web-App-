/*
 * Read-only comparison of two exported Crease sync diagnostic JSON files.
 * It deliberately compares only diagnostic metadata/fingerprints, never record payloads.
 *
 * npm run compare:sync-diagnostics -- <browser-a.json> <browser-b.json>
 */
import { readFile } from 'node:fs/promises';

function mustDiagnostic(value, label) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.operations))
    throw new Error(`${label} is not a Crease sync diagnostic export.`);
  return value;
}

function operationMap(report) {
  return new Map(
    report.operations
      .filter((operation) => typeof operation.recordFingerprint === 'string')
      .map((operation) => [operation.recordFingerprint, operation]),
  );
}

function summary(report) {
  return {
    accountKey: report.accountKey || null,
    workspaceId: report.workspaceId || null,
    pending: Number(report.pending || 0),
    pendingByType: report.pendingByType || {},
    queueWindow: report.queueWindow || {},
    upload: report.upload || {},
    cursor: report.cursor || {},
    conflictCount: Number(report.conflictCount || report.conflicts?.length || 0),
    lastError: report.lastError || null,
  };
}

function comparable(operation) {
  return {
    recordId: operation.recordId || null,
    recordType: operation.recordType,
    operationType: operation.operationType,
    status: operation.status,
    baseRevision: operation.baseRevision,
    queuedAt: operation.queuedAt,
    failureReason: operation.failureReason || null,
  };
}

export function compareDiagnostics(leftInput, rightInput) {
  const left = mustDiagnostic(leftInput, 'First file');
  const right = mustDiagnostic(rightInput, 'Second file');
  const leftOps = operationMap(left);
  const rightOps = operationMap(right);
  const common = [];
  const leftOnly = [];
  const rightOnly = [];
  const revisionDisagreements = [];

  for (const [fingerprint, operation] of leftOps) {
    const other = rightOps.get(fingerprint);
    if (!other) leftOnly.push({ fingerprint, ...comparable(operation) });
    else {
      common.push(fingerprint);
      if (
        operation.baseRevision !== other.baseRevision ||
        operation.operationType !== other.operationType ||
        operation.status !== other.status
      )
        revisionDisagreements.push({
          fingerprint,
          first: comparable(operation),
          second: comparable(other),
        });
    }
  }
  for (const [fingerprint, operation] of rightOps)
    if (!leftOps.has(fingerprint)) rightOnly.push({ fingerprint, ...comparable(operation) });

  const blocked = (report) =>
    report.operations
      .filter((operation) => ['rejected', 'conflict'].includes(operation.status))
      .map((operation) => ({
        fingerprint: operation.recordFingerprint || null,
        ...comparable(operation),
      }));
  const tombstones = (report) =>
    report.operations
      .filter((operation) => operation.operationType === 'delete')
      .map((operation) => ({
        fingerprint: operation.recordFingerprint || null,
        ...comparable(operation),
      }));
  const cloudConflicts = (report) => report.conflicts || [];

  const canCompare = left.diagnosticSchema >= 2 && right.diagnosticSchema >= 2;
  return {
    mode: 'read-only Crease sync diagnostic comparison',
    comparable: canCompare,
    accountIdentity: {
      first: left.accountKey || null,
      second: right.accountKey || null,
      matches: !!left.accountKey && left.accountKey === right.accountKey,
      note: 'Workspace IDs may differ between devices; account keys must match.',
    },
    first: summary(left),
    second: summary(right),
    pendingOperations: {
      shared: common.length,
      uniqueToFirst: leftOnly,
      uniqueToSecond: rightOnly,
      revisionOrStatusDisagreements: revisionDisagreements,
    },
    blockedOperations: { first: blocked(left), second: blocked(right) },
    tombstones: { first: tombstones(left), second: tombstones(right) },
    cloudConflicts: { first: cloudConflicts(left), second: cloudConflicts(right) },
    stuckUploadSignals: {
      first: {
        pending: left.pending,
        lastAttempt: left.upload?.lastAttempt || null,
        httpStatus: left.upload?.lastHttpStatus || null,
        error: left.lastError || null,
      },
      second: {
        pending: right.pending,
        lastAttempt: right.upload?.lastAttempt || null,
        httpStatus: right.upload?.lastHttpStatus || null,
        error: right.lastError || null,
      },
    },
    notes: [
      ...(!canCompare
        ? [
            'At least one export predates schema 2; unique-operation comparison is unavailable. Export again after the diagnostic release.',
          ]
        : []),
      'This comparison is read-only and does not resolve conflicts, clear queues, or upload records.',
    ],
  };
}

async function main() {
  const [firstPath, secondPath] = process.argv.slice(2);
  if (!firstPath || !secondPath)
    throw new Error(
      'Usage: node scripts/compare-sync-diagnostics.mjs <browser-a.json> <browser-b.json>',
    );
  const [firstText, secondText] = await Promise.all([
    readFile(firstPath, 'utf8'),
    readFile(secondPath, 'utf8'),
  ]);
  const result = compareDiagnostics(JSON.parse(firstText), JSON.parse(secondText));
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}`) main();

import { validateMatchStart } from '../lib/matchLifecycle.js';

export function isConsumedDraft(change, match, existing) {
  const { table, recordId, data, deleted } = change ?? {};
  return (
    table === 'drafts' &&
    deleted === true &&
    typeof data?.consumedByMatchId === 'string' &&
    !!match &&
    match.data?.sourceDraftId === recordId &&
    match.data?.teams?.[0]?.id === data.teamA &&
    match.data?.teams?.[1]?.id === data.teamB &&
    (!existing || (existing.data?.teamA === data.teamA && existing.data?.teamB === data.teamB))
  );
}

export function syncPolicyError(
  { table, deleted, data },
  existing,
  role,
  { consumedDraft = false } = {},
) {
  if (!['owner', 'scorer'].includes(role)) return 'Viewers cannot push changes.';
  if (
    deleted &&
    ['matches', 'players', 'teams', 'drafts', 'memberships'].includes(table) &&
    role !== 'owner' &&
    !(table === 'drafts' && consumedDraft)
  )
    return 'Only the account owner can delete these records.';
  if (
    ['players', 'teams'].includes(table) &&
    !!existing?.data?.archived !== !!data.archived &&
    role !== 'owner'
  )
    return 'Only the account owner can archive records.';
  if (data.deletedAt && !deleted) return 'Deletion must use an explicit tombstone.';
  if (existing?.deletedAt && !deleted)
    return 'Deleted records cannot be restored by a stale device.';
  if (!deleted && table === 'matches') {
    if (existing?.data?.startId && data.startId !== existing.data.startId)
      return 'Another device already started this match. Keep both local records for review; the accepted start cannot be replaced.';
    if (existing?.data?.status === 'live' && data.status === 'upcoming')
      return 'A live match cannot return to pre-match setup.';
    if (existing?.data?.status === 'completed' && data.status !== 'completed' && role !== 'owner')
      return 'Only an owner can reopen a completed match.';
    if (
      ['live', 'completed'].includes(data.status) &&
      (existing?.data?.status === 'upcoming' || (!existing && data.startDetails))
    ) {
      try {
        const verified = validateMatchStart(
          {
            ...data,
            scheduledAt: existing?.data?.scheduledAt || data.scheduledAt,
            rules: existing?.data?.rules || data.rules,
          },
          data.startDetails,
          { role, earlyOverride: data.startDetails?.earlyOverride === true },
        );
        if (data.firstBat !== verified.firstBat)
          return 'The batting side must agree with the toss.';
      } catch (error) {
        return error.message;
      }
    }
  }
  return null;
}

export function syncPolicyError({ table, deleted, data }, existing, role) {
  if (!['owner', 'scorer'].includes(role)) return 'Viewers cannot push changes.';
  if (
    deleted &&
    ['matches', 'players', 'teams', 'drafts', 'memberships'].includes(table) &&
    role !== 'owner'
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
  return null;
}

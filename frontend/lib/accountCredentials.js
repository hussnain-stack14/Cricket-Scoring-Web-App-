export const RESERVED_TEAM_IDS = new Set([
  'ADMIN',
  'HELP',
  'NULL',
  'ROOT',
  'SUPPORT',
  'SYSTEM',
  'TEST',
  'CRS-ADMIN',
  'CRS-HELP',
  'CRS-NULL',
  'CRS-ROOT',
  'CRS-SUPPORT',
  'CRS-SYSTEM',
  'CRS-TEST',
]);

export function normalizeLoginTeamId(value) {
  return value.trim().toUpperCase();
}

export function isValidLoginTeamId(value) {
  return /^[A-Z0-9_-]{4,24}$/.test(value) && !RESERVED_TEAM_IDS.has(value);
}

// Workspace keys are generated UUIDs, not public Team IDs. They are accepted only as a
// sign-in alias for the owning account and are normalized to their stored canonical form.
const UUID_WORKSPACE_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeLoginIdentifier(value) {
  const trimmed = value.trim();
  return UUID_WORKSPACE_KEY.test(trimmed) ? trimmed.toLowerCase() : normalizeLoginTeamId(trimmed);
}

export function isValidLoginIdentifier(value) {
  return UUID_WORKSPACE_KEY.test(value) || isValidLoginTeamId(value);
}

export function isSessionVersionCurrent(sessionVersion, accountVersion) {
  return Number(sessionVersion ?? 0) === Number(accountVersion ?? 0);
}

export function passwordValidationError(password) {
  if (password.length < 8 || password.length > 128)
    return 'New password must be between 8 and 128 characters.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    return 'New password must contain at least one letter and one number.';
  return null;
}

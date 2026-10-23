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

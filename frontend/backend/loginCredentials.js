const DUMMY_PASSWORD_HASH = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

export function loginAccountFilter(normalizedTeamId) {
  // Keep the immutable cloud partition usable as a sign-in alias after a team changes its
  // public-facing ID. Public IDs are normalized to upper case, whereas UUID partition keys
  // created for newer accounts are stored in canonical lower case. Password verification is
  // still required before a session is issued.
  const workspaceKey = normalizedTeamId.toLowerCase();
  const aliases = [{ loginTeamId: normalizedTeamId }, { teamId: normalizedTeamId }];
  if (workspaceKey !== normalizedTeamId) aliases.push({ teamId: workspaceKey });
  return { $or: aliases };
}

export function loginLockKeys(normalizedTeamId, account) {
  return [...new Set([normalizedTeamId, account?.teamId].filter(Boolean))];
}

export async function resolveLoginAccount(model, normalizedTeamId) {
  // A public alias must resolve to exactly one account. Separate Mongo unique indexes cannot
  // prevent a legacy public ID from colliding with another account's immutable key.
  const matches = await model.find(loginAccountFilter(normalizedTeamId)).limit(2);
  return matches.length === 1 ? matches[0] : null;
}

export async function verifyLoginCredentials(account, password, comparePassword) {
  const hash = account?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const matches = await comparePassword(password, hash);
  return !!account && matches;
}

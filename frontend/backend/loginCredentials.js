const DUMMY_PASSWORD_HASH = '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';

export async function verifyLoginCredentials(account, password, comparePassword) {
  const hash = account?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const matches = await comparePassword(password, hash);
  return !!account && matches;
}

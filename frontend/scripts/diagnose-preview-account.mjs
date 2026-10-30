/* Read-only Preview-only account alias diagnostic. Never prints connection details or hashes. */
import { MongoClient } from 'mongodb';

const loginTeamId = process.argv[2]?.trim().toUpperCase();
if (!/^[A-Z0-9_-]{4,24}$/.test(loginTeamId || ''))
  throw new Error('Provide a valid public Preview Team ID.');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const db = client.db();
  const account = await db.collection('teamAccounts').findOne(
    { loginTeamId },
    { projection: { _id: 0, teamId: 1, loginTeamId: 1, authVersion: 1 } },
  );
  if (!account) throw new Error('Preview test account was not found.');
  const upper = account.teamId.toUpperCase();
  const lower = account.teamId.toLowerCase();
  const upperMatchCount = await db.collection('teamAccounts').countDocuments({ teamId: upper });
  const lowerMatchCount = await db.collection('teamAccounts').countDocuments({ teamId: lower });
  console.log(
    JSON.stringify({
      database: db.databaseName,
      account,
      canonicalWorkspaceKeyIsLowercase: account.teamId === lower,
      exactUppercaseWorkspaceKeyMatches: upperMatchCount,
      exactLowercaseWorkspaceKeyMatches: lowerMatchCount,
    }),
  );
} finally {
  await client.close();
}

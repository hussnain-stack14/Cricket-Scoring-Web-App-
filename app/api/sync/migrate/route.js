import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { connectDB } from '../../../../lib/server/db';
import { SyncRecord } from '../../../../lib/server/models';
import { sessionOptions } from '../../../../lib/server/session';
import { validateBackup } from '../../../../lib/db';

/**
 * POST /api/sync/migrate
 * Body: { backup: <full Crease backup JSON> }
 *
 * Bulk-uploads existing local data after account creation/login.
 * Requires owner role.
 * The backup is validated by the existing validateBackup() function before any writes.
 * Existing server records are NOT overwritten if they have a higher revision.
 */
export async function POST(req) {
  const res = NextResponse.json(null);
  const session = await getIronSession(req, res, sessionOptions);

  if (!session.teamId) {
    return NextResponse.json({ error: 'Sign in to migrate your data.' }, { status: 401 });
  }
  if (session.role !== 'owner') {
    return NextResponse.json({ error: 'Only team owners can migrate data.' }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Validate backup structure using existing engine (reuse battle-tested code)
  let backup;
  try {
    backup = validateBackup(body?.backup);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid backup: ${err.message}` },
      { status: 400 },
    );
  }

  const tables = ['players', 'teams', 'memberships', 'matches', 'innings', 'events', 'audits', 'drafts'];

  await connectDB();

  const results = { imported: 0, skipped: 0 };

  for (const table of tables) {
    const records = backup[table] ?? [];
    for (const record of records) {
      const existing = await SyncRecord.findOne({
        teamId: session.teamId,
        table,
        recordId: record.id,
      });

      if (existing && existing.revision > 0) {
        // Don't overwrite server data that's been synced and may be newer
        results.skipped++;
        continue;
      }

      // Strip the old workspaceId from the data — on the server, teamId is the namespace
      const { workspaceId: _w, ...cleanData } = record;
      await SyncRecord.findOneAndUpdate(
        { teamId: session.teamId, table, recordId: record.id },
        {
          data: { ...cleanData, workspaceId: backup.workspace.id }, // preserve for client replay
          revision: 1,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );
      results.imported++;
    }
  }

  return NextResponse.json({
    ok: true,
    imported: results.imported,
    skipped: results.skipped,
    migratedAt: new Date().toISOString(),
  });
}

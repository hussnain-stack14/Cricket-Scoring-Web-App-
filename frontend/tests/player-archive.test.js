import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  db,
  createWorkspace,
  saveRecord,
  saveTeam,
  createMatch,
  deleteRecord,
  all,
} from '../lib/db.js';

test('archiving a historical player preserves frozen squads and memberships while hiding active identity', async () => {
  await db.delete();
  await db.open();
  const w = await createWorkspace('Scorer');
  const player = await saveRecord(w.id, 'players', { name: 'Captain' });
  const teamA = await saveRecord(w.id, 'teams', { name: 'A' });
  const teamB = await saveRecord(w.id, 'teams', { name: 'B' });
  await saveTeam(w.id, teamA, [player.id]);
  const match = await createMatch(w.id, {
    teams: [
      { ...teamA, squad: [player] },
      { ...teamB, squad: [] },
    ],
    rules: w.rules,
    date: '2026-10-24',
    firstBat: 0,
  });
  await saveRecord(w.id, 'players', { ...player, archived: true });
  const data = await all(w.id);
  assert.equal(data.players.filter((p) => !p.archived).length, 0);
  assert.equal(data.matches[0].teams[0].squad[0].name, 'Captain');
  assert.equal(data.matches[0].id, match.id);
  assert.equal(data.memberships.length, 1);
  await assert.rejects(deleteRecord(w.id, 'players', player.id), /match history/);
});

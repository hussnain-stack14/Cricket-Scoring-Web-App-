import test from 'node:test';
import assert from 'node:assert/strict';
import { loginAttempt, LOGIN_LOCK_MS, lockedResponse } from '../backend/loginAttempts.js';
import { normalizeLoginTeamId } from '../lib/accountCredentials.js';

// Independent service callers share this atomic persistence adapter. Mongo integration
// remains a separate deployment check; this verifies the CAS retry protocol.
function sharedStore() {
  const records = new Map();
  return {
    findById(id) {
      return { lean: async () => structuredClone(records.get(id)) };
    },
    async create(value) {
      if (records.has(value._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      records.set(value._id, structuredClone(value));
    },
    async updateOne(filter, update) {
      const value = records.get(filter._id);
      if (value.revision !== filter.revision) return { modifiedCount: 0 };
      records.set(filter._id, { ...value, ...update.$set, revision: value.revision + 1 });
      return { modifiedCount: 1 };
    },
  };
}
test('seven failures lock for ten minutes; normalized identity shares the lock', async () => {
  const model = sharedStore();
  const now = 1000;
  for (let i = 1; i <= 6; i++)
    assert.equal(
      (await loginAttempt(normalizeLoginTeamId(' team-one '), false, { model, now })).blocked,
      false,
    );
  assert.deepEqual(await loginAttempt('TEAM-ONE', false, { model, now }), {
    blocked: true,
    retryAfter: 600,
  });
  assert.equal(
    (await loginAttempt('TEAM-ONE', true, { model, now: now + LOGIN_LOCK_MS - 1 })).blocked,
    true,
  );
  assert.equal(
    (await loginAttempt('TEAM-ONE', false, { model, now: now + LOGIN_LOCK_MS })).blocked,
    false,
  );
  const response = lockedResponse(600);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '600');
});
test('successful authentication resets consecutive failures', async () => {
  const model = sharedStore();
  const options = { model, now: 100 };
  for (let i = 0; i < 6; i++) await loginAttempt('TEAM', false, options);
  await loginAttempt('TEAM', true, options);
  for (let i = 0; i < 6; i++)
    assert.equal((await loginAttempt('TEAM', false, options)).blocked, false);
  assert.equal((await loginAttempt('TEAM', false, options)).blocked, true);
});
test('simultaneous failed attempts cannot lose increments or bypass a shared lock', async () => {
  const model = sharedStore();
  const services = Array.from(
    { length: 14 },
    () => (success) => loginAttempt('TEAM', success, { model, now: 100 }),
  );
  const results = await Promise.all(services.map((service) => service(false)));
  assert.equal(results.filter((r) => !r.blocked).length, 6);
  assert.equal((await services[0](true)).blocked, true);
  assert.equal((await loginAttempt('TEAM', undefined, { model, now: 101 })).blocked, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSessionVersionCurrent,
  isValidLoginIdentifier,
  isValidLoginTeamId,
  normalizeLoginIdentifier,
  normalizeLoginTeamId,
  passwordValidationError,
} from '../lib/accountCredentials.js';
import {
  loginAccountFilter,
  loginLockKeys,
  resolveLoginAccount,
  verifyLoginCredentials,
} from '../backend/loginCredentials.js';

test('login credential verification accepts a matching account and rejects wrong or unknown accounts', async () => {
  const compareCalls = [];
  const compare = async (password, hash) => {
    compareCalls.push({ password, hash });
    return password === 'valid-password' && hash === 'account-hash';
  };
  assert.equal(
    await verifyLoginCredentials({ passwordHash: 'account-hash' }, 'valid-password', compare),
    true,
  );
  assert.equal(
    await verifyLoginCredentials({ passwordHash: 'account-hash' }, 'wrong-password', compare),
    false,
  );
  assert.equal(await verifyLoginCredentials(null, 'wrong-password', compare), false);
  assert.notEqual(compareCalls[2].hash, 'account-hash');
});

test('Team ID normalization and validation accept safe IDs and reject reserved or malformed IDs', () => {
  assert.equal(normalizeLoginTeamId(' crs-youngs01 '), 'CRS-YOUNGS01');
  assert.equal(normalizeLoginTeamId(' RoyalClub '), 'ROYALCLUB');
  assert.equal(
    normalizeLoginIdentifier(' BF8F4C4B-4E78-42A6-80D7-B4B40796E80D '),
    'bf8f4c4b-4e78-42a6-80d7-b4b40796e80d',
  );
  assert.equal(isValidLoginTeamId('CRS-YOUNGS01'), true);
  assert.equal(isValidLoginTeamId('CRS-123456'), true);
  assert.equal(isValidLoginTeamId('ROYALCLUB202'), true);
  assert.equal(isValidLoginTeamId('TEAM_786'), true);
  assert.equal(isValidLoginTeamId('ROYAL-CLUB'), true);
  assert.equal(isValidLoginTeamId('ABCD'), true);
  assert.equal(isValidLoginTeamId('CRS-ADMIN'), false);
  assert.equal(isValidLoginTeamId('ROOT'), false);
  assert.equal(isValidLoginTeamId('ABC'), false);
  assert.equal(isValidLoginTeamId('A'.repeat(25)), false);
  assert.equal(isValidLoginTeamId('WITH SPACE'), false);
  assert.equal(isValidLoginTeamId('CRS-ÉQUIPE'), false);
});

test('UUID workspace aliases are accepted only in canonical UUID format', () => {
  assert.equal(isValidLoginIdentifier('bf8f4c4b-4e78-42a6-80d7-b4b40796e80d'), true);
  assert.equal(isValidLoginIdentifier('BF8F4C4B-4E78-42A6-80D7-B4B40796E80D'), true);
  assert.equal(isValidLoginIdentifier('bf8f4c4b-4e78-42a6-70d7-b4b40796e80d'), false);
  assert.equal(isValidLoginIdentifier('not-a-workspace-key'), false);
});

test('login accepts the public ID or immutable cloud workspace key as authenticated aliases', () => {
  assert.deepEqual(loginAccountFilter('CRS-353209'), {
    $or: [{ loginTeamId: 'CRS-353209' }, { teamId: 'CRS-353209' }, { teamId: 'crs-353209' }],
  });
  assert.deepEqual(loginLockKeys('ROYAL-CLUB-202', { teamId: 'CRS-353209' }), [
    'ROYAL-CLUB-202',
    'CRS-353209',
  ]);
  assert.deepEqual(loginLockKeys('CRS-353209', { teamId: 'CRS-353209' }), ['CRS-353209']);
});

test('an immutable lowercase UUID workspace key remains a login alias after normalization', async () => {
  const account = {
    teamId: 'bf8f4c4b-4e78-42a6-80d7-b4b40796e80d',
    loginTeamId: 'PREVIEW-SYNC',
  };
  const model = {
    find: (filter) => ({
      limit: async () =>
        filter.$or.some((item) => item.teamId === account.teamId) ? [account] : [],
    }),
  };
  assert.equal(await resolveLoginAccount(model, 'BF8F4C4B-4E78-42A6-80D7-B4B40796E80D'), account);
});

test('both login aliases resolve one account while ambiguous aliases fail closed', async () => {
  const account = { teamId: 'CRS-353209', loginTeamId: 'ROYAL-CLUB-202' };
  const model = {
    find: (filter) => ({
      limit: async () =>
        filter.$or.some(
          (item) => item.teamId === account.teamId || item.loginTeamId === account.loginTeamId,
        )
          ? [account]
          : [],
    }),
  };
  assert.equal(await resolveLoginAccount(model, 'CRS-353209'), account);
  assert.equal(await resolveLoginAccount(model, 'ROYAL-CLUB-202'), account);
  assert.equal(
    await resolveLoginAccount(
      { find: () => ({ limit: async () => [account, { teamId: 'other' }] }) },
      'CRS-353209',
    ),
    null,
  );
});

test('password validation enforces length and letter/number requirements', () => {
  assert.equal(passwordValidationError('Crease123'), null);
  assert.match(passwordValidationError('short1'), /8 and 128/);
  assert.match(passwordValidationError('lettersOnly'), /letter and one number/);
  assert.match(passwordValidationError('12345678'), /letter and one number/);
  assert.match(passwordValidationError('x'.repeat(129) + '1'), /8 and 128/);
});

test('password change increments the session version and invalidates older sessions', () => {
  assert.equal(isSessionVersionCurrent(undefined, 0), true);
  assert.equal(isSessionVersionCurrent(4, 4), true);
  assert.equal(isSessionVersionCurrent(4, 5), false);
  assert.equal(isSessionVersionCurrent(undefined, 1), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSessionVersionCurrent,
  isValidLoginTeamId,
  normalizeLoginTeamId,
  passwordValidationError,
} from '../lib/accountCredentials.js';
import { verifyLoginCredentials } from '../backend/loginCredentials.js';

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

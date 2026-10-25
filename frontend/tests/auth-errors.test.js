import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticationServiceFailure } from '../backend/authErrors.js';

test('missing MongoDB configuration is a safe actionable service-unavailable diagnostic', () => {
  assert.deepEqual(
    authenticationServiceFailure(
      new Error(
        'MONGODB_URI environment variable is not set. Add it to .env.local for development.',
      ),
    ),
    {
      status: 503,
      error:
        'MongoDB is not configured. Set MONGODB_URI in frontend/.env.local and restart the development server.',
    },
  );
});

test('MongoDB connectivity and session configuration failures remain server errors, not bad credentials', () => {
  assert.equal(
    authenticationServiceFailure(
      Object.assign(new Error('no connection details'), {
        name: 'MongooseServerSelectionError',
      }),
    ).status,
    503,
  );
  assert.match(
    authenticationServiceFailure(new Error('SESSION_SECRET must be configured')).error,
    /SESSION_SECRET/,
  );
  assert.equal(authenticationServiceFailure(new Error('database query failed')).status, 500);
  assert.notEqual(authenticationServiceFailure(new Error('database query failed')).status, 401);
});

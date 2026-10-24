import { createHash } from 'node:crypto';
import { LoginAttempt } from './models.js';

export const LOGIN_LIMIT = 7;
export const LOGIN_LOCK_MS = 10 * 60 * 1000;
export const attemptKey = (identifier) => createHash('sha256').update(identifier).digest('hex');

// Compare-and-swap serializes results across instances, including success/failure races.
// No TTL: consecutive failures must not disappear before a success or lock expiry.
export async function loginAttempt(
  identifier,
  success,
  { model = LoginAttempt, now = Date.now() } = {},
) {
  const _id = attemptKey(identifier);
  for (;;) {
    let state = await model.findById(_id).lean();
    if (!state) {
      try {
        await model.create({ _id, failures: 0, lockedUntil: 0, revision: 0 });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
      continue;
    }
    if (state.lockedUntil > now)
      return { blocked: true, retryAfter: Math.ceil((state.lockedUntil - now) / 1000) };
    if (success === undefined) return { blocked: false };
    const failures = success ? 0 : (state.lockedUntil ? 0 : state.failures) + 1;
    const lockedUntil = failures >= LOGIN_LIMIT ? now + LOGIN_LOCK_MS : 0;
    const updated = await model.updateOne(
      { _id, revision: state.revision },
      {
        $set: { failures, lockedUntil },
        $inc: { revision: 1 },
      },
    );
    if (updated.modifiedCount === 1)
      return { blocked: !!lockedUntil, retryAfter: lockedUntil ? LOGIN_LOCK_MS / 1000 : 0 };
  }
}

export function lockedResponse(retryAfter) {
  return Response.json(
    { error: 'Sign in temporarily unavailable. Please try again when the timer ends.', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
  );
}

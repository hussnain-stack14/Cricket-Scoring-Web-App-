import { createHash } from 'node:crypto';
import { connectDB, getSafeErrorDetails } from './db.js';
import { RateLimit } from './models.js';
import { authenticationServiceFailure } from './authErrors.js';
export const loginLimiter = { name: 'login-ip', points: 40, duration: 600 };
export const registerLimiter = { name: 'register-ip', points: 5, duration: 3600 };
export const accountSecurityIpLimiter = { name: 'security-ip', points: 8, duration: 900 };
export const accountSecurityAccountLimiter = { name: 'security-account', points: 8, duration: 900 };
export const recoveryAccountLimiter = { name: 'recovery-account', points: 5, duration: 3600 };
export const resetIpLimiter = { name: 'reset-ip', points: 20, duration: 900 };
export const resetAccountLimiter = { name: 'reset-account', points: 8, duration: 900 };
export async function checkRateLimit(limiter, key) {
  try {
    await connectDB();
    const now = Date.now();
    const window = Math.floor(now / (limiter.duration * 1000));
    const expiresAt = new Date((window + 1) * limiter.duration * 1000);
    const _id = createHash('sha256').update([limiter.name, key, window].join(':')).digest('hex');
    let record;
    try {
      record = await RateLimit.findOneAndUpdate(
        { _id },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, new: true },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      record = await RateLimit.findOneAndUpdate({ _id }, { $inc: { count: 1 } }, { new: true });
    }
    if (record.count <= limiter.points) return null;
    const retryAfter = Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000));
    return Response.json(
      { error: 'Too many attempts. Please wait before trying again.', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  } catch (error) {
    console.error('Authentication rate limit check failed:', getSafeErrorDetails(error));
    const failure = authenticationServiceFailure(error);
    return Response.json({ error: failure.error }, { status: failure.status });
  }
}
export function getClientIp(req) {
  // Vercel overwrites this header. Other ingress proxies must sanitize X-Forwarded-For.
  const header = process.env.VERCEL ? 'x-vercel-forwarded-for' : 'x-forwarded-for';
  return req.headers.get(header)?.split(',')[0]?.trim() || 'unknown';
}

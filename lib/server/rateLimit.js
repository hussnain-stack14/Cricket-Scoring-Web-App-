import { RateLimiterMemory } from 'rate-limiter-flexible';

/**
 * Login rate limiter: 10 attempts per IP per 15 minutes.
 * In-memory — resets per serverless function instance cold start.
 */
export const loginLimiter = new RateLimiterMemory({
  points: 10,
  duration: 15 * 60, // 15 minutes
  blockDuration: 15 * 60, // block for the same window
});

/**
 * Registration rate limiter: 5 accounts per IP per hour.
 */
export const registerLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60 * 60, // 1 hour
});

/**
 * Try to consume a rate-limit point.
 * Returns a 429 Response if the limit is exceeded, null otherwise.
 *
 * @param {RateLimiterMemory} limiter
 * @param {string} key  Usually the client IP
 * @returns {Response|null}
 */
export async function checkRateLimit(limiter, key) {
  try {
    await limiter.consume(key);
    return null; // OK
  } catch {
    return new Response(
      JSON.stringify({ error: 'Too many attempts. Please wait before trying again.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

/**
 * Extract the best available IP from a Next.js App Router request.
 */
export function getClientIp(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

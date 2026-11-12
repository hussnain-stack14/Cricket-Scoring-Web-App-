export const DEFAULT_REQUEST_TIMEOUT_MS = Number.parseInt(
  process.env.NEXT_PUBLIC_REQUEST_TIMEOUT_MS ?? process.env.NEXT_PUBLIC_SYNC_TIMEOUT_MS ?? '15000',
  10,
) || 15000;

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      const timeoutError = new Error(`Request timed out after ${timeoutMs} ms.`);
      timeoutError.name = 'TimeoutError';
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
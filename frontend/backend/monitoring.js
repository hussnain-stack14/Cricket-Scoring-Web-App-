// Privacy-conscious operational events for Vercel/server logs. Never pass record payloads,
// account IDs, tokens, IP addresses, or exception stacks to this helper.
export function reportOperationalEvent(event, details = {}) {
  if (process.env.NODE_ENV === 'test') return;
  const safe = {};
  for (const key of ['status', 'count', 'tables', 'reason', 'code']) {
    if (details[key] !== undefined) safe[key] = details[key];
  }
  console.info(JSON.stringify({ service: 'crease', event, at: new Date().toISOString(), ...safe }));
}

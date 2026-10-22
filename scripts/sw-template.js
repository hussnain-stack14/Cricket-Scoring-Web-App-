/* Generated after static export: every exported HTML, route payload, JS, CSS and icon. */
const CACHE = 'crease-__VERSION__';
const FILES = __FILES__;
async function notify(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}
async function fill() {
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(
      FILES.map(async (path) => {
        const response = await fetch(new Request(path, { cache: 'reload' }));
        if (!response.ok) throw new Error(`Precache failed: ${path} (${response.status})`);
        await cache.put(path, response);
      }),
    );
  } catch (error) {
    await notify({ type: 'PRECACHE_FAILED', message: error.message });
    throw error;
  }
}
async function verify() {
  const cache = await caches.open(CACHE);
  const results = await Promise.all(FILES.map((path) => cache.match(path)));
  return { ready: results.every(Boolean), missing: results.filter((result) => !result).length };
}
self.addEventListener('install', (event) => {
  event.waitUntil(fill());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (!(await verify()).ready) throw new Error('Incomplete precache');
      await self.clients.claim(); /* Retain older immutable assets for open tabs. Never touch IndexedDB. */
    })(),
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'VERIFY')
    event.waitUntil(verify().then((result) => event.ports[0]?.postMessage(result)));
  if (event.data?.type === 'REPAIR')
    event.waitUntil(
      fill()
        .then(verify)
        .then((result) => event.ports[0]?.postMessage(result))
        .catch((error) => event.ports[0]?.postMessage({ ready: false, message: error.message })),
    );
  if (event.data?.type === 'ACTIVATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin)
    return;
  event.respondWith(
    (async () => {
      const url = new URL(event.request.url);
      const cache = await caches.open(CACHE);
      if (event.request.mode === 'navigate') {
        const path = url.pathname.endsWith('/')
          ? `${url.pathname}index.html`
          : url.pathname.endsWith('.html')
            ? url.pathname
            : `${url.pathname}/index.html`;
        return (await cache.match(path)) || (await fetch(event.request));
      }
      const cached = await cache.match(url.pathname);
      if (cached) return cached;
      const previous = await caches.match(url.pathname);
      if (previous) return previous;
      return fetch(event.request);
    })(),
  );
});

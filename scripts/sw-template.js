/* Generated after static export: every exported HTML, route payload, JS, CSS and icon. */
const CACHE = 'crease-__VERSION__';
const FILES = __FILES__;
async function fill() {
  const cache = await caches.open(CACHE);
  // A failed fetch rejects installation. No incomplete build can activate.
  await Promise.all(
    FILES.map(async (path) => {
      const response = await fetch(new Request(path, { cache: 'reload' }));
      if (!response.ok) throw new Error(`Precache failed: ${path}`);
      await cache.put(path, response);
    }),
  );
}
async function verify() {
  const cache = await caches.open(CACHE);
  const results = await Promise.all(FILES.map((path) => cache.match(path)));
  return results.every(Boolean);
}
self.addEventListener('install', (event) => {
  event.waitUntil(fill());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (!(await verify())) throw new Error('Incomplete precache');
      await self.clients.claim(); /* Retain older immutable assets for open tabs. Never touch IndexedDB. */
    })(),
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'VERIFY')
    event.waitUntil(verify().then((ready) => event.ports[0]?.postMessage({ ready })));
  if (event.data?.type === 'REPAIR')
    event.waitUntil(
      fill()
        .then(() => event.ports[0]?.postMessage({ ready: true }))
        .catch(() => event.ports[0]?.postMessage({ ready: false })),
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

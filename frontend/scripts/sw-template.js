/* Generated after a Next.js production build with its routes and static assets. */
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
      await Promise.all((await caches.keys()).filter((key) => key.startsWith('crease-') && key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim(); // Never touches IndexedDB; the new worker owns only its versioned Cache Storage.
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
  const url = new URL(event.request.url);
  // Never intercept or cache non-GET requests, cross-origin requests, API calls, or account auth pages
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/account/')
  ) {
    return;
  }
  event.respondWith(
    (async () => {
      // Flight responses are not HTML documents. Let Next handle an offline
      // navigation fallback instead of returning cached HTML as component data.
      if (event.request.headers.get('RSC') === '1' || url.searchParams.has('_rsc'))
        return fetch(event.request);
      const cache = await caches.open(CACHE);
      if (event.request.mode === 'navigate') {
        const path =
          url.pathname === '/' || url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
        return (await cache.match(path)) || (await fetch(event.request));
      }
      const cached = await cache.match(url.pathname);
      return cached || fetch(event.request);
    })(),
  );
});

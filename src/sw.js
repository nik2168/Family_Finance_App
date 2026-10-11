// Keeps the app files on the phone so it opens with no network.
// Opens from cache instantly, then refreshes the cache in the background: a new deploy shows on the next open.
// ponytail: files refresh one by one, so a single open can mix old and new files if one download fails mid-way; add versioned file names if that ever bites.
var CACHE = 'family-money';
var FILES = ['./', 'index.html', 'app.js', 'shared.js', 'manifest.json', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  'assets/fonts/lexend-latin.woff2', 'assets/fonts/lexend-latin-ext.woff2'].concat(
  ['bag', 'bank', 'check', 'crops', 'dairy', 'farmer', 'house', 'job', 'others', 'up', 'warn', 'wave', 'wings'].map(function (n) { return 'assets/3d/' + n + '.png'; }));

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // sync calls go straight to Google
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var fresh = fetch(e.request.url, { cache: 'no-cache' }).then(function (res) {
        if (res.ok) c.put(e.request, res.clone());
        return res;
      });
      if (!hit) return fresh;
      e.waitUntil(fresh.catch(function () {})); // offline: keep using the cached copy
      return hit;
    });
  }));
});

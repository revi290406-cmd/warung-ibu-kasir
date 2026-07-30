/*
  Warung Ibu - Kasir Pro — Service Worker v1.1.1
  Fungsi:
  1) Memenuhi syarat wajib PWA agar browser memunculkan prompt "Install App"
     (harus ada manifest + service worker yang meng-handle fetch, via HTTPS/localhost).
  2) Meng-cache "app shell" supaya aplikasi tetap bisa dibuka walau koneksi mati/lemot
     (penting untuk warung yang sinyalnya sering naik-turun).
  Catatan: naikkan CACHE_VERSION setiap kali index.html diubah, supaya pengguna lama
  otomatis mendapat versi terbaru (bukan versi cache basi).
*/

const CACHE_VERSION = 'warung-ibu-v1.1.1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// ---- INSTALL: simpan app shell ke cache ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---- ACTIVATE: bersihkan cache versi lama ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- FETCH: strategi "network falling back to cache" untuk HTML,
//      dan "cache falling back to network" untuk aset statis (CDN, ikon, dll) ----
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Cache aset baru (mis. CDN Tailwind/Chart.js) secara diam-diam agar offline berikutnya lebih lengkap
          if (res && res.status === 200 && req.url.startsWith('http')) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached); // jika offline & tak ada di cache, biarkan gagal secara wajar
    })
  );
});

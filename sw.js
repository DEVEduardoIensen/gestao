/**
 * Eldorado Pesca & Lake - Progressive Web App Service Worker
 * Versão 2.6.0 — Cache do App Shell com atualização resiliente (Offline-First)
 * NUNCA apaga IndexedDB, dados locais ou Outbox durante atualizações.
 */

const CACHE_NAME = 'eldorado-pwa-v2.6.0'; // Atualização compatível eldorado-pwa-v2.6.0

// Arquivos fundamentais do App Shell
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './lib/supabase.js',
  './app.js',
  './db_dexie.js',
  './sync_engine.js',
  './auth_manager.js',
  './supabase_config.js',
  './sample-data.js',
  './manifest.json',
  './logo.webp',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './app_icon.ico',
  './gremio_bg.jpg',
  './icon-mobile.svg',
  './icon-desktop.svg',
  './icon-web.svg'
];

// Instalação: baixa os arquivos essenciais e ativa imediatamente
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando versão:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pré-cache de assets essenciais concluído');
      return cache.addAll(APP_SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação: limpa versões antigas do Cache Storage e assume o controle dos clientes
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando versão:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // Notifica todas as janelas/PWA abertas de que a nova versão assumiu o controle
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// Fetch Interceptor:
// - Stale-While-Revalidate ultrarrápido para código da aplicação (abertura em ~5ms + update em background)
// - Cache-First para imagens e ícones estáticos
// - Bypass total para APIs do Supabase e chamadas REST
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora chamadas ao Supabase ou requisições de mutação
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/auth/v1') ||
    url.pathname.startsWith('/rest/v1') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  const isCoreAsset = event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/' ||
    url.pathname === '';

  // Stale-While-Revalidate ultrarrápido para código da aplicação (abertura em ~5ms + update em background)
  if (isCoreAsset) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        }).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html', { ignoreSearch: true }).then((indexCached) => indexCached || caches.match('./', { ignoreSearch: true }));
          }
        });

        // Se estiver em cache, entrega imediatamente sem esperar a rede
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Cache-First com atualização em segundo plano para imagens e assets estáticos
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {});

      return cachedResponse || fetchPromise;
    })
  );
});

// Mensagens vindas da aplicação (ex: skipWaiting para aplicar atualização imediata)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

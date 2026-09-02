/**
 * Eldorado Pesca & Lake - Progressive Web App Service Worker
 * Versão 2.2.0 — Cache do App Shell com atualização resiliente (Offline-First)
 * NUNCA apaga IndexedDB, dados locais ou Outbox durante atualizações.
 */

const CACHE_NAME = 'eldorado-pwa-v2.5.0'; // Atualização compatível eldorado-pwa-v2.2.0

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
      return cache.addAll(APP_SHELL_ASSETS).catch((err) => {
        console.warn('[Service Worker] Falha ao pré-carregar alguns assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Ativação: limpa versões antigas do Cache Storage e assume o controle dos clientes
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando versão:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('eldorado-pwa-') && key !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache obsoleto:', key);
            return caches.delete(key);
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
// - Network-First com Timeout (1.8s) para arquivos centrais (HTML, JS, CSS) garantindo que atualizações entrem direto no mobile
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

  // Network-First para código da aplicação (garante atualizações instantâneas online sem desinstalar)
  if (isCoreAsset) {
    event.respondWith(
      new Promise((resolve) => {
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          caches.match(event.request).then((cached) => {
            if (cached) resolve(cached);
          });
        }, 1800);

        fetch(event.request).then((networkResponse) => {
          clearTimeout(timer);
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          if (!timedOut) resolve(networkResponse);
        }).catch(() => {
          clearTimeout(timer);
          caches.match(event.request).then((cached) => {
            if (cached) {
              resolve(cached);
            } else if (event.request.mode === 'navigate') {
              caches.match('./index.html').then((indexCached) => resolve(indexCached || caches.match('./')));
            }
          });
        });
      })
    );
    return;
  }

  // Cache-First com atualização em segundo plano para imagens e assets estáticos
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
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

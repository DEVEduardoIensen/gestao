/**
 * Eldorado Pesca & Lake - Progressive Web App Service Worker
 * Versão 2.7.0 — Cache do App Shell + W3C Background Sync API
 * Sincronização automática em segundo plano ao ligar o Wi-Fi sem precisar abrir o app.
 */

const CACHE_NAME = 'eldorado-pwa-v2.7.0';

// Configurações do Supabase para background dispatch direto do Service Worker
const SUPABASE_URL = 'https://tfttmfbfzyymuwiwpxyw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Iavy0YRY6OLtkz5mnizE2w_S4aFkRxY';

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

// ==========================================================================
// W3C Background Sync API & Periodic Sync (Disparo Automático ao Ligar Wi-Fi)
// ==========================================================================

self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Evento sync recebido do SO:', event.tag);
  if (event.tag === 'eldorado-outbox-sync' || event.tag === 'sync-outbox') {
    event.waitUntil(processBackgroundOutboxSync());
  }
});

self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Evento periodicSync recebido do SO:', event.tag);
  if (event.tag === 'eldorado-periodic-sync') {
    event.waitUntil(processBackgroundOutboxSync());
  }
});

/**
 * Abre o IndexedDB local e despacha diretamente a fila Outbox para o Supabase
 */
async function processBackgroundOutboxSync() {
  console.log('[Service Worker] Executando sincronização de segundo plano via Wi-Fi...');
  try {
    const db = await openLocalIndexedDB();
    const pendingOps = await getPendingOpsFromDB(db);

    if (!pendingOps || pendingOps.length === 0) {
      console.log('[Service Worker] Nenhuma operação pendente na fila.');
      return;
    }

    console.log(`[Service Worker] Processando ${pendingOps.length} operações em segundo plano...`);
    let processedCount = 0;

    for (const op of pendingOps) {
      try {
        const success = await dispatchOpToSupabase(op);
        if (success) {
          await removeOpFromDB(db, op.id);
          processedCount++;
        }
      } catch (err) {
        console.warn(`[Service Worker] Erro ao sincronizar op ${op.id}:`, err);
      }
    }

    console.log(`[Service Worker] Concluídas ${processedCount} operações com sucesso em background.`);

    // Notifica clientes abertos via BroadcastChannel ou PostMessage
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => {
      c.postMessage({ type: 'BACKGROUND_SYNC_COMPLETE', processedCount });
    });

    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('eldorado-sync-channel');
      bc.postMessage({ type: 'BACKGROUND_SYNC_COMPLETE', processedCount });
      bc.close();
    }
  } catch (e) {
    console.error('[Service Worker] Falha no processBackgroundOutboxSync:', e);
  }
}

function openLocalIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('EldoradoPesca_v2', 3);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getPendingOpsFromDB(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        const pending = all.filter(op => op.status === 'pending' || op.status === 'failed');
        resolve(pending);
      };
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

function removeOpFromDB(db, opId) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const req = store.delete(opId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

async function dispatchOpToSupabase(op) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  const orgId = op.orgId || '00000000-0000-0000-0000-000000000001';

  switch (op.type) {
    case 'SELL_NUMBERS': {
      const { raffleId, numbers, status, buyerName, reservedAt, paidAt, allowOverride } = op.payload;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sell_raffle_numbers_atomic`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          p_org_id: orgId,
          p_raffle_id: raffleId,
          p_numbers: numbers,
          p_status: status,
          p_buyer_name: (status === 'available') ? '' : (buyerName || ''),
          p_reserved_at: (status === 'available') ? null : (reservedAt || null),
          p_paid_at: (status === 'available') ? null : (paidAt || null),
          p_allow_override: allowOverride !== undefined ? !!allowOverride : true
        })
      });
      return res.ok;
    }

    case 'BATCH_SET_NUMBERS': {
      const { numbersList } = op.payload;
      if (!Array.isArray(numbersList) || numbersList.length === 0) return true;
      const rows = numbersList.map(n => ({
        organization_id: orgId,
        raffle_id: op.payload.raffleId,
        num: n.num,
        name: (n.status === 'available') ? '' : (n.name || ''),
        status: n.status || 'available',
        reserved_at: (n.status === 'reserved') ? (n.reservedAt || new Date().toISOString()) : null,
        paid_at: (n.status === 'paid') ? (n.paidAt || new Date().toISOString()) : null
      }));
      const res = await fetch(`${SUPABASE_URL}/rest/v1/raffle_numbers?on_conflict=organization_id,raffle_id,num`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(rows)
      });
      return res.ok;
    }

    case 'UPDATE_VALE': {
      const v = op.payload;
      const row = {
        id: v.id,
        organization_id: orgId,
        customer_name: v.customerName,
        customer_phone: v.customerPhone,
        type: v.type,
        raffle_ref: v.raffleRef,
        date_won: v.dateWon,
        initial_amount: v.initialAmount,
        current_balance: v.currentBalance,
        description: v.description,
        status: v.status,
        delivered_at: v.deliveredAt,
        notes: v.notes,
        exchanged_item: v.exchangedItem,
        difference_paid: v.differencePaid,
        exchange_notes: v.exchangeNotes,
        exchanged_at: v.exchangedAt
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vales_prizes?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      });
      return res.ok;
    }

    case 'DELETE_VALE': {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/vales_prizes?id=eq.${encodeURIComponent(op.payload.id)}`, {
        method: 'DELETE',
        headers
      });
      return res.ok;
    }

    case 'BOOK_FISHING': {
      const b = op.payload;
      const row = {
        id: b.id,
        organization_id: orgId,
        client_name: b.clientName,
        client_phone: b.clientPhone,
        booking_type: b.bookingType,
        raffle_ref: b.raffleRef,
        prize_id: b.prizeId,
        start_date: b.startDate,
        end_date: b.endDate,
        dates: b.dates,
        total_days: b.totalDays,
        raffle_days: b.raffleDays,
        extra_days: b.extraDays,
        package_name: b.packageName,
        structure_type: b.structureType,
        fishermen_count: b.fishermenCount,
        boats_count: b.boatsCount,
        kayaks_count: b.kayaksCount,
        custom_structure: b.customStructure,
        total_amount: b.totalAmount,
        deposit_amount: b.depositAmount,
        remaining_amount: b.remainingAmount,
        payment_status: b.paymentStatus,
        payment_method: b.paymentMethod,
        notes: b.notes,
        guide_name: b.guideName,
        status: b.status
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/fishing_bookings?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      });
      return res.ok;
    }

    case 'DELETE_FISHING_BOOKING': {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/fishing_bookings?id=eq.${encodeURIComponent(op.payload.id)}`, {
        method: 'DELETE',
        headers
      });
      return res.ok;
    }

    case 'BOOK_RANCHO': {
      const r = op.payload;
      const row = {
        id: r.id,
        organization_id: orgId,
        client_name: r.clientName,
        client_phone: r.clientPhone,
        check_in_date: r.checkInDate,
        check_out_date: r.checkOutDate,
        total_days: r.totalDays,
        guests_count: r.guestsCount,
        total_amount: r.totalAmount,
        deposit_amount: r.depositAmount,
        remaining_amount: r.remainingAmount,
        payment_status: r.paymentStatus,
        payment_method: r.paymentMethod,
        notes: r.notes,
        status: r.status
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rancho_bookings?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      });
      return res.ok;
    }

    case 'DELETE_RANCHO_BOOKING': {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rancho_bookings?id=eq.${encodeURIComponent(op.payload.id)}`, {
        method: 'DELETE',
        headers
      });
      return res.ok;
    }

    case 'SET_EDUARDO_DAY': {
      const d = op.payload;
      const row = {
        organization_id: orgId,
        date: d.date,
        type: d.type,
        hours_weight: d.hoursWeight,
        amount_due: d.amountDue,
        notes: d.notes
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/eduardo_work_days?on_conflict=organization_id,date`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      });
      return res.ok;
    }

    case 'DELETE_EDUARDO_DAY': {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/eduardo_work_days?organization_id=eq.${orgId}&date=eq.${encodeURIComponent(op.payload.date)}`, {
        method: 'DELETE',
        headers
      });
      return res.ok;
    }

    case 'CREATE_RAFFLE':
    case 'UPDATE_RAFFLE': {
      const r = op.payload;
      const row = {
        id: r.id,
        organization_id: orgId,
        number: r.number,
        title: r.title,
        subtitle: r.subtitle,
        price_per_number: r.pricePerNumber,
        total_numbers: r.totalNumbers,
        reservation_timeout_hours: r.reservationTimeoutHours,
        pix_key: r.pixKey,
        pix_owner: r.pixOwner,
        shipping_note: r.shippingNote,
        live_draw_note: r.liveDrawNote,
        private_contact: r.privateContact,
        rules: r.rules,
        status: r.status
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/raffles?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      });
      return res.ok;
    }

    case 'DELETE_RAFFLE': {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/raffles?id=eq.${encodeURIComponent(op.payload.id)}`, {
        method: 'DELETE',
        headers
      });
      return res.ok;
    }

    case 'UPDATE_SETTINGS': {
      const s = op.payload;
      const row = {
        organization_id: orgId,
        key: s.key,
        value: typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?on_conflict=organization_id,key`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      });
      return res.ok;
    }

    default:
      console.warn('[Service Worker] Operação desconhecida:', op.type);
      return false;
  }
}

// Mensagens vindas da aplicação (ex: skipWaiting para aplicar atualização imediata)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    processBackgroundOutboxSync();
  }
});

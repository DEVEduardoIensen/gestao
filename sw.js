/**
 * Eldorado Pesca & Lake - Progressive Web App Service Worker
 * Versão 2.8.5 — Cache do App Shell + W3C Background Sync API
 * Sincronização autônoma em segundo plano via Wi-Fi/dados móveis com blindagem de autenticação,
 * sincronização completa de raffle_prizes, cotas e resolução de conflitos.
 */

try {
  importScripts('./normalize_raffle.js');
} catch (e) {
  console.warn('[Service Worker] normalize_raffle.js carregado inline/fallback');
}

const CACHE_NAME = 'eldorado-pwa-v2.8.5';

// Configurações do Supabase para background dispatch direto do Service Worker
const SUPABASE_URL = 'https://tfttmfbfzyymuwiwpxyw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Iavy0YRY6OLtkz5mnizE2w_S4aFkRxY';

// Arquivos fundamentais do App Shell
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './lib/supabase.js',
  './normalize_raffle.js',
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
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// Fetch Interceptor:
// - Stale-While-Revalidate para código da aplicação
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

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

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
// W3C Background Sync API, Periodic Sync & Evento Online
// ==========================================================================

self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Evento sync recebido do SO:', event.tag);
  if (!event.tag || event.tag === 'eldorado-outbox-sync' || event.tag === 'sync-outbox' || event.tag.includes('outbox') || event.tag.includes('sync')) {
    event.waitUntil(processBackgroundOutboxSync());
  }
});

self.addEventListener('periodicsync', (event) => {
  console.log('[Service Worker] Evento periodicSync recebido do SO:', event.tag);
  event.waitUntil(processBackgroundOutboxSync());
});

self.addEventListener('online', () => {
  console.log('[Service Worker] Evento online detectado no Service Worker');
  processBackgroundOutboxSync().catch(() => {});
});

/**
 * Abre o IndexedDB local e despacha a fila Outbox para o Supabase
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
    let hadNetworkError = false;

    for (const op of pendingOps) {
      if (op.status === 'conflict') {
        continue;
      }

      // Backoff exponencial para retentativas de falha
      if (op.retryCount > 0 && op.lastAttempt) {
        const delay = Math.min(1000 * Math.pow(2, Math.min(op.retryCount, 6)), 60000);
        if (Date.now() - op.lastAttempt < delay) {
          continue;
        }
      }

      try {
        await updateOpStatusInDB(db, op.id, 'syncing');
        op.lastAttempt = Date.now();

        const success = await dispatchOpToSupabase(op, db);
        if (success === true) {
          await removeOpFromDB(db, op.id);
          processedCount++;
        }
      } catch (err) {
        console.warn(`[Service Worker] Erro ao sincronizar op ${op.id} (${op.type}):`, err);
        hadNetworkError = true;
        await updateOpStatusInDB(db, op.id, 'failed', err.message || 'Erro de rede em background');
      }
    }

    console.log(`[Service Worker] Concluídas ${processedCount} operações com sucesso em background.`);

    if (processedCount > 0) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => {
        c.postMessage({ type: 'BACKGROUND_SYNC_COMPLETE', processedCount });
      });

      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('eldorado-sync-channel');
        bc.postMessage({ type: 'BACKGROUND_SYNC_COMPLETE', processedCount });
        bc.close();
      }
    }

    // Se houve falha de rede sem processar nenhum item, lança erro para o SO reagendar o sync
    if (hadNetworkError && processedCount === 0) {
      throw new Error('[Service Worker] Falha transitória de rede durante o background sync.');
    }
  } catch (e) {
    console.error('[Service Worker] Falha no processBackgroundOutboxSync:', e);
    throw e;
  }
}

function openLocalIndexedDB() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('EldoradoPesca_v2', 3);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Falha ao abrir IndexedDB no Service Worker'));
      req.onblocked = () => reject(new Error('IndexedDB bloqueado no Service Worker'));
    } catch (e) {
      reject(e);
    }
  });
}

function getPendingOpsFromDB(db) {
  return new Promise((resolve, reject) => {
    try {
      if (!db || !db.objectStoreNames || !db.objectStoreNames.contains('sync_queue')) {
        return reject(new Error('ObjectStore sync_queue inexistente no IndexedDB'));
      }
      const tx = db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const req = store.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        const now = Date.now();
        const pending = all.filter(op => {
          const isAbandonedSyncing = (op.status === 'syncing' && (!op.lastAttempt || (now - op.lastAttempt > 25000)));
          return op.status === 'pending' || op.status === 'failed' || isAbandonedSyncing;
        }).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        resolve(pending);
      };
      req.onerror = () => reject(req.error || new Error('Erro ao ler sync_queue'));
    } catch (e) {
      reject(e);
    }
  });
}

function updateOpStatusInDB(db, opId, status, error = null) {
  return new Promise((resolve) => {
    try {
      if (!db || !db.objectStoreNames || !db.objectStoreNames.contains('sync_queue')) return resolve(false);
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const req = store.get(opId);
      req.onsuccess = () => {
        const op = req.result;
        if (op) {
          op.status = status;
          if (error !== undefined) op.error = error;
          if (status === 'syncing') op.retryCount = (op.retryCount || 0) + 1;
          store.put(op);
        }
        resolve(true);
      };
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

function removeOpFromDB(db, opId) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const req = store.delete(opId);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error || new Error('Falha ao remover operação'));
    } catch (e) {
      reject(e);
    }
  });
}

function isValidJwt(token) {
  return typeof token === 'string' && token.trim().split('.').length === 3;
}

async function getAuthSessionFromDB(db, orgId) {
  if (!db || !orgId) return null;
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames || !db.objectStoreNames.contains('settings')) return resolve(null);
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get([orgId, '_auth_session']);
      req.onsuccess = () => {
        const item = req.result;
        resolve(item || null);
      };
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function getAuthTokenFromDB(db, orgId) {
  const session = await getAuthSessionFromDB(db, orgId);
  return session ? (session.access_token || session.value || null) : null;
}

async function persistRefreshedTokensInDB(db, orgId, accessToken, refreshToken, expiresAt = null) {
  if (!db || !orgId || !accessToken) return;
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains('settings')) return resolve(false);
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      store.put({
        organization_id: orgId,
        key: '_auth_session',
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        timestamp: Date.now()
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

async function refreshSupabaseTokenInSW(refreshToken) {
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (res.ok) {
      const data = await res.json();
      return {
        access_token: data.access_token || null,
        refresh_token: data.refresh_token || null,
        expires_at: data.expires_at || null
      };
    }
  } catch (e) {
    console.warn('[Service Worker] Falha ao renovar token:', e);
  }
  return null;
}

// Wrapper seguro para chamadas REST/RPC no Supabase com resiliência de autenticação e persistência de rotação
async function swSupabaseFetch(url, options = {}, op = null, db = null) {
  const orgId = op?.orgId;
  if (!orgId) {
    throw new Error('Impossível realizar requisição: organization_id ausente.');
  }

  let token = (op && isValidJwt(op.authToken)) ? op.authToken.trim() : null;
  let refreshToken = op?.refreshToken || null;

  if (!token && db) {
    const sessionObj = await getAuthSessionFromDB(db, orgId);
    if (sessionObj && isValidJwt(sessionObj.access_token)) {
      token = sessionObj.access_token.trim();
      refreshToken = refreshToken || sessionObj.refresh_token;
    }
  }

  // Se não possuir JWT mas tiver refreshToken, tenta renovação prévia
  if (!token && refreshToken) {
    const refreshData = await refreshSupabaseTokenInSW(refreshToken);
    if (refreshData && isValidJwt(refreshData.access_token)) {
      token = refreshData.access_token.trim();
      refreshToken = refreshData.refresh_token || refreshToken;
      if (op) {
        op.authToken = token;
        op.refreshToken = refreshToken;
      }
      if (db) {
        await persistRefreshedTokensInDB(db, orgId, token, refreshToken, refreshData.expires_at);
      }
    }
  }

  // Se ainda assim não houver token autenticado, NUNCA usa SUPABASE_KEY anon fingindo ser usuário!
  if (!token) {
    throw new Error('AUTH_REQUIRED: Operação offline aguardando login válido do usuário na organização.');
  }

  const baseHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  let res = await fetch(url, {
    ...options,
    headers: baseHeaders
  });

  // Se receber 401 e tiver refresh_token, renova o token, persiste e retenta
  if (res.status === 401 && refreshToken) {
    console.log('[Service Worker] 401 recebido do Supabase. Renovando token via refresh_token...');
    const refreshData = await refreshSupabaseTokenInSW(refreshToken);
    if (refreshData && isValidJwt(refreshData.access_token)) {
      token = refreshData.access_token.trim();
      refreshToken = refreshData.refresh_token || refreshToken;
      if (op) {
        op.authToken = token;
        op.refreshToken = refreshToken;
      }
      if (db) {
        await persistRefreshedTokensInDB(db, orgId, token, refreshToken, refreshData.expires_at);
      }
      baseHeaders['Authorization'] = `Bearer ${token}`;
      res = await fetch(url, { ...options, headers: baseHeaders });
    }
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`AUTH_ERROR_${res.status}: Permissão negada na nuvem. Sessão expirada ou sem acesso.`);
  }

  return res;
}

async function dispatchOpToSupabase(op, db) {
  const orgId = op.orgId;
  if (!orgId) {
    throw new Error(`[Service Worker] Operação ${op.id} bloqueada: sem organization_id.`);
  }

  switch (op.type) {
    case 'SELL_NUMBERS': {
      const { raffleId, numbers, status, buyerName, reservedAt, paidAt, allowOverride } = op.payload;
      const formattedNumbers = Array.isArray(numbers) ? numbers.map(n => parseInt(n, 10) || n) : [];
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/rpc/sell_raffle_numbers_atomic`, {
        method: 'POST',
        body: JSON.stringify({
          p_org_id: orgId,
          p_raffle_id: raffleId,
          p_numbers: formattedNumbers,
          p_status: status,
          p_buyer_name: (status === 'available') ? '' : (buyerName || ''),
          p_reserved_at: (status === 'available') ? null : (reservedAt || null),
          p_paid_at: (status === 'available') ? null : (paidAt || null),
          p_allow_override: allowOverride !== undefined ? !!allowOverride : true
        })
      }, op, db);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} na RPC sell_raffle_numbers_atomic`);
      }

      const json = await res.json().catch(() => null);
      if (json && json.conflict) {
        console.warn('[Service Worker] Conflito detectado na RPC sell_raffle_numbers_atomic:', json);
        await updateOpStatusInDB(db, op.id, 'conflict', json.message || 'Conflito de cota detectado no servidor');
        // Mantém na Outbox como conflito aguardando resolução humana
        return false;
      }

      if (json && json.success === false) {
        throw new Error(json.error || json.message || 'RPC retornou falha');
      }

      return true;
    }

    case 'BATCH_SET_NUMBERS': {
      const { numbersList, raffleId } = op.payload;
      if (!Array.isArray(numbersList) || numbersList.length === 0) return true;
      const targetRaffleId = raffleId || op.payload.raffle_id;
      const rows = numbersList.map(n => ({
        organization_id: orgId,
        raffle_id: targetRaffleId,
        num: parseInt(n.num, 10) || n.num,
        name: (n.status === 'available') ? '' : (n.name || ''),
        status: n.status || 'available',
        reserved_at: (n.status === 'available') ? null : (n.reservedAt || (n.status === 'reserved' ? new Date().toISOString() : null)),
        paid_at: (n.status === 'paid') ? (n.paidAt || new Date().toISOString()) : null
      }));
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/raffle_numbers?on_conflict=organization_id,raffle_id,num`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(rows)
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar cotas em lote`);
      return true;
    }

    case 'CREATE_RAFFLE':
    case 'UPDATE_RAFFLE': {
      const r = (typeof normalizeRaffle === 'function') ? normalizeRaffle(op.payload) : op.payload;
      const row = {
        id: r.id,
        organization_id: orgId,
        number: String(r.number || ''),
        title: r.title,
        subtitle: r.subtitle || '',
        price_per_number: parseFloat(r.pricePerNumber) || 0,
        total_numbers: parseInt(r.totalNumbers, 10) || 60,
        reservation_timeout_hours: parseInt(r.reservationTimeoutHours, 10) || 24,
        pix_key: r.pixKey || '',
        pix_owner: r.pixOwner || '',
        shipping_note: r.shippingNote || '',
        live_draw_note: r.liveDrawNote || '',
        private_contact: r.privateContact || '',
        rules: r.rules || '',
        status: r.status || 'active'
      };

      // 1. Upsert na tabela raffles
      const resRaffle = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/raffles?on_conflict=organization_id,id`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      }, op, db);
      if (!resRaffle.ok) throw new Error(`HTTP ${resRaffle.status} ao salvar dados da rifa`);

      // 2. Sincronização estrita de raffle_prizes
      if (Array.isArray(r.prizes)) {
        if (r.prizes.length > 0) {
          const prizeRecords = r.prizes.map((p, idx) => ({
            organization_id: orgId,
            raffle_id: r.id,
            position: p.position || (idx + 1),
            description: p.description || `${idx + 1}º Prêmio`,
            winner_number: p.winnerNumber || null,
            winner_name: p.winnerName || ''
          }));
          const resPrizes = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/raffle_prizes?on_conflict=organization_id,raffle_id,position`, {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(prizeRecords)
          }, op, db);
          if (!resPrizes.ok) throw new Error(`HTTP ${resPrizes.status} ao sincronizar prêmios da rifa`);

          // Remove prêmios obsoletos
          const keepPositions = r.prizes.map((p, idx) => p.position || (idx + 1));
          const resDelObsolete = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/raffle_prizes?organization_id=eq.${orgId}&raffle_id=eq.${encodeURIComponent(r.id)}&position=not.in.(${keepPositions.join(',')})`, {
            method: 'DELETE'
          }, op, db);
          if (!resDelObsolete.ok) throw new Error(`HTTP ${resDelObsolete.status} ao remover prêmios obsoletos da rifa`);
        } else {
          // Rifa sem prêmios: remove todos os prêmios da rifa no Supabase
          const resDelAll = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/raffle_prizes?organization_id=eq.${orgId}&raffle_id=eq.${encodeURIComponent(r.id)}`, {
            method: 'DELETE'
          }, op, db);
          if (!resDelAll.ok) throw new Error(`HTTP ${resDelAll.status} ao limpar prêmios da rifa`);
        }
      }

      // 3. Persiste cotas 1 a N se fornecidas
      if (Array.isArray(r.numbers) && r.numbers.length > 0) {
        const numbersRows = r.numbers.map(n => ({
          organization_id: orgId,
          raffle_id: r.id,
          num: parseInt(n.num, 10) || n.num,
          name: (n.status === 'available') ? '' : (n.name || ''),
          status: n.status || 'available',
          reserved_at: (n.status === 'available') ? null : (n.reservedAt || (n.status === 'reserved' ? new Date().toISOString() : null)),
          paid_at: (n.status === 'paid') ? (n.paidAt || new Date().toISOString()) : null
        }));
        const resNumbers = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/raffle_numbers?on_conflict=organization_id,raffle_id,num`, {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify(numbersRows)
        }, op, db);
        if (!resNumbers.ok) throw new Error(`HTTP ${resNumbers.status} ao sincronizar cotas da rifa`);
      }

      return true;
    }

    case 'DELETE_RAFFLE': {
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/raffles?organization_id=eq.${orgId}&id=eq.${encodeURIComponent(op.payload.id)}`, {
        method: 'DELETE'
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao excluir rifa`);
      return true;
    }

    case 'CREATE_VALE':
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
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/vales_prizes?on_conflict=organization_id,id`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar vale`);
      return true;
    }

    case 'DELETE_VALE': {
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/vales_prizes?organization_id=eq.${orgId}&id=eq.${encodeURIComponent(op.payload.id)}`, {
        method: 'DELETE'
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao excluir vale`);
      return true;
    }

    case 'ADD_VALE_TRANSACTION': {
      const tx = op.payload;
      const row = {
        id: tx.id,
        organization_id: orgId,
        vale_id: tx.valeId,
        date: tx.date,
        item: tx.item,
        amount: tx.amount,
        remaining_balance: tx.remainingBalance,
        registered_by: tx.registeredBy
      };
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/vale_transactions?on_conflict=organization_id,id`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar transação de vale`);
      return true;
    }

    case 'BOOK_FISHING':
    case 'UPDATE_FISHING': {
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
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/fishing_bookings?on_conflict=organization_id,id`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar agendamento de pesca`);
      return true;
    }

    case 'DELETE_FISHING_BOOKING': {
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/fishing_bookings?organization_id=eq.${orgId}&id=eq.${encodeURIComponent(op.payload.id)}`, {
        method: 'DELETE'
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao excluir agendamento de pesca`);
      return true;
    }

    case 'BOOK_RANCHO':
    case 'UPDATE_RANCHO': {
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
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/rancho_bookings?on_conflict=organization_id,id`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar locação do rancho`);
      return true;
    }

    case 'DELETE_RANCHO_BOOKING': {
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/rancho_bookings?organization_id=eq.${orgId}&id=eq.${encodeURIComponent(op.payload.id)}`, {
        method: 'DELETE'
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao excluir locação do rancho`);
      return true;
    }

    case 'SET_EDUARDO_DAY': {
      const d = op.payload;
      if (d.type === 'off') {
        const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/eduardo_work_days?organization_id=eq.${orgId}&date=eq.${encodeURIComponent(d.date)}`, {
          method: 'DELETE'
        }, op, db);
        if (!res.ok) throw new Error(`HTTP ${res.status} ao remover ponto do Eduardo`);
        return true;
      }
      const row = {
        organization_id: orgId,
        date: d.date,
        type: d.type,
        hours_weight: d.hoursWeight,
        amount_due: d.amountDue,
        notes: d.notes
      };
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/eduardo_work_days?on_conflict=organization_id,date`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar ponto do Eduardo`);
      return true;
    }

    case 'DELETE_EDUARDO_DAY': {
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/eduardo_work_days?organization_id=eq.${orgId}&date=eq.${encodeURIComponent(op.payload.date)}`, {
        method: 'DELETE'
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao excluir ponto do Eduardo`);
      return true;
    }

    case 'UPDATE_SETTINGS': {
      const s = op.payload;
      const row = {
        organization_id: orgId,
        key: s.key,
        value: typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)
      };
      const res = await swSupabaseFetch(`${SUPABASE_URL}/rest/v1/settings?on_conflict=organization_id,key`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(row)
      }, op, db);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao atualizar settings`);
      return true;
    }

    default:
      console.warn('[Service Worker] Operação desconhecida:', op.type);
      throw new Error(`Operação não suportada pelo Service Worker: ${op.type}`);
  }
}

// Mensagens vindas da aplicação
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    processBackgroundOutboxSync().catch(() => {});
  }
});

/**
 * Eldorado Pesca & Lake - Dexie.js / IndexedDB Offline Persistence Layer (v2.1)
 * Armazenamento local com isolamento estrito por organization_id e fila outbox.
 */

class LocalDatabase {
  constructor() {
    this.dbName = 'EldoradoPesca_v2';
    this.version = 3;
    this.db = null;
    this.isReady = false;
    this._initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Settings
        if (!db.objectStoreNames.contains('settings')) {
          const store = db.createObjectStore('settings', { keyPath: ['organization_id', 'key'] });
          store.createIndex('idx_org', 'organization_id', { unique: false });
        }

        // Raffles (números e prêmios aninhados de alta performance)
        if (!db.objectStoreNames.contains('raffles')) {
          const store = db.createObjectStore('raffles', { keyPath: 'id' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
          store.createIndex('idx_status', 'status', { unique: false });
        }

        // Vales e Prêmios
        if (!db.objectStoreNames.contains('vales_prizes')) {
          const store = db.createObjectStore('vales_prizes', { keyPath: 'id' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
          store.createIndex('idx_status', 'status', { unique: false });
        }

        // Transações de Vales
        if (!db.objectStoreNames.contains('vale_transactions')) {
          const store = db.createObjectStore('vale_transactions', { keyPath: 'id' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
          store.createIndex('idx_vale_id', 'vale_id', { unique: false });
        }

        // Agenda de Pescaria
        if (!db.objectStoreNames.contains('fishing_bookings')) {
          const store = db.createObjectStore('fishing_bookings', { keyPath: 'id' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
          store.createIndex('idx_status', 'status', { unique: false });
          store.createIndex('idx_start_date', 'startDate', { unique: false });
        }

        // Locações do Rancho
        if (!db.objectStoreNames.contains('rancho_bookings')) {
          const store = db.createObjectStore('rancho_bookings', { keyPath: 'id' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
          store.createIndex('idx_status', 'status', { unique: false });
        }

        // Folha e Ponto do Eduardo
        if (!db.objectStoreNames.contains('eduardo_work_days')) {
          const store = db.createObjectStore('eduardo_work_days', { keyPath: ['organization_id', 'date'] });
          store.createIndex('idx_org', 'organization_id', { unique: false });
        }

        // Fila de Sincronização Outbox
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id' });
          store.createIndex('idx_org', 'orgId', { unique: false });
          store.createIndex('idx_status', 'status', { unique: false });
          store.createIndex('idx_timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this.isReady = true;

        // Garante persistência durável no Safari iOS e PWA contra auto-eviction de 7 dias
        if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
          navigator.storage.persist().then((persisted) => {
            if (persisted) {
              console.log('[LocalDB] Armazenamento persistente ativado com sucesso (proteção iOS/Safari/PWA).');
            }
          }).catch(() => {});
        }

        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB init error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async ready() {
    if (this.isReady) return this.db;
    return this._initPromise;
  }

  // Operações genéricas de CRUD
  async getAll(storeName) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // Consulta ultra rápida via índice B-Tree 'idx_org' nativo do IndexedDB
  async getAllByOrg(storeName, orgId) {
    if (!orgId) return [];
    await this.ready();
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        if (store.indexNames && store.indexNames.contains('idx_org')) {
          const index = store.index('idx_org');
          const req = index.getAll(orgId);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        } else {
          // Fallback gracioso caso índice não exista
          const req = store.getAll();
          req.onsuccess = () => {
            const all = req.result || [];
            const key = (storeName === 'sync_queue') ? 'orgId' : 'organization_id';
            resolve(all.filter(item => item && item[key] === orgId));
          };
          req.onerror = () => reject(req.error);
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  async get(storeName, key) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName, item) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async putBatch(storeName, items) {
    if (!items || items.length === 0) return true;
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      items.forEach(item => store.put(item));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async delete(storeName, key) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteBatch(storeName, keys) {
    if (!keys || keys.length === 0) return true;
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const k of keys) {
        store.delete(k);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(storeName) {
    await this.ready();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- PERSISTÊNCIA DE SESSÃO AUTH PARA O SERVICE WORKER ---
  async saveAuthSession(session, orgId) {
    if (!session || !orgId) return;
    try {
      const token = session.access_token;
      // Garante que apenas JWTs válidos com 3 partes sejam persistidos
      const validToken = (typeof token === 'string' && token.trim().split('.').length === 3) ? token.trim() : null;
      await this.put('settings', {
        organization_id: orgId,
        key: '_auth_session',
        access_token: validToken,
        refresh_token: session.refresh_token || null,
        expires_at: session.expires_at || null,
        user_id: session.user?.id || null,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn('[LocalDB] Falha ao salvar auth_session no IndexedDB:', e);
    }
  }

  async getAuthSession(orgId) {
    try {
      return await this.get('settings', [orgId, '_auth_session']);
    } catch (e) {
      return null;
    }
  }

  // --- FILA DE SINCRONIZAÇÃO OUTBOX ---
  async enqueueOperation(op, explicitOrgId = null) {
    const orgId = op.orgId || op.organization_id || explicitOrgId || (typeof window !== 'undefined' && window.authManager ? window.authManager.getOrganizationId() : null) || (typeof localStorage !== 'undefined' ? localStorage.getItem('ELDORADO_ACTIVE_ORG_ID') : null);
    if (!orgId) {
      throw new Error('[LocalDB] Impossível enfileirar operação sem organization_id válido.');
    }

    // Captura token de autenticação e refresh token do usuário para autorizar o Service Worker
    let authToken = op.authToken || null;
    let refreshToken = op.refreshToken || null;
    const isValidJwt = (t) => typeof t === 'string' && t.trim().split('.').length === 3;

    try {
      if (!isValidJwt(authToken) && window.authManager && window.authManager.session) {
        authToken = window.authManager.session.access_token;
        refreshToken = window.authManager.session.refresh_token;
      }
      
      if (!isValidJwt(authToken) && window.supabaseClient && window.supabaseClient.auth) {
        const sess = (await window.supabaseClient.auth.getSession()).data?.session;
        if (sess && isValidJwt(sess.access_token)) {
          authToken = sess.access_token;
          refreshToken = sess.refresh_token;
        }
      }

      if (!isValidJwt(authToken) && typeof localStorage !== 'undefined') {
        const sbKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sbKey) {
          try {
            const parsed = JSON.parse(localStorage.getItem(sbKey) || '{}');
            if (parsed && isValidJwt(parsed.access_token)) {
              authToken = parsed.access_token;
              refreshToken = parsed.refresh_token;
            }
          } catch (e) {}
        }
      }

      // Normaliza para null se não for um JWT autêntico
      if (!isValidJwt(authToken)) {
        authToken = null;
      }
    } catch (e) {
      console.warn('[LocalDB] Aviso ao resolver credenciais para operação:', e);
    }

    // Deduplicação inteligente de operações pendentes para o mesmo registro
    if (op.tableName && op.recordId && op.type) {
      try {
        const pendingList = await this.getPendingOperations(orgId);
        const existingOp = pendingList.find(p => 
          p.status === 'pending' && 
          p.tableName === op.tableName && 
          String(p.recordId) === String(op.recordId)
        );
        if (existingOp && existingOp.type === op.type) {
          existingOp.payload = (typeof existingOp.payload === 'object' && typeof op.payload === 'object')
            ? Object.assign({}, existingOp.payload, op.payload)
            : op.payload;
          existingOp.timestamp = Date.now();
          if (authToken) existingOp.authToken = authToken;
          if (refreshToken) existingOp.refreshToken = refreshToken;
          await this.put('sync_queue', existingOp);
          return existingOp;
        }
      } catch (e) {}
    }

    const operation = {
      id: op.id || ('op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
      orgId: orgId,
      authToken: authToken,
      refreshToken: refreshToken,
      type: op.type,
      tableName: op.tableName,
      recordId: op.recordId,
      payload: op.payload,
      timestamp: op.timestamp || Date.now(),
      retryCount: op.retryCount || 0,
      status: op.status || 'pending', // 'pending' | 'syncing' | 'conflict' | 'failed'
      error: op.error || null
    };

    await this.put('sync_queue', operation);

    // Salva também snapshot de sessão atualizada no store de settings para o Service Worker
    if (authToken && orgId) {
      try {
        await this.saveAuthSession({ access_token: authToken, refresh_token: refreshToken }, orgId);
      } catch (e) {
        console.warn('[LocalDB] Erro ao salvar sessão de auth para SW:', e);
      }
    }

    // Dispara registro de Background Sync no Service Worker de forma não-bloqueante (fire-and-forget)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      Promise.resolve().then(async () => {
        try {
          const reg = await navigator.serviceWorker.ready.catch(() => null);
          if (reg) {
            if ('sync' in reg) {
              reg.sync.register('eldorado-outbox-sync').catch(() => {});
            }
            if ('periodicSync' in reg) {
              try {
                await reg.periodicSync.register('eldorado-periodic-sync', {
                  minInterval: 15 * 60 * 1000
                });
              } catch (pErr) {}
            }
          }
        } catch (e) {}
      });
    }

    return operation;
  }

  // Busca operações pendentes da fila Outbox com B-Tree query direta
  async getPendingOperations(orgId = null) {
    const targetOrg = orgId || (typeof window !== 'undefined' && window.authManager ? window.authManager.getOrganizationId() : null);
    const all = targetOrg ? await this.getAllByOrg('sync_queue', targetOrg) : await this.getAll('sync_queue');
    const now = Date.now();
    return all
      .filter(op => {
        const matchesOrg = !targetOrg || op.orgId === targetOrg;
        // Auto-recupera operações 'syncing' abandonadas (ex: app fechado pelo SO ou crash há mais de 15s)
        const isAbandonedSyncing = (op.status === 'syncing' && (!op.lastAttempt || (now - op.lastAttempt > 15000)));
        const matchesStatus = op.status === 'pending' || op.status === 'conflict' || op.status === 'failed' || isAbandonedSyncing;
        return matchesOrg && matchesStatus;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async recoverAbandonedOperations(timeoutMs = 15000) {
    let recoveredCount = 0;
    try {
      const all = await this.getAll('sync_queue');
      const now = Date.now();
      for (const op of all) {
        const opTime = op.lastAttempt || op.syncStartedAt || 0;
        if (op.status === 'syncing' && (timeoutMs === 0 || !opTime || (now - opTime > timeoutMs))) {
          op.status = 'pending';
          await this.put('sync_queue', op);
          recoveredCount++;
        }
      }
      if (recoveredCount > 0) {
        console.log(`[LocalDB] ${recoveredCount} operações em status 'syncing' abandonadas foram recuperadas para 'pending'.`);
      }
    } catch (e) {
      console.warn('[LocalDB] Erro ao recuperar operações syncing:', e);
    }
    return recoveredCount;
  }

  async removeOperation(opId) {
    return this.delete('sync_queue', opId);
  }

  async updateOperationStatus(opId, status, error = null, extra = {}) {
    const op = await this.get('sync_queue', opId);
    if (op) {
      op.status = status;
      if (error !== undefined && error !== null) {
        op.error = error;
        op.lastError = error;
      }
      if (status === 'failed' || status === 'retrying') {
        op.retryCount = (op.retryCount || 0) + 1;
        op.lastAttempt = Date.now();
      }
      if (status === 'syncing') {
        op.lastAttempt = Date.now();
      }
      if (extra && typeof extra === 'object') {
        Object.assign(op, extra);
      }
      await this.put('sync_queue', op);
    }
  }

  // Carrega todos os dados do banco IndexedDB filtrando ESTRITAMENTE pela organização e expurgando deletados via B-Tree index
  async loadFullAppData(orgId) {
    if (!orgId) {
      return {
        settings: null,
        raffles: null,
        valesAndPrizes: null,
        fishingBookings: null,
        ranchoBookings: null,
        eduardoWorkDays: null
      };
    }

    const [settingsList, raffles, valesAndPrizes, fishingBookings, ranchoBookings, eduardoWorkDays, pendingOps] = await Promise.all([
      this.getAllByOrg('settings', orgId),
      this.getAllByOrg('raffles', orgId),
      this.getAllByOrg('vales_prizes', orgId),
      this.getAllByOrg('fishing_bookings', orgId),
      this.getAllByOrg('rancho_bookings', orgId),
      this.getAllByOrg('eduardo_work_days', orgId),
      this.getPendingOperations(orgId).catch(() => [])
    ]);

    // Extrai IDs que estão pendentes de exclusão no Outbox
    const deletedRaffleIds = new Set();
    const deletedValeIds = new Set();
    const deletedFishingIds = new Set();
    const deletedRanchoIds = new Set();
    const deletedEduardoDates = new Set();

    (pendingOps || []).forEach(op => {
      if (!op || !op.payload) return;
      if (op.type === 'DELETE_RAFFLE') deletedRaffleIds.add(String(op.payload.id || op.recordId));
      if (op.type === 'DELETE_VALE') deletedValeIds.add(String(op.payload.id || op.recordId));
      if (op.type === 'DELETE_FISHING_BOOKING') deletedFishingIds.add(String(op.payload.id || op.recordId));
      if (op.type === 'DELETE_RANCHO_BOOKING') deletedRanchoIds.add(String(op.payload.id || op.recordId));
      if (op.type === 'DELETE_EDUARDO_DAY') deletedEduardoDates.add(String(op.payload.date || op.recordId));
    });

    // Filtra estritamente pelo organization_id e exclui qualquer registro com deleção pendente
    const orgSettingsList = settingsList.filter(s => s.organization_id === orgId && !String(s.key || '').startsWith('_'));
    const orgRaffles = raffles.filter(r => r.organization_id === orgId && !deletedRaffleIds.has(String(r.id)));
    const orgVales = valesAndPrizes.filter(v => v.organization_id === orgId && !deletedValeIds.has(String(v.id)));
    const orgFishing = fishingBookings.filter(f => f.organization_id === orgId && !deletedFishingIds.has(String(f.id)));
    const orgRancho = ranchoBookings.filter(r => r.organization_id === orgId && !deletedRanchoIds.has(String(r.id)));
    const orgEduardo = eduardoWorkDays.filter(d => d.organization_id === orgId && !deletedEduardoDates.has(String(d.date)));

    const normalizedRaffles = orgRaffles.map(r => {
      if (typeof normalizeRaffle === 'function') {
        return normalizeRaffle(r);
      }
      return r;
    });

    const settings = {};
    orgSettingsList.forEach(s => { settings[s.key] = s.value; });

    return {
      settings: Object.keys(settings).length > 0 ? settings : null,
      raffles: normalizedRaffles.length > 0 ? normalizedRaffles : null,
      valesAndPrizes: orgVales.length > 0 ? orgVales : null,
      fishingBookings: orgFishing.length > 0 ? orgFishing : null,
      ranchoBookings: orgRancho.length > 0 ? orgRancho : null,
      eduardoWorkDays: orgEduardo.length > 0 ? orgEduardo : null
    };
  }

  // Salva todo o snapshot do appData no IndexedDB vinculado ao organization_id com RECONCILIAÇÃO REAL e BATCH TRANSACTIONS ultra rápidas
  async saveFullAppData(appData, orgId) {
    if (!appData || !orgId) return;

    // 1. Settings
    if (appData.settings && typeof appData.settings === 'object') {
      try {
        const existingSettings = await this.getAllByOrg('settings', orgId);
        const targetKeys = new Set(Object.keys(appData.settings));
        const keysToDelete = [];
        for (const s of existingSettings) {
          if (!String(s.key || '').startsWith('_') && !targetKeys.has(s.key)) {
            keysToDelete.push([orgId, s.key]);
          }
        }
        if (keysToDelete.length > 0) {
          await this.deleteBatch('settings', keysToDelete);
        }
        const settingEntries = Object.entries(appData.settings).map(([k, v]) => ({
          key: k,
          value: v,
          organization_id: orgId
        }));
        if (settingEntries.length > 0) {
          await this.putBatch('settings', settingEntries);
        }
      } catch (err) {
        console.warn('[LocalDB] Erro ao sincronizar settings:', err);
      }
    }

    // 2. Raffles
    if (Array.isArray(appData.raffles)) {
      try {
        const existingRaffles = await this.getAllByOrg('raffles', orgId);
        const currentIds = new Set(appData.raffles.map(r => String(r.id)));
        const idsToDelete = existingRaffles.filter(r => !currentIds.has(String(r.id))).map(r => r.id);
        if (idsToDelete.length > 0) {
          console.log(`[LocalDB] Reconciliação em lote: deletando ${idsToDelete.length} rifas excluídas do IndexedDB.`);
          await this.deleteBatch('raffles', idsToDelete);
        }
        if (appData.raffles.length > 0) {
          const normalizedRaffles = appData.raffles.map(r => {
            const norm = typeof normalizeRaffle === 'function' ? normalizeRaffle(r) : r;
            return { ...norm, organization_id: orgId };
          });
          await this.putBatch('raffles', normalizedRaffles);
        }
      } catch (err) {
        console.warn('[LocalDB] Erro ao reconciliar raffles:', err);
      }
    }

    // 3. Vales & Prêmios
    const valesList = appData.valesAndPrizes || appData.valesPrizes;
    if (Array.isArray(valesList)) {
      try {
        const existingVales = await this.getAllByOrg('vales_prizes', orgId);
        const currentIds = new Set(valesList.map(v => String(v.id)));
        const idsToDelete = existingVales.filter(v => !currentIds.has(String(v.id))).map(v => v.id);
        if (idsToDelete.length > 0) {
          console.log(`[LocalDB] Reconciliação em lote: deletando ${idsToDelete.length} vales excluídos do IndexedDB.`);
          await this.deleteBatch('vales_prizes', idsToDelete);
        }
        if (valesList.length > 0) {
          await this.putBatch('vales_prizes', valesList.map(v => ({ ...v, organization_id: orgId })));
        }
      } catch (err) {
        console.warn('[LocalDB] Erro ao reconciliar vales_prizes:', err);
      }
    }

    // 4. Fishing Bookings
    if (Array.isArray(appData.fishingBookings)) {
      try {
        const existingFishing = await this.getAllByOrg('fishing_bookings', orgId);
        const currentIds = new Set(appData.fishingBookings.map(f => String(f.id)));
        const idsToDelete = existingFishing.filter(f => !currentIds.has(String(f.id))).map(f => f.id);
        if (idsToDelete.length > 0) {
          console.log(`[LocalDB] Reconciliação em lote: deletando ${idsToDelete.length} reservas de pesca do IndexedDB.`);
          await this.deleteBatch('fishing_bookings', idsToDelete);
        }
        if (appData.fishingBookings.length > 0) {
          await this.putBatch('fishing_bookings', appData.fishingBookings.map(f => ({ ...f, organization_id: orgId })));
        }
      } catch (err) {
        console.warn('[LocalDB] Erro ao reconciliar fishing_bookings:', err);
      }
    }

    // 5. Rancho Bookings
    if (Array.isArray(appData.ranchoBookings)) {
      try {
        const existingRancho = await this.getAllByOrg('rancho_bookings', orgId);
        const currentIds = new Set(appData.ranchoBookings.map(r => String(r.id)));
        const idsToDelete = existingRancho.filter(r => !currentIds.has(String(r.id))).map(r => r.id);
        if (idsToDelete.length > 0) {
          console.log(`[LocalDB] Reconciliação em lote: deletando ${idsToDelete.length} locações do rancho do IndexedDB.`);
          await this.deleteBatch('rancho_bookings', idsToDelete);
        }
        if (appData.ranchoBookings.length > 0) {
          await this.putBatch('rancho_bookings', appData.ranchoBookings.map(r => ({ ...r, organization_id: orgId })));
        }
      } catch (err) {
        console.warn('[LocalDB] Erro ao reconciliar rancho_bookings:', err);
      }
    }

    // 6. Eduardo Work Days (keyPath: ['organization_id', 'date'])
    if (Array.isArray(appData.eduardoWorkDays)) {
      try {
        const existingEduardo = await this.getAllByOrg('eduardo_work_days', orgId);
        const currentDates = new Set(appData.eduardoWorkDays.map(d => String(d.date)));
        const keysToDelete = existingEduardo.filter(d => !currentDates.has(String(d.date))).map(d => [orgId, d.date]);
        if (keysToDelete.length > 0) {
          console.log(`[LocalDB] Reconciliação em lote: deletando ${keysToDelete.length} pontos do Eduardo do IndexedDB.`);
          await this.deleteBatch('eduardo_work_days', keysToDelete);
        }
        if (appData.eduardoWorkDays.length > 0) {
          await this.putBatch('eduardo_work_days', appData.eduardoWorkDays.map(d => ({ ...d, organization_id: orgId })));
        }
      } catch (err) {
        console.warn('[LocalDB] Erro ao reconciliar eduardo_work_days:', err);
      }
    }
  }

  // Helper para exclusão pontual no IndexedDB
  async deleteRecord(storeName, key) {
    try {
      await this.ready();
      await this.delete(storeName, key);
      console.log(`[LocalDB] Registro ${JSON.stringify(key)} deletado com sucesso de ${storeName}.`);
    } catch (e) {
      console.warn(`[LocalDB] Falha ao deletar ${JSON.stringify(key)} de ${storeName}:`, e);
    }
  }
}

// Singleton global
const localDB = (typeof window !== 'undefined' && window.localDB) ? window.localDB : new LocalDatabase();
if (typeof window !== 'undefined') {
  window.localDB = localDB;
  window.LocalDatabase = LocalDatabase;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LocalDatabase, localDB };
}

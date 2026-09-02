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

        // Raffles
        if (!db.objectStoreNames.contains('raffles')) {
          const store = db.createObjectStore('raffles', { keyPath: 'id' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
          store.createIndex('idx_status', 'status', { unique: false });
        }

        // Raffle Numbers
        if (!db.objectStoreNames.contains('raffle_numbers')) {
          const store = db.createObjectStore('raffle_numbers', { keyPath: '_key' });
          store.createIndex('idx_raffle_id', 'raffle_id', { unique: false });
          store.createIndex('idx_org', 'organization_id', { unique: false });
          store.createIndex('idx_org_raffle', ['organization_id', 'raffle_id'], { unique: false });
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

  // --- FILA DE SINCRONIZAÇÃO OUTBOX ---
  async enqueueOperation(op) {
    const orgId = op.orgId || (window.authManager ? window.authManager.getOrganizationId() : null);
    if (!orgId) {
      throw new Error('[LocalDB] Impossível enfileirar operação sem organization_id válido.');
    }

    const operation = {
      id: op.id || ('op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
      orgId: orgId,
      type: op.type,
      tableName: op.tableName,
      recordId: op.recordId,
      payload: op.payload,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending', // 'pending' | 'syncing' | 'conflict' | 'failed'
      error: null
    };

    await this.put('sync_queue', operation);
    return operation;
  }

  async getPendingOperations(filterOrgId = null) {
    const all = await this.getAll('sync_queue');
    const orgId = filterOrgId || (window.authManager ? window.authManager.getOrganizationId() : null);
    
    return all
      .filter(op => {
        const matchesOrg = !orgId || op.orgId === orgId;
        const matchesStatus = op.status === 'pending' || op.status === 'conflict' || op.status === 'failed';
        return matchesOrg && matchesStatus;
      })
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async removeOperation(opId) {
    return this.delete('sync_queue', opId);
  }

  async updateOperationStatus(opId, status, error = null) {
    const op = await this.get('sync_queue', opId);
    if (op) {
      op.status = status;
      if (error !== undefined) op.error = error;
      if (status === 'syncing') op.retryCount = (op.retryCount || 0) + 1;
      await this.put('sync_queue', op);
    }
  }

  // Carrega todos os dados do banco IndexedDB filtrando ESTRITAMENTE pela organização
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

    const [settingsList, raffles, valesAndPrizes, fishingBookings, ranchoBookings, eduardoWorkDays] = await Promise.all([
      this.getAll('settings'),
      this.getAll('raffles'),
      this.getAll('vales_prizes'),
      this.getAll('fishing_bookings'),
      this.getAll('rancho_bookings'),
      this.getAll('eduardo_work_days')
    ]);

    // Filtra estritamente pelo organization_id
    const orgSettingsList = settingsList.filter(s => s.organization_id === orgId);
    const orgRaffles = raffles.filter(r => r.organization_id === orgId);
    const orgVales = valesAndPrizes.filter(v => v.organization_id === orgId);
    const orgFishing = fishingBookings.filter(f => f.organization_id === orgId);
    const orgRancho = ranchoBookings.filter(r => r.organization_id === orgId);
    const orgEduardo = eduardoWorkDays.filter(d => d.organization_id === orgId);

    const settings = {};
    orgSettingsList.forEach(s => { settings[s.key] = s.value; });

    return {
      settings: Object.keys(settings).length > 0 ? settings : null,
      raffles: orgRaffles.length > 0 ? orgRaffles : null,
      valesAndPrizes: orgVales.length > 0 ? orgVales : null,
      fishingBookings: orgFishing.length > 0 ? orgFishing : null,
      ranchoBookings: orgRancho.length > 0 ? orgRancho : null,
      eduardoWorkDays: orgEduardo.length > 0 ? orgEduardo : null
    };
  }

  // Salva todo o snapshot do appData no IndexedDB vinculado ao organization_id
  async saveFullAppData(appData, orgId) {
    if (!appData || !orgId) return;

    // Settings
    if (appData.settings && typeof appData.settings === 'object') {
      const settingEntries = Object.entries(appData.settings).map(([k, v]) => ({
        key: k,
        value: v,
        organization_id: orgId
      }));
      await this.putBatch('settings', settingEntries);
    }

    // Raffles
    if (Array.isArray(appData.raffles) && appData.raffles.length > 0) {
      await this.putBatch('raffles', appData.raffles.map(r => ({ ...r, organization_id: orgId })));
    }

    // Vales & Prêmios
    if (Array.isArray(appData.valesAndPrizes) && appData.valesAndPrizes.length > 0) {
      await this.putBatch('vales_prizes', appData.valesAndPrizes.map(v => ({ ...v, organization_id: orgId })));
    }

    // Fishing
    if (Array.isArray(appData.fishingBookings) && appData.fishingBookings.length > 0) {
      await this.putBatch('fishing_bookings', appData.fishingBookings.map(f => ({ ...f, organization_id: orgId })));
    }

    // Rancho
    if (Array.isArray(appData.ranchoBookings) && appData.ranchoBookings.length > 0) {
      await this.putBatch('rancho_bookings', appData.ranchoBookings.map(r => ({ ...r, organization_id: orgId })));
    }

    // Eduardo
    if (Array.isArray(appData.eduardoWorkDays) && appData.eduardoWorkDays.length > 0) {
      await this.putBatch('eduardo_work_days', appData.eduardoWorkDays.map(d => ({ ...d, organization_id: orgId })));
    }
  }

  // Helper para exclusão pontual no IndexedDB
  async deleteRecord(storeName, key) {
    try {
      await this.delete(storeName, key);
    } catch (e) {
      console.warn(`[LocalDB] Falha ao deletar ${key} de ${storeName}:`, e);
    }
  }
}

// Singleton global
window.localDB = new LocalDatabase();

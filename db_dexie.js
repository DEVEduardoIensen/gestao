/**
 * Eldorado Pesca & Lake - Dexie.js / IndexedDB Offline Persistence Layer
 * Armazenamento local ultra-rápido, resiliente e offline-first com fila outbox.
 */

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

class LocalDatabase {
  constructor() {
    this.dbName = 'EldoradoPesca_v2';
    this.version = 2;
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
          const store = db.createObjectStore('settings', { keyPath: 'key' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
        }

        // Raffles
        if (!db.objectStoreNames.contains('raffles')) {
          const store = db.createObjectStore('raffles', { keyPath: 'id' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
          store.createIndex('idx_status', 'status', { unique: false });
        }

        // Raffle Numbers: composite key id (org_raffle_num)
        if (!db.objectStoreNames.contains('raffle_numbers')) {
          const store = db.createObjectStore('raffle_numbers', { keyPath: '_key' });
          store.createIndex('idx_raffle_id', 'raffle_id', { unique: false });
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
          const store = db.createObjectStore('eduardo_work_days', { keyPath: 'date' });
          store.createIndex('idx_org', 'organization_id', { unique: false });
        }

        // Fila de Sincronização Outbox
        if (!db.objectStoreNames.contains('sync_queue')) {
          const store = db.createObjectStore('sync_queue', { keyPath: 'id' });
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
    const operation = {
      id: op.id || ('op-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6)),
      orgId: op.orgId || DEFAULT_ORG_ID,
      type: op.type, // 'SELL_NUMBERS', 'CREATE_RAFFLE', 'UPDATE_VALE', 'BOOK_FISHING', 'BOOK_RANCHO', 'SET_EDUARDO_DAY', etc.
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

  async getPendingOperations() {
    const all = await this.getAll('sync_queue');
    return all
      .filter(op => op.status === 'pending' || op.status === 'conflict' || op.status === 'failed')
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async removeOperation(opId) {
    return this.delete('sync_queue', opId);
  }

  async updateOperationStatus(opId, status, error = null) {
    const op = await this.get('sync_queue', opId);
    if (op) {
      op.status = status;
      if (error) op.error = error;
      if (status === 'syncing') op.retryCount = (op.retryCount || 0) + 1;
      await this.put('sync_queue', op);
    }
  }

  // Carrega todos os dados do banco IndexedDB para a memória do app
  async loadFullAppData(orgId = DEFAULT_ORG_ID) {
    const [settingsList, raffles, valesAndPrizes, fishingBookings, ranchoBookings, eduardoWorkDays] = await Promise.all([
      this.getAll('settings'),
      this.getAll('raffles'),
      this.getAll('vales_prizes'),
      this.getAll('fishing_bookings'),
      this.getAll('rancho_bookings'),
      this.getAll('eduardo_work_days')
    ]);

    // Transforma array de settings em objeto chave-valor
    const settings = {};
    settingsList.forEach(s => { settings[s.key] = s.value; });

    return {
      settings: Object.keys(settings).length > 0 ? settings : null,
      raffles: raffles.length > 0 ? raffles : null,
      valesAndPrizes: valesAndPrizes.length > 0 ? valesAndPrizes : null,
      fishingBookings: fishingBookings.length > 0 ? fishingBookings : null,
      ranchoBookings: ranchoBookings.length > 0 ? ranchoBookings : null,
      eduardoWorkDays: eduardoWorkDays.length > 0 ? eduardoWorkDays : null
    };
  }

  // Salva todo o snapshot do appData no IndexedDB
  async saveFullAppData(appData, orgId = DEFAULT_ORG_ID) {
    if (!appData) return;

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
}

// Singleton global
window.localDB = new LocalDatabase();

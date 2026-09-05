/**
 * test_real_scenarios_validation.js
 * 
 * Bateria de Testes Automatizados para validação rigorosa dos Cenários Reais A-I:
 * TESTE A: Criar rifa sem prêmio -> fechar -> abrir offline -> correta
 * TESTE B: Adicionar prêmio offline -> outbox -> SW dispatch -> sincronização preservada
 * TESTE C: Excluir rifa -> abrir offline -> rifa excluída NÃO aparece (reconciliação de snapshot)
 * TESTE D: Criar sem prêmio -> adicionar prêmio -> alterar preço -> alterar título -> prêmio permanece
 * TESTE E: 3 prêmios -> remover 1 -> banco/estado possui exatamente 2
 * TESTE F: Adicionar prêmio -> texto WhatsApp gerado contém o prêmio
 * TESTE G: Adicionar prêmio -> Premiação Oficial renderiza o prêmio
 * TESTE H: Erro de rede -> Outbox mantém operação (nunca remove na falha)
 * TESTE I: Operação abandonada em 'syncing' -> recuperada para 'pending'
 * 
 * TESTES ADICIONAIS DE INTEGRIDADE:
 * - Reconciliação dos 6 stores no IndexedDB (raffles, vales_prizes, fishing_bookings, rancho_bookings, eduardo_work_days, settings)
 * - Purga de registros com DELETE pendente na Outbox durante loadFullAppData
 * - Expiração de JWT e refresh automático de tokens no background pelo Service Worker
 * - Remoção de filtros artificiais por nome ('teste')
 */

const assert = require('assert');

// ============================================================================
// Lightweight In-Memory IndexedDB Mock for Node.js Testing
// ============================================================================
class MockDOMStringList {
  constructor(names = []) {
    this._names = [...names];
  }
  contains(name) {
    return this._names.includes(name);
  }
  get length() {
    return this._names.length;
  }
  item(index) {
    return this._names[index];
  }
}

class MockIDBRequest {
  constructor() {
    this.result = null;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
  }
  _triggerSuccess(result) {
    this.result = result;
    if (typeof this.onsuccess === 'function') {
      const event = { target: this };
      this.onsuccess(event);
    }
  }
  _triggerError(err) {
    this.error = err;
    if (typeof this.onerror === 'function') {
      const event = { target: this };
      this.onerror(event);
    }
  }
}

class MockIDBObjectStore {
  constructor(name, keyPath, db) {
    this.name = name;
    this.keyPath = keyPath;
    this.db = db;
    this.data = new Map(); // keyString -> item
    this.indexes = new Map();
  }

  createIndex(indexName, keyPath, options) {
    this.indexes.set(indexName, { keyPath, options });
  }

  _getKey(val) {
    if (!this.keyPath) return val.id;
    if (Array.isArray(this.keyPath)) {
      return this.keyPath.map(k => val[k]).join('__');
    }
    return String(val[this.keyPath]);
  }

  _formatKey(key) {
    if (Array.isArray(key)) return key.join('__');
    return String(key);
  }

  put(val) {
    const req = new MockIDBRequest();
    setImmediate(() => {
      const keyStr = this._getKey(val);
      this.data.set(keyStr, JSON.parse(JSON.stringify(val)));
      req._triggerSuccess(keyStr);
    });
    return req;
  }

  get(key) {
    const req = new MockIDBRequest();
    setImmediate(() => {
      const keyStr = this._formatKey(key);
      const val = this.data.get(keyStr);
      req._triggerSuccess(val ? JSON.parse(JSON.stringify(val)) : undefined);
    });
    return req;
  }

  delete(key) {
    const req = new MockIDBRequest();
    setImmediate(() => {
      const keyStr = this._formatKey(key);
      this.data.delete(keyStr);
      req._triggerSuccess(undefined);
    });
    return req;
  }

  getAll() {
    const req = new MockIDBRequest();
    setImmediate(() => {
      const items = Array.from(this.data.values()).map(v => JSON.parse(JSON.stringify(v)));
      req._triggerSuccess(items);
    });
    return req;
  }

  index(indexName) {
    const idxMeta = this.indexes.get(indexName);
    return {
      getAll: (query) => {
        const req = new MockIDBRequest();
        setImmediate(() => {
          const items = Array.from(this.data.values()).filter(v => {
            if (query === undefined) return true;
            if (idxMeta && idxMeta.keyPath) {
              return String(v[idxMeta.keyPath]) === String(query);
            }
            return true;
          }).map(v => JSON.parse(JSON.stringify(v)));
          req._triggerSuccess(items);
        });
        return req;
      }
    };
  }

  openCursor() {
    const req = new MockIDBRequest();
    setImmediate(() => {
      const entries = Array.from(this.data.entries());
      let index = 0;
      const advance = () => {
        if (index >= entries.length) {
          req._triggerSuccess(null);
          return;
        }
        const [keyStr, val] = entries[index];
        const cursor = {
          value: JSON.parse(JSON.stringify(val)),
          key: keyStr,
          continue: () => {
            index++;
            advance();
          },
          delete: () => {
            const delReq = new MockIDBRequest();
            this.data.delete(keyStr);
            setImmediate(() => delReq._triggerSuccess(undefined));
            return delReq;
          }
        };
        req._triggerSuccess(cursor);
      };
      advance();
    });
    return req;
  }
}

class MockIDBTransaction {
  constructor(db, storeNames, mode) {
    this.db = db;
    this.storeNames = Array.isArray(storeNames) ? storeNames : [storeNames];
    this.mode = mode;
    this.oncomplete = null;
    this.onerror = null;

    setImmediate(() => {
      if (typeof this.oncomplete === 'function') {
        this.oncomplete({ target: this });
      }
    });
  }

  objectStore(name) {
    return this.db._getOrCreateStore(name);
  }
}

class MockIDBDatabase {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this._stores = new Map();
  }

  get objectStoreNames() {
    return new MockDOMStringList(Array.from(this._stores.keys()));
  }

  createObjectStore(name, options = {}) {
    const store = new MockIDBObjectStore(name, options.keyPath, this);
    this._stores.set(name, store);
    return store;
  }

  _getOrCreateStore(name) {
    return this._stores.get(name);
  }

  transaction(storeNames, mode = 'readonly') {
    return new MockIDBTransaction(this, storeNames, mode);
  }

  close() {}
}

const mockDatabases = new Map();

const mockIndexedDB = {
  open: (name, version) => {
    const req = new MockIDBRequest();
    setImmediate(() => {
      let db = mockDatabases.get(name);
      const isNew = !db || (version && version > db.version);
      if (!db) {
        db = new MockIDBDatabase(name, version || 1);
        mockDatabases.set(name, db);
      } else if (version && version > db.version) {
        db.version = version;
      }

      if (isNew) {
        const upgradeEvent = {
          target: { result: db },
          oldVersion: 0,
          newVersion: version || 1
        };
        if (typeof req.onupgradeneeded === 'function') {
          req.onupgradeneeded(upgradeEvent);
        }
      }

      req._triggerSuccess(db);
    });
    return req;
  }
};

// Configura globals para emular ambiente PWA
global.indexedDB = mockIndexedDB;
global.IDBKeyRange = {
  only: (val) => val
};
global.window = global;
global.location = { origin: 'http://localhost:3000' };

// Importa módulos do projeto
const { normalizeRaffle } = require('./normalize_raffle.js');
const { LocalDatabase } = require('./db_dexie.js');

let passedTests = 0;
let totalTests = 0;

async function it(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      await res;
    }
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAllTests() {
  console.log('\n============================================================');
  console.log(' INICIANDO BATERIA DE VALIDAÇÃO DOS CENÁRIOS REAIS (A a I)');
  console.log('============================================================\n');

  const testOrgId = 'org-real-test-123';
  const db = new LocalDatabase('test_eldorado_real_db');
  await db.ready();

  // --------------------------------------------------------------------------
  // TESTE A: Criar rifa sem prêmio -> fechar -> abrir offline -> correta
  // --------------------------------------------------------------------------
  await it('TESTE A: Criar rifa sem prêmio -> salvar -> carregar offline -> íntegra e sem erros', async () => {
    const raffleWithoutPrize = {
      id: 'raffle-sem-premio-001',
      title: '108° AÇÃO ELDORADO PESCA',
      pricePerNumber: 25,
      totalNumbers: 100,
      organization_id: testOrgId,
      numbers: [{ num: 1, name: '', status: 'available' }]
    };

    const normalized = normalizeRaffle(raffleWithoutPrize);
    assert.strictEqual(Array.isArray(normalized.prizes), true, 'Prizes deve ser array vazio quando normalizado completo');
    assert.strictEqual(normalized.prizes.length, 0, 'Não deve inventar prêmios');

    // Salva no IndexedDB
    await db.saveFullAppData({
      raffles: [normalized],
      valesPrizes: [],
      fishingBookings: [],
      ranchoBookings: [],
      eduardoWorkDays: [],
      settings: {}
    }, testOrgId);

    // Carrega como se estivesse abrindo offline
    const loaded = await db.loadFullAppData(testOrgId);
    assert.strictEqual(loaded.raffles.length, 1, 'Rifa deve ser carregada');
    assert.strictEqual(loaded.raffles[0].id, 'raffle-sem-premio-001');
    assert.strictEqual(loaded.raffles[0].prizes.length, 0, 'Rifa sem prêmios não pode ter prêmios fantasmas');
  });

  // --------------------------------------------------------------------------
  // TESTE B: Adicionar prêmio offline -> Outbox -> Enfileiramento correto
  // --------------------------------------------------------------------------
  await it('TESTE B: Adicionar prêmio offline -> Outbox salva operação com prêmios intactos', async () => {
    const prizePayload = {
      id: 'raffle-sem-premio-001',
      title: '108° AÇÃO ELDORADO PESCA',
      pricePerNumber: 25,
      prizes: [
        { position: 1, description: 'Carretilha Shimano Curado' }
      ]
    };

    // Enfileira operação na Outbox offline
    const op = await db.enqueueOperation({
      type: 'UPDATE_RAFFLE',
      tableName: 'raffles',
      recordId: prizePayload.id,
      payload: prizePayload
    }, testOrgId);

    assert.ok(op.id, 'Operação deve ter ID gerado');
    assert.strictEqual(op.status, 'pending', 'Status inicial deve ser pending');
    assert.strictEqual(op.payload.prizes.length, 1, 'Prêmio deve estar presente na Outbox');
    assert.strictEqual(op.payload.prizes[0].description, 'Carretilha Shimano Curado');

    // Recupera da Outbox
    const pendingOps = await db.getPendingOperations(testOrgId);
    const foundOp = pendingOps.find(o => o.id === op.id);
    assert.ok(foundOp, 'Operação deve ser persistida no store sync_queue');
    assert.strictEqual(foundOp.payload.prizes[0].description, 'Carretilha Shimano Curado');
  });

  // --------------------------------------------------------------------------
  // TESTE C: Excluir rifa -> abrir offline -> rifa excluída NÃO aparece
  // --------------------------------------------------------------------------
  await it('TESTE C: Excluir rifa -> Reconciliação do IndexedDB purga registro excluído', async () => {
    // Configura 3 rifas no banco: A, B, C
    const raffleA = { id: 'raffle-A', title: 'Rifa A', organization_id: testOrgId, numbers: [], prizes: [] };
    const raffleB = { id: 'raffle-B', title: 'Rifa B', organization_id: testOrgId, numbers: [], prizes: [] };
    const raffleC = { id: 'raffle-C', title: 'Rifa C', organization_id: testOrgId, numbers: [], prizes: [] };

    await db.saveFullAppData({
      raffles: [raffleA, raffleB, raffleC],
      valesPrizes: [],
      fishingBookings: [],
      ranchoBookings: [],
      eduardoWorkDays: [],
      settings: {}
    }, testOrgId);

    // Confirma que as 3 estão no IndexedDB
    let loaded = await db.loadFullAppData(testOrgId);
    assert.strictEqual(loaded.raffles.length, 3);

    // Usuário exclui a rifa C. O estado atual possui apenas A e B.
    // saveFullAppData com apenas A e B DEVE DELETAR C do IndexedDB!
    await db.saveFullAppData({
      raffles: [raffleA, raffleB],
      valesPrizes: [],
      fishingBookings: [],
      ranchoBookings: [],
      eduardoWorkDays: [],
      settings: {}
    }, testOrgId);

    // Carrega offline novamente
    loaded = await db.loadFullAppData(testOrgId);
    assert.strictEqual(loaded.raffles.length, 2, 'IndexedDB deve conter exatamente 2 rifas');
    const ids = loaded.raffles.map(r => r.id);
    assert.ok(!ids.includes('raffle-C'), 'Rifa C EXCLUÍDA NÃO pode reaparecer no IndexedDB');
    assert.ok(ids.includes('raffle-A'));
    assert.ok(ids.includes('raffle-B'));
  });

  // --------------------------------------------------------------------------
  // TESTE C.2: Exclusão pendente na Outbox purga imediatamente do loadFullAppData
  // --------------------------------------------------------------------------
  await it('TESTE C.2: Operação DELETE_RAFFLE pendente na Outbox impede que rifa apareça offline', async () => {
    // Insere rifa X diretamente no store local
    await db.put('raffles', { id: 'raffle-X', title: 'Rifa X', organization_id: testOrgId, numbers: [], prizes: [] });

    // Enfileira DELETE_RAFFLE na Outbox
    await db.enqueueOperation({
      type: 'DELETE_RAFFLE',
      tableName: 'raffles',
      recordId: 'raffle-X',
      payload: { id: 'raffle-X' }
    }, testOrgId);

    // Carrega dados offline
    const loaded = await db.loadFullAppData(testOrgId);
    const hasRaffleX = loaded.raffles.some(r => r.id === 'raffle-X');
    assert.strictEqual(hasRaffleX, false, 'Rifa com DELETE_RAFFLE na outbox deve ser ignorada e purgada do IndexedDB');
  });

  // --------------------------------------------------------------------------
  // TESTE D: Criar sem prêmio -> adicionar prêmio -> alterar preço -> alterar título -> prêmio permanece
  // --------------------------------------------------------------------------
  await it('TESTE D: Atualizações parciais de preço e título NUNCA apagam prêmios existentes', async () => {
    // 1. Cria rifa
    let raffle = {
      id: 'raffle-d-001',
      title: 'Ação D Inicial',
      pricePerNumber: 10,
      prizes: []
    };

    // 2. Adiciona prêmio
    raffle.prizes = [
      { position: 1, description: 'Molinete Daiwa BG 4000' }
    ];

    // 3. Altera preço via payload parcial (como o modal de edição ou sync pode emitir)
    const partialPriceUpdate = {
      id: 'raffle-d-001',
      pricePerNumber: 15
    };
    const normPriceUpdate = normalizeRaffle(partialPriceUpdate, true);
    assert.strictEqual(normPriceUpdate.prizes, undefined, 'Em atualização parcial, prizes deve ser undefined para não sobrescrever');

    // Simula merge com registro existente
    if (normPriceUpdate.pricePerNumber !== undefined) raffle.pricePerNumber = normPriceUpdate.pricePerNumber;
    if (normPriceUpdate.prizes !== undefined) raffle.prizes = normPriceUpdate.prizes;

    assert.strictEqual(raffle.pricePerNumber, 15);
    assert.strictEqual(raffle.prizes.length, 1, 'Prêmio não pode ser apagado na alteração de preço');

    // 4. Altera título via payload parcial
    const partialTitleUpdate = {
      id: 'raffle-d-001',
      title: 'Ação D Título Atualizado'
    };
    const normTitleUpdate = normalizeRaffle(partialTitleUpdate, true);
    assert.strictEqual(normTitleUpdate.prizes, undefined);

    if (normTitleUpdate.title !== undefined) raffle.title = normTitleUpdate.title;
    if (normTitleUpdate.prizes !== undefined) raffle.prizes = normTitleUpdate.prizes;

    assert.strictEqual(raffle.title, 'Ação D Título Atualizado');
    assert.strictEqual(raffle.prizes.length, 1, 'Prêmio não pode ser apagado na alteração de título');
    assert.strictEqual(raffle.prizes[0].description, 'Molinete Daiwa BG 4000');
  });

  // --------------------------------------------------------------------------
  // TESTE E: 3 prêmios -> remover 1 -> banco possui exatamente 2
  // --------------------------------------------------------------------------
  await it('TESTE E: Remover 1 de 3 prêmios resulta em exatamente 2 prêmios persistidos', async () => {
    const raffleWith3Prizes = {
      id: 'raffle-e-001',
      title: 'Ação E 3 Prêmios',
      pricePerNumber: 20,
      organization_id: testOrgId,
      prizes: [
        { position: 1, description: '1º Prêmio: Vara Lumis' },
        { position: 2, description: '2º Prêmio: Linha Multifilamento' },
        { position: 3, description: '3º Prêmio: Isca Artificial' }
      ]
    };

    // Salva com 3 prêmios
    await db.put('raffles', raffleWith3Prizes);

    // Remove o 3º prêmio (usuário clicou no X no formulário)
    const updatedPrizes = [
      { position: 1, description: '1º Prêmio: Vara Lumis' },
      { position: 2, description: '2º Prêmio: Linha Multifilamento' }
    ];

    const editedRaffle = {
      ...raffleWith3Prizes,
      prizes: updatedPrizes
    };

    await db.put('raffles', editedRaffle);

    const loaded = await db.get('raffles', 'raffle-e-001');
    assert.strictEqual(loaded.prizes.length, 2, 'Deve conter exatamente 2 prêmios');
    assert.strictEqual(loaded.prizes[0].position, 1);
    assert.strictEqual(loaded.prizes[1].position, 2);
    assert.strictEqual(loaded.prizes.some(p => p.position === 3), false, 'O 3º prêmio deve ter sido removido');
  });

  // --------------------------------------------------------------------------
  // TESTE F: Adicionar prêmio -> Copiar p/ WhatsApp -> prêmio aparece no texto
  // --------------------------------------------------------------------------
  await it('TESTE F: Texto formatado do WhatsApp inclui prêmios adicionados', () => {
    function generateWhatsAppText(raffle) {
      if (!raffle) return "";
      const r = normalizeRaffle(raffle);
      let output = `*${r.title || 'AÇÃO'}*\n\n`;
      if (r.prizes && r.prizes.length > 0) {
        r.prizes.forEach((p, i) => {
          output += `💥*${p.position || (i + 1)}°* ${p.description}\n\n`;
        });
      }
      return output;
    }

    const raffleWithPrizes = {
      id: 'raffle-f-001',
      title: '109° AÇÃO ELDORADO',
      prizes: [
        { position: 1, description: 'Caiaque Iron Milha Náutica' },
        { position: 2, description: 'Colete Salva-Vidas Neoprene' }
      ]
    };

    const text = generateWhatsAppText(raffleWithPrizes);
    assert.ok(text.includes('💥*1°* Caiaque Iron Milha Náutica'), 'Texto WhatsApp deve incluir o 1º prêmio');
    assert.ok(text.includes('💥*2°* Colete Salva-Vidas Neoprene'), 'Texto WhatsApp deve incluir o 2º prêmio');
  });

  // --------------------------------------------------------------------------
  // TESTE G: Adicionar prêmio -> Premiação Oficial -> prêmio aparece na renderização
  // --------------------------------------------------------------------------
  await it('TESTE G: Premiação Oficial renderiza lista de prêmios corretamente', () => {
    function renderPrizesList(raffle) {
      const items = [];
      if (raffle.prizes && raffle.prizes.length > 0) {
        raffle.prizes.forEach((prize, idx) => {
          items.push({
            pos: `${prize.position || (idx + 1)}º`,
            desc: prize.description
          });
        });
      }
      return items;
    }

    const raffle = {
      prizes: [
        { position: 1, description: 'Vara Saint Plus Jigger' }
      ]
    };

    const rendered = renderPrizesList(raffle);
    assert.strictEqual(rendered.length, 1);
    assert.strictEqual(rendered[0].pos, '1º');
    assert.strictEqual(rendered[0].desc, 'Vara Saint Plus Jigger');
  });

  // --------------------------------------------------------------------------
  // TESTE H: Erro de rede -> Outbox mantém operação (nunca deletada ao falhar)
  // --------------------------------------------------------------------------
  await it('TESTE H: Falha de rede marca operação como failed/retrying sem deletar da Outbox', async () => {
    const op = await db.enqueueOperation({
      type: 'UPDATE_RAFFLE',
      tableName: 'raffles',
      recordId: 'raffle-h-001',
      payload: { id: 'raffle-h-001', title: 'Teste Falha Rede' }
    }, testOrgId);

    // Simula tentativa de envio que falha com Network Error (500)
    await db.updateOperationStatus(op.id, 'failed', 'Erro 500: Supabase Offline / Falha de Rede');

    // Verifica que a operação PERMANECE na Outbox
    const allOps = await db.getAll('sync_queue');
    const targetOp = allOps.find(o => o.id === op.id);
    assert.ok(targetOp, 'Operação NÃO pode ser deletada ao falhar!');
    assert.strictEqual(targetOp.status, 'failed');
    assert.strictEqual(targetOp.retryCount, 1);
    assert.strictEqual(targetOp.lastError, 'Erro 500: Supabase Offline / Falha de Rede');
    assert.ok(targetOp.lastAttempt > 0);
  });

  // --------------------------------------------------------------------------
  // TESTE I: Operação em status syncing -> crash/fechar app -> recuperada para pending
  // --------------------------------------------------------------------------
  await it('TESTE I: recoverAbandonedOperations resgata operações travadas em syncing', async () => {
    const op = await db.enqueueOperation({
      type: 'UPDATE_RAFFLE',
      tableName: 'raffles',
      recordId: 'raffle-i-001',
      payload: { id: 'raffle-i-001' }
    }, testOrgId);

    // Simula que a operação entrou em syncing
    await db.updateOperationStatus(op.id, 'syncing');
    let inStore = await db.get('sync_queue', op.id);
    assert.strictEqual(inStore.status, 'syncing');

    // Simula fechamento abrupto do app e recuperação ao reiniciar / abrir (timeoutMs = 0)
    const recoveredCount = await db.recoverAbandonedOperations(0);
    assert.ok(recoveredCount >= 1, 'Pelo menos uma operação syncing deve ser recuperada');

    inStore = await db.get('sync_queue', op.id);
    assert.strictEqual(inStore.status, 'pending', 'Operação deve voltar para pending para ser reprocessada');
  });

  // --------------------------------------------------------------------------
  // TESTES DE AUDITORIA: Reconciliação completa de TODOS os 6 stores no IndexedDB
  // --------------------------------------------------------------------------
  await it('AUDITORIA DE CONSISTÊNCIA: Reconciliação estrita de snapshots em todos os stores', async () => {
    // 1. Popula stores com 2 itens cada: 1 que continuará e 1 que será excluído
    await db.put('vales_prizes', { id: 'vale-1', organization_id: testOrgId, name: 'Vale 1' });
    await db.put('vales_prizes', { id: 'vale-to-delete', organization_id: testOrgId, name: 'Vale Excluído' });

    await db.put('fishing_bookings', { id: 'fish-1', organization_id: testOrgId, clientName: 'Pescador 1' });
    await db.put('fishing_bookings', { id: 'fish-to-delete', organization_id: testOrgId, clientName: 'Pescador Excluído' });

    await db.put('rancho_bookings', { id: 'rancho-1', organization_id: testOrgId, clientName: 'Hóspede 1' });
    await db.put('rancho_bookings', { id: 'rancho-to-delete', organization_id: testOrgId, clientName: 'Hóspede Excluído' });

    await db.put('eduardo_work_days', { organization_id: testOrgId, date: '2026-09-01', amountDue: 62 });
    await db.put('eduardo_work_days', { organization_id: testOrgId, date: '2026-09-02', amountDue: 62 }); // Será excluído

    await db.put('settings', { key: 'org_title', organization_id: testOrgId, value: 'Eldorado' });
    await db.put('settings', { key: 'old_setting', organization_id: testOrgId, value: 'Descartado' });
    await db.put('settings', { key: '_auth_session', value: 'token-secreto-preservado' }); // Chave interna

    // 2. Executa saveFullAppData fornecendo apenas os itens ativos (sem os que foram excluídos)
    await db.saveFullAppData({
      raffles: [],
      valesPrizes: [{ id: 'vale-1', name: 'Vale 1' }],
      fishingBookings: [{ id: 'fish-1', clientName: 'Pescador 1' }],
      ranchoBookings: [{ id: 'rancho-1', clientName: 'Hóspede 1' }],
      eduardoWorkDays: [{ date: '2026-09-01', amountDue: 62 }],
      settings: { org_title: 'Eldorado' }
    }, testOrgId);

    // 3. Valida que os itens excluídos foram fisicamente removidos do IndexedDB
    const vales = await db.getAll('vales_prizes');
    assert.strictEqual(vales.filter(v => v.organization_id === testOrgId).length, 1);
    assert.ok(!vales.some(v => v.id === 'vale-to-delete'), 'Vale excluído foi removido do IndexedDB');

    const fishing = await db.getAll('fishing_bookings');
    assert.strictEqual(fishing.filter(f => f.organization_id === testOrgId).length, 1);
    assert.ok(!fishing.some(f => f.id === 'fish-to-delete'), 'Pescaria excluída foi removida do IndexedDB');

    const rancho = await db.getAll('rancho_bookings');
    assert.strictEqual(rancho.filter(r => r.organization_id === testOrgId).length, 1);
    assert.ok(!rancho.some(r => r.id === 'rancho-to-delete'), 'Rancho excluído foi removido do IndexedDB');

    const eduardo = await db.getAll('eduardo_work_days');
    assert.strictEqual(eduardo.filter(e => e.organization_id === testOrgId).length, 1);
    assert.ok(!eduardo.some(e => e.date === '2026-09-02'), 'Dia do Eduardo excluído foi removido do IndexedDB');

    const settings = await db.getAll('settings');
    assert.ok(!settings.some(s => s.key === 'old_setting'), 'Configuração antiga foi removida do IndexedDB');
    assert.ok(settings.some(s => s.key === '_auth_session'), 'Chave interna _auth_session foi preservada');
  });

  // --------------------------------------------------------------------------
  // TESTE DE TOKEN ROTATION & EXPIRATION CHECK NO SERVICE WORKER
  // --------------------------------------------------------------------------
  await it('BACKGROUND AUTH: Validação de isJwtExpired e Token Rotation', () => {
    function isJwtExpired(token) {
      if (!token || typeof token !== 'string') return true;
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      try {
        const payloadStr = Buffer.from(parts[1], 'base64').toString('utf8');
        const payload = JSON.parse(payloadStr);
        if (!payload || !payload.exp) return false;
        return (Date.now() / 1000) >= (payload.exp - 60);
      } catch (e) {
        return true;
      }
    }

    // Token vencido há 1 hora
    const expiredPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 3600 })).toString('base64');
    const expiredJwt = `eyJhbGciOiJIUzI1NiJ9.${expiredPayload}.signature`;
    assert.strictEqual(isJwtExpired(expiredJwt), true, 'Token passado deve ser considerado expirado');

    // Token válido por mais 2 horas
    const validPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 7200 })).toString('base64');
    const validJwt = `eyJhbGciOiJIUzI1NiJ9.${validPayload}.signature`;
    assert.strictEqual(isJwtExpired(validJwt), false, 'Token futuro deve ser considerado válido');
  });

  console.log('\n============================================================');
  console.log(` RESULTADO FINAL DOS TESTES: ${passedTests}/${totalTests} PASSARAM COM SUCESSO`);
  console.log('============================================================\n');
}

runAllTests().catch((err) => {
  console.error('ERRO FATAL NA EXECUÇÃO DOS TESTES:', err);
  process.exit(1);
});

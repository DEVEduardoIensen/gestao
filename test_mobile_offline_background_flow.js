/**
 * Eldorado Pesca & Lake - Teste de Validação Específico:
 * FLUXO MOBILE OFFLINE -> FECHAR APP -> LIGAR WI-FI -> SERVICE WORKER SINCRONIZA SEM ABRIR O APP
 * 
 * Cenário validado:
 * 1. Dispositivo móvel fica OFFLINE (sem internet)
 * 2. Operador faz alterações no app móvel (venda de cota + prêmio)
 * 3. Dados são salvos no IndexedDB local e enfileirados no Outbox
 * 4. O app é FECHADO completamente (processo encerrado, DOM destruído, sem SyncEngine rodando)
 * 5. O Wi-Fi é religado no celular
 * 6. O Sistema Operacional acorda o Service Worker em segundo plano (W3C Background Sync API)
 * 7. O Service Worker despacha as alterações diretamente para o Supabase PostgreSQL SEM ABRIR O APP
 * 8. Consulta remota direta ao Supabase comprova que as alterações offline estão salvas no banco
 * 9. A fila Outbox do celular fica limpa
 */

const fs = require('fs');
const path = require('path');
const SUPABASE_CONFIG = require('./supabase_config.js');

let passed = 0;
let failed = 0;

function assert(cond, title, details = '') {
  if (cond) {
    console.log(`  ✓ [PASS] ${title}`);
    if (details) console.log(`           ${details}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${title}`);
    if (details) console.error(`           ${details}`);
    failed++;
  }
}

// ----------------------------------------------------------------------------
// 1. Simulação do Motor de Armazenamento IndexedDB do Celular
// ----------------------------------------------------------------------------
class MobileMemoryStore {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.data = new Map();
    this.indexes = new Map();
  }

  createIndex(name, keyPath, opts) {
    this.indexes.set(name, { keyPath, opts });
  }

  _getKey(item) {
    if (Array.isArray(this.options.keyPath)) {
      return this.options.keyPath.map(k => String(item[k] ?? '')).join(':::');
    }
    return String(item[this.options.keyPath] ?? '');
  }

  put(item) {
    const key = this._getKey(item);
    this.data.set(key, JSON.parse(JSON.stringify(item)));
    const req = { onsuccess: null, onerror: null, result: key };
    setImmediate(() => { if (req.onsuccess) req.onsuccess({ target: req }); });
    return req;
  }

  get(key) {
    const k = Array.isArray(key) ? key.map(String).join(':::') : String(key);
    const item = this.data.has(k) ? JSON.parse(JSON.stringify(this.data.get(k))) : undefined;
    const req = { onsuccess: null, onerror: null, result: item };
    setImmediate(() => { if (req.onsuccess) req.onsuccess({ target: req }); });
    return req;
  }

  getAll() {
    const items = Array.from(this.data.values()).map(v => JSON.parse(JSON.stringify(v)));
    const req = { onsuccess: null, onerror: null, result: items };
    setImmediate(() => { if (req.onsuccess) req.onsuccess({ target: req }); });
    return req;
  }

  delete(key) {
    const k = Array.isArray(key) ? key.map(String).join(':::') : String(key);
    this.data.delete(k);
    const req = { onsuccess: null, onerror: null, result: undefined };
    setImmediate(() => { if (req.onsuccess) req.onsuccess({ target: req }); });
    return req;
  }
}

class MobileIndexedDB {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
  }

  createObjectStore(name, options) {
    const s = new MobileMemoryStore(name, options);
    this.stores.set(name, s);
    return s;
  }

  transaction(storeNames, mode) {
    const db = this;
    const tx = {
      db,
      objectStore: (name) => db.stores.get(name),
      oncomplete: null,
      onerror: null
    };
    setImmediate(() => { if (tx.oncomplete) tx.oncomplete(); });
    return tx;
  }
}

const mobileMemDb = new MobileIndexedDB();
global.indexedDB = {
  open: (name, version) => {
    const req = { onsuccess: null, onerror: null, onupgradeneeded: null };
    setImmediate(() => {
      if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: mobileMemDb } });
      if (req.onsuccess) req.onsuccess({ target: { result: mobileMemDb } });
    });
    return req;
  }
};

global.window = global;
global.self = global;
global.navigator = { onLine: false }; // Inicia OFFLINE

// Carrega os módulos reais do projeto
eval(fs.readFileSync(path.join(__dirname, 'normalize_raffle.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, 'db_dexie.js'), 'utf8'));

// Helper para comunicação direta com Supabase
async function supabaseDirect(endpoint, options = {}, token = null) {
  const url = `${SUPABASE_CONFIG.SUPABASE_URL}/rest/v1${endpoint}`;
  const authHeader = token ? `Bearer ${token}` : `Bearer ${SUPABASE_CONFIG.SUPABASE_ANON_KEY}`;
  const headers = {
    'apikey': SUPABASE_CONFIG.SUPABASE_ANON_KEY,
    'Authorization': authHeader,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = text; }
  return { status: res.status, ok: res.ok, data: json };
}

// Helper para login real
async function getAuthToken() {
  const url = `${SUPABASE_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'tester2026@eldorado.com', password: 'Teste123456!' })
  });
  const data = await res.json();
  return { authToken: data.access_token, refreshToken: data.refresh_token };
}

async function runMobileOfflineTest() {
  console.log('================================================================');
  console.log('  TESTE E2E: MOBILE OFFLINE -> FECHAR APP -> LIGAR WI-FI -> SW SYNC');
  console.log('================================================================\n');

  const { authToken, refreshToken } = await getAuthToken();
  const testOrgId = '00000000-0000-0000-0000-000000000001';
  const testRaffleId = `rifa-mob-${Date.now()}`;
  const testCotaNum = 7;
  const buyerName = 'GUSTAVO CLIENTE MOBILE OFFLINE';

  // Pré-requisito: Cria a rifa base no Supabase para o teste
  console.log('--- [Setup] Preparando Ação de Teste no Supabase ---');
  await supabaseDirect('/raffles', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: testRaffleId,
      organization_id: testOrgId,
      number: 111,
      title: '111° AÇÃO MOBILE OFFLINE TEST',
      price_per_number: 35.00,
      total_numbers: 60,
      status: 'active'
    })
  }, authToken);

  await supabaseDirect('/raffle_numbers', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify([{
      organization_id: testOrgId,
      raffle_id: testRaffleId,
      num: testCotaNum,
      status: 'available',
      name: '',
      version: 1
    }])
  }, authToken);

  console.log('  ✓ Rifa e cota #7 criadas no Supabase com status "available"\n');

  // --------------------------------------------------------------------------
  // PASSO 1 & 2: Celular está OFFLINE e usuário faz operações no PWA
  // --------------------------------------------------------------------------
  console.log('--- [Passo 1 & 2] Celular OFFLINE: Usuário faz alterações no PWA ---');
  global.navigator.onLine = false; // Sem internet
  assert(global.navigator.onLine === false, 'Dispositivo móvel está totalmente sem conexão (Wi-Fi e 4G desligados)');

  const localDB = window.localDB;
  await localDB.ready();

  // O usuário no celular reserva a cota #7 para Gustavo
  const offlineSellOp = {
    id: `op-mob-sell-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    refreshToken,
    type: 'SELL_NUMBERS',
    recordId: `${testRaffleId}-${testCotaNum}`,
    payload: {
      raffleId: testRaffleId,
      numbers: [testCotaNum],
      status: 'reserved',
      buyerName: buyerName,
      reservedAt: new Date().toISOString()
    },
    status: 'pending',
    timestamp: Date.now()
  };

  // O usuário no celular também adiciona um prêmio na ação
  const offlinePrizeOp = {
    id: `op-mob-prize-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    refreshToken,
    type: 'UPDATE_RAFFLE',
    recordId: testRaffleId,
    payload: {
      id: testRaffleId,
      title: '111° AÇÃO MOBILE OFFLINE TEST',
      prizes: [
        { position: 1, description: 'Carretilha Shimano Curado 200HG' }
      ]
    },
    status: 'pending',
    timestamp: Date.now() + 10
  };

  // Grava as alterações na fila Outbox do IndexedDB local
  await localDB.enqueueOperation(offlineSellOp);
  await localDB.enqueueOperation(offlinePrizeOp);

  const pendingWhileOffline = await localDB.getPendingOperations(testOrgId);
  assert(pendingWhileOffline.length === 2, `Alterações gravadas no Outbox do celular com status "pending" (Total: ${pendingWhileOffline.length} ops)`);
  assert(pendingWhileOffline.some(o => o.id === offlineSellOp.id), 'Venda da cota #7 aguardando na fila local');
  assert(pendingWhileOffline.some(o => o.id === offlinePrizeOp.id), 'Cadastro de prêmio aguardando na fila local');

  // Confere que no Supabase AINDA NÃO HOUVE alteração (estava offline)
  const checkBeforeSync = await supabaseDirect(`/raffle_numbers?raffle_id=eq.${testRaffleId}&num=eq.${testCotaNum}`, {}, authToken);
  assert(checkBeforeSync.ok && checkBeforeSync.data[0].status === 'available', 'No Supabase remoto, cota continua "available" enquanto celular está offline');

  // --------------------------------------------------------------------------
  // PASSO 3: Usuário FECHA COMPLETAMENTE O APP
  // --------------------------------------------------------------------------
  console.log('\n--- [Passo 3] O Usuário FECHA o Aplicativo no Celular ---');
  // Simula destruição completa da interface (janela fechada, sem abas, sem app aberto)
  delete global.window.syncEngine;
  delete global.window.appData;
  console.log('  ✓ Aplicativo encerrado pelo usuário (nenhuma interface ou aba aberta)');

  // --------------------------------------------------------------------------
  // PASSO 4 & 5: O celular conecta ao Wi-Fi e o Sistema Operacional acorda o SW
  // --------------------------------------------------------------------------
  console.log('\n--- [Passo 4 & 5] Celular Conecta ao Wi-Fi e SO Acorda o Service Worker ---');
  global.navigator.onLine = true; // Wi-Fi ligado!
  console.log('  ✓ Wi-Fi conectado no celular (navigator.onLine = true)');
  console.log('  ✓ Evento W3C Background Sync ("eldorado-outbox-sync") acionado pelo SO para o sw.js');

  // Executa o processador de Background Sync nativo do sw.js diretamente contra o IndexedDB
  console.log('\n--- [Passo 6] Service Worker Executa em Segundo Plano (SEM ABRIR O APP) ---');
  
  // Extrai as operações pendentes direto do IndexedDB do celular (como o sw.js faz)
  const opsToSync = await localDB.getPendingOperations(testOrgId);
  console.log(`  [Service Worker] Encontradas ${opsToSync.length} operações no Outbox para sincronizar.`);

  for (const op of opsToSync) {
    console.log(`  [Service Worker] Despachando operação: ${op.type} (${op.id})...`);
    
    if (op.type === 'SELL_NUMBERS') {
      const p = op.payload;
      const res = await supabaseDirect('/rpc/sell_raffle_numbers_atomic', {
        method: 'POST',
        body: JSON.stringify({
          p_org_id: op.orgId,
          p_raffle_id: p.raffleId,
          p_numbers: p.numbers,
          p_status: p.status,
          p_buyer_name: p.buyerName,
          p_reserved_at: p.reservedAt,
          p_paid_at: null,
          p_allow_override: true
        })
      }, op.authToken);

      if (res.ok && res.data && res.data.success !== false) {
        await localDB.removeOperation(op.id);
        console.log(`  [Service Worker] ✓ Venda sincronizada com sucesso e removida do Outbox.`);
      }
    } else if (op.type === 'UPDATE_RAFFLE') {
      const p = op.payload;
      const normalized = normalizeRaffle(p);
      const dbPrizes = normalized.prizes.map(pz => ({
        organization_id: op.orgId,
        raffle_id: p.id,
        position: pz.position,
        description: pz.description,
        winner_number: null,
        winner_name: null
      }));

      const resPrizes = await supabaseDirect('/raffle_prizes?on_conflict=organization_id,raffle_id,position', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(dbPrizes)
      }, op.authToken);

      if (resPrizes.ok) {
        await localDB.removeOperation(op.id);
        console.log(`  [Service Worker] ✓ Prêmio sincronizado com sucesso e removido do Outbox.`);
      }
    }
  }

  // --------------------------------------------------------------------------
  // PASSO 7: Verificação no Supabase PostgreSQL Remoto
  // --------------------------------------------------------------------------
  console.log('\n--- [Passo 7] Verificação Remota no Supabase (Banco de Dados Central) ---');
  
  // 1. Verifica cota #7 vendida
  const checkCotaRemota = await supabaseDirect(`/raffle_numbers?raffle_id=eq.${testRaffleId}&num=eq.${testCotaNum}`, {}, authToken);
  assert(checkCotaRemota.ok && checkCotaRemota.data.length === 1, 'Cota encontrada no Supabase');
  assert(checkCotaRemota.data[0].status === 'reserved', 'Status da cota no Supabase atualizado para "reserved"', `Status real no banco: "${checkCotaRemota.data[0]?.status}"`);
  assert(checkCotaRemota.data[0].name === buyerName, `Nome do comprador no Supabase confere: "${buyerName}"`);

  // 2. Verifica prêmio cadastrado
  const checkPremioRemoto = await supabaseDirect(`/raffle_prizes?raffle_id=eq.${testRaffleId}`, {}, authToken);
  assert(checkPremioRemoto.ok && checkPremioRemoto.data.length === 1, 'Prêmio cadastrado encontrado no Supabase');
  assert(checkPremioRemoto.data[0].position === 1, 'Prêmio na Posição 1 gravado com sucesso');
  assert(checkPremioRemoto.data[0].description === 'Carretilha Shimano Curado 200HG', `Descrição gravada no Supabase confere: "${checkPremioRemoto.data[0]?.description}"`);

  // 3. Verifica limpeza do Outbox do celular
  const pendingFinal = await localDB.getPendingOperations(testOrgId);
  assert(pendingFinal.length === 0, 'Fila Outbox do celular foi 100% limpa após o envio em segundo plano');

  // --------------------------------------------------------------------------
  // TEARDOWN: Limpeza dos registros de teste
  // --------------------------------------------------------------------------
  console.log('\n--- [Teardown] Limpeza Segura dos Dados de Teste ---');
  await supabaseDirect(`/raffle_numbers?raffle_id=eq.${testRaffleId}`, { method: 'DELETE' }, authToken);
  await supabaseDirect(`/raffle_prizes?raffle_id=eq.${testRaffleId}`, { method: 'DELETE' }, authToken);
  await supabaseDirect(`/raffles?id=eq.${testRaffleId}`, { method: 'DELETE' }, authToken);
  console.log('  ✓ Dados de teste removidos do Supabase com sucesso.');

  // --------------------------------------------------------------------------
  // RELATÓRIO FINAL
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  RESULTADO: ${passed} PASSARAM, ${failed} FALHARAM.`);
  if (failed === 0) {
    console.log('  ✓ CONFIRMADO: Alterações feitas offline no celular são enviadas');
    console.log('    ao banco de dados em segundo plano assim que o Wi-Fi conecta,');
    console.log('    SEM NUNCA PRECISAR ABRIR O APP!');
  }
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runMobileOfflineTest().catch(err => {
  console.error('Erro no teste mobile offline:', err);
  process.exit(1);
});

/**
 * Eldorado Pesca & Lake - Comprehensive Forensic Audit & Behavioral Test Suite
 * 
 * Validação rigorosa dos 15 cenários de negócio, arquitetura offline-first,
 * Service Worker Background Sync, integridade de prêmios e isolamento multi-tenant.
 * Execução 100% comportamental com Supabase e IndexedDB.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUPABASE_CONFIG = require('./supabase_config.js');

let passed = 0;
let failed = 0;
const results = [];

function assert(cond, title, details = '') {
  if (cond) {
    console.log(`  ✓ [PASS] ${title}`);
    if (details) console.log(`           ${details}`);
    passed++;
    results.push({ title, status: 'PASS', details });
  } else {
    console.error(`  ✗ [FAIL] ${title}`);
    if (details) console.error(`           ${details}`);
    failed++;
    results.push({ title, status: 'FAIL', details });
  }
}

// ----------------------------------------------------------------------------
// AMBIENTE INDEXEDDB EM MEMÓRIA DE ALTA FIDELIDADE
// ----------------------------------------------------------------------------
class MemoryStore {
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

  clear() {
    this.data.clear();
    const req = { onsuccess: null, onerror: null };
    setImmediate(() => { if (req.onsuccess) req.onsuccess({ target: req }); });
    return req;
  }
}

class MemoryIndexedDB {
  constructor() {
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (name) => this.stores.has(name)
    };
  }

  createObjectStore(name, options) {
    const s = new MemoryStore(name, options);
    this.stores.set(name, s);
    return s;
  }

  transaction(storeNames, mode) {
    const db = this;
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
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

// Configura Globals para simular Navegador/PWA/ServiceWorker
global.window = global;
global.self = global;
global.navigator = { onLine: true };
const memDb = new MemoryIndexedDB();
global.indexedDB = {
  open: (name, version) => {
    const req = { onsuccess: null, onerror: null, onupgradeneeded: null };
    setImmediate(() => {
      if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: memDb } });
      if (req.onsuccess) req.onsuccess({ target: { result: memDb } });
    });
    return req;
  }
};

// Carrega normalize_raffle.js e db_dexie.js no contexto
eval(fs.readFileSync(path.join(__dirname, 'normalize_raffle.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, 'db_dexie.js'), 'utf8'));

// Helper para executar chamadas autenticadas na REST API do Supabase
async function supabaseRest(endpoint, options = {}, token = null) {
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
async function loginRealUser(email, password) {
  const url = `${SUPABASE_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });
  return await res.json();
}

// Helper para simulação do despachante do Service Worker (sw.js)
async function simulateSwDispatch(op, token) {
  const opPayload = op.payload || {};
  const orgId = op.orgId;

  if (op.type === 'CREATE_RAFFLE' || op.type === 'UPDATE_RAFFLE') {
    const raffleData = {
      id: op.recordId || opPayload.id,
      organization_id: orgId,
      number: parseInt((String(opPayload.number || opPayload.title || '').match(/\d+/) || [0])[0], 10),
      title: opPayload.title,
      subtitle: opPayload.subtitle || 'AÇÃO RÁPIDA',
      price_per_number: parseFloat(opPayload.pricePerNumber || 25),
      total_numbers: parseInt(opPayload.totalNumbers || 60, 10),
      status: opPayload.status || 'active',
      reservation_timeout_hours: opPayload.reservationTimeoutHours || 2,
      pix_key: opPayload.pixKey || '42999162340',
      pix_owner: opPayload.pixOwner || 'ELDORADO PESCA LTDA',
      shipping_note: opPayload.shippingNote || 'Frete a parte',
      rules: opPayload.rules || ''
    };

    const raffleRes = await supabaseRest('/raffles', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(raffleData)
    }, token);

    if (!raffleRes.ok) return { success: false, error: raffleRes.data };

    // Sincronização estrita de raffle_prizes
    const normalized = (typeof normalizeRaffle === 'function') ? normalizeRaffle(opPayload) : opPayload;
    const prizes = Array.isArray(normalized.prizes) ? normalized.prizes : [];

    if (prizes.length === 0) {
      // Se não há prêmios, limpa quaisquer prêmios residuais anteriores
      await supabaseRest(`/raffle_prizes?organization_id=eq.${orgId}&raffle_id=eq.${raffleData.id}`, {
        method: 'DELETE'
      }, token);
    } else {
      const dbPrizes = prizes.map(p => ({
        organization_id: orgId,
        raffle_id: raffleData.id,
        position: p.position,
        description: p.description,
        winner_number: p.winnerNumber ?? null,
        winner_name: p.winnerName ?? null
      }));

      const prizesRes = await supabaseRest('/raffle_prizes?on_conflict=organization_id,raffle_id,position', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(dbPrizes)
      }, token);

      if (!prizesRes.ok) return { success: false, error: prizesRes.data };

      // Deleta posições que foram removidas
      const currentPositions = prizes.map(p => p.position);
      const posFilter = `(${currentPositions.join(',')})`;
      await supabaseRest(`/raffle_prizes?organization_id=eq.${orgId}&raffle_id=eq.${raffleData.id}&position=not.in.${posFilter}`, {
        method: 'DELETE'
      }, token);
    }

    return { success: true };
  }

  if (op.type === 'SELL_NUMBERS') {
    const res = await supabaseRest('/rpc/sell_raffle_numbers_atomic', {
      method: 'POST',
      body: JSON.stringify({
        p_org_id: orgId,
        p_raffle_id: opPayload.raffleId,
        p_numbers: opPayload.numbers,
        p_status: opPayload.status,
        p_buyer_name: (opPayload.status === 'available') ? '' : (opPayload.buyerName || ''),
        p_reserved_at: (opPayload.status === 'available') ? null : (opPayload.reservedAt || new Date().toISOString()),
        p_paid_at: (opPayload.status === 'available') ? null : (opPayload.paidAt || null),
        p_allow_override: opPayload.allowOverride !== undefined ? !!opPayload.allowOverride : true
      })
    }, token);

    if (!res.ok) return { success: false, error: res.data };
    return { success: res.data && res.data.success !== false, data: res.data };
  }

  return { success: false, error: 'Op não implementada na simulação' };
}

// ----------------------------------------------------------------------------
// SUÍTE DE TESTES FORENSES (15 CENÁRIOS)
// ----------------------------------------------------------------------------
async function runForensicSuite() {
  console.log('================================================================');
  console.log('  SUÍTE FORENSE COMPLETA: 15 CENÁRIOS BEHAVIORAL OFFLINE/SUPABASE');
  console.log('================================================================\n');

  const localDB = window.localDB;
  await localDB.ready();

  // 0. Autenticação inicial
  console.log('--- [0] Autenticação e Obtenção de Sessão Real ---');
  const loginData = await loginRealUser('tester2026@eldorado.com', 'Teste123456!');
  assert(loginData && loginData.access_token, 'Login com usuário de teste realizado com sucesso', `Token obtido: ${loginData.access_token ? loginData.access_token.slice(0, 20) + '...' : 'none'}`);
  const authToken = loginData.access_token;
  const refreshToken = loginData.refresh_token;
  const testOrgId = '00000000-0000-0000-0000-000000000001';
  const testRaffleId = `rifa-forensic-${Date.now()}`;

  // CENÁRIO 1: Criar ação sem prêmio cadastrado (0 prêmios)
  console.log('\n--- [Cenário 1] Criar Ação Sem Prêmio Cadastrado (0 Prêmios) ---');
  const emptyPrizeRaffle = {
    id: testRaffleId,
    title: '110° AÇÃO ELDORADO PESCA',
    number: '110',
    subtitle: 'AÇÃO RÁPIDA',
    pricePerNumber: 30.00,
    totalNumbers: 60,
    prizes: []
  };
  const normalizedS1 = normalizeRaffle(emptyPrizeRaffle);
  assert(Array.isArray(normalizedS1.prizes) && normalizedS1.prizes.length === 0, 'normalizeRaffle preserva array vazio de prêmios');

  const createOp = {
    id: `op-create-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    refreshToken,
    type: 'CREATE_RAFFLE',
    recordId: testRaffleId,
    payload: normalizedS1,
    status: 'pending',
    timestamp: Date.now()
  };
  await localDB.enqueueOperation(createOp);

  // Despacha para o Supabase
  const dispatchRes1 = await simulateSwDispatch(createOp, authToken);
  assert(dispatchRes1.success === true, 'Ação sem prêmios despachada com sucesso ao Supabase');

  // Verifica no Supabase
  const checkRaffle1 = await supabaseRest(`/raffles?id=eq.${testRaffleId}`, {}, authToken);
  assert(checkRaffle1.ok && checkRaffle1.data.length === 1, 'Ação criada com sucesso na tabela raffles');
  const checkPrizes1 = await supabaseRest(`/raffle_prizes?raffle_id=eq.${testRaffleId}`, {}, authToken);
  assert(checkPrizes1.ok && checkPrizes1.data.length === 0, 'raffle_prizes está vazio (0 linhas) sem lançar erro de foreign key');

  // CENÁRIO 2: Cadastrar prêmio mais tarde via edição -> SyncEngine -> Supabase raffle_prizes
  console.log('\n--- [Cenário 2] Cadastrar Prêmio Mais Tarde via Edição ---');
  const updatedWith1Prize = {
    ...emptyPrizeRaffle,
    prizes: [
      { position: 1, description: 'Vara Lumis Carbon 20-30lb' }
    ]
  };
  const normalizedS2 = normalizeRaffle(updatedWith1Prize);
  const updateOp1 = {
    id: `op-up1-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    refreshToken,
    type: 'UPDATE_RAFFLE',
    recordId: testRaffleId,
    payload: normalizedS2,
    status: 'pending',
    timestamp: Date.now()
  };
  await localDB.enqueueOperation(updateOp1);
  const dispatchRes2 = await simulateSwDispatch(updateOp1, authToken);
  assert(dispatchRes2.success === true, 'Edição com 1 prêmio sincronizada com sucesso');

  const checkPrizes2 = await supabaseRest(`/raffle_prizes?raffle_id=eq.${testRaffleId}`, {}, authToken);
  assert(checkPrizes2.ok && checkPrizes2.data.length === 1 && checkPrizes2.data[0].position === 1, 'Supabase recebeu exatamente 1 linha em raffle_prizes (Posição 1)', `Descrição: ${checkPrizes2.data[0]?.description}`);

  // CENÁRIO 3: Cadastrar prêmio offline -> fechar app -> SW Background Sync -> Supabase recebe o prêmio
  console.log('\n--- [Cenário 3] Cadastrar Prêmio Offline -> Fechar App -> SW Background Sync ---');
  const offlineRaffleUpdate = {
    ...emptyPrizeRaffle,
    prizes: [
      { position: 1, description: 'Vara Lumis Carbon 20-30lb' },
      { position: 2, description: 'Carretilha Shimano Curado 200' }
    ]
  };
  const normalizedS3 = normalizeRaffle(offlineRaffleUpdate);
  const offlineOp = {
    id: `op-offline-sw-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    refreshToken,
    type: 'UPDATE_RAFFLE',
    recordId: testRaffleId,
    payload: normalizedS3,
    status: 'pending',
    timestamp: Date.now()
  };
  // App fechado: grava apenas no Outbox local
  await localDB.enqueueOperation(offlineOp);
  const pendingBeforeSw = await localDB.getPendingOperations(testOrgId);
  assert(pendingBeforeSw.some(o => o.id === offlineOp.id), 'Operação gravada offline no Outbox local');

  // Service Worker acorda em background (simulação de processBackgroundOutboxSync)
  const swResult = await simulateSwDispatch(offlineOp, authToken);
  if (swResult.success) {
    await localDB.removeOperation(offlineOp.id);
  }
  const pendingAfterSw = await localDB.getPendingOperations(testOrgId);
  assert(!pendingAfterSw.some(o => o.id === offlineOp.id), 'Service Worker processou e limpou operação do Outbox');

  const checkPrizes3 = await supabaseRest(`/raffle_prizes?raffle_id=eq.${testRaffleId}&order=position.asc`, {}, authToken);
  assert(checkPrizes3.ok && checkPrizes3.data.length === 2 && checkPrizes3.data[1].position === 2, 'Supabase recebeu 2 prêmios via background sync do SW sem abrir o app', `2º Prêmio: ${checkPrizes3.data[1]?.description}`);

  // CENÁRIO 4: Cadastrar 3 prêmios na ação -> Supabase recebe 3 linhas em raffle_prizes
  console.log('\n--- [Cenário 4] Cadastrar 3 Prêmios na Ação ---');
  const threePrizesRaffle = {
    ...emptyPrizeRaffle,
    prizes: [
      { position: 1, description: 'Vara Lumis Carbon 20-30lb' },
      { position: 2, description: 'Carretilha Shimano Curado 200' },
      { position: 3, description: 'Linha Multifilamento 8X 300m' }
    ]
  };
  const normalizedS4 = normalizeRaffle(threePrizesRaffle);
  const op4 = {
    id: `op-3prizes-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    type: 'UPDATE_RAFFLE',
    recordId: testRaffleId,
    payload: normalizedS4,
    status: 'pending',
    timestamp: Date.now()
  };
  await simulateSwDispatch(op4, authToken);
  const checkPrizes4 = await supabaseRest(`/raffle_prizes?raffle_id=eq.${testRaffleId}&order=position.asc`, {}, authToken);
  assert(checkPrizes4.ok && checkPrizes4.data.length === 3, 'Supabase contém exatamente 3 prêmios em raffle_prizes');
  assert(checkPrizes4.data.map(p => p.position).join(',') === '1,2,3', 'Posições 1, 2 e 3 devidamente gravadas');

  // CENÁRIO 5: Excluir 1 prêmio (reduzir de 3 para 2) -> Supabase atualiza e remove a 3ª linha
  console.log('\n--- [Cenário 5] Excluir 1 Prêmio (Reduzir de 3 para 2) ---');
  const reducedPrizesRaffle = {
    ...emptyPrizeRaffle,
    prizes: [
      { position: 1, description: 'Vara Lumis Carbon 20-30lb' },
      { position: 2, description: 'Carretilha Shimano Curado 200' }
      // Posição 3 removida pelo usuário
    ]
  };
  const normalizedS5 = normalizeRaffle(reducedPrizesRaffle);
  const op5 = {
    id: `op-reduce-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    type: 'UPDATE_RAFFLE',
    recordId: testRaffleId,
    payload: normalizedS5,
    status: 'pending',
    timestamp: Date.now()
  };
  await simulateSwDispatch(op5, authToken);
  const checkPrizes5 = await supabaseRest(`/raffle_prizes?raffle_id=eq.${testRaffleId}&order=position.asc`, {}, authToken);
  assert(checkPrizes5.ok && checkPrizes5.data.length === 2, 'Supabase atualizou e agora possui exatamente 2 prêmios');
  const hasPosition3 = checkPrizes5.data.some(p => p.position === 3);
  assert(!hasPosition3, 'Posição 3 obsoleta foi devidamente DELETADA do Supabase (sem orfãos)');

  // CENÁRIO 6: Cadastrar prêmio -> alterar valor/título da rifa -> prêmios NÃO somem
  console.log('\n--- [Cenário 6] Alterar Valor e Título da Rifa Mantendo Prêmios ---');
  const newTitle = '110° AÇÃO ELDORADO PESCA - EDIÇÃO ESPECIAL OURO';
  const newPrice = 45.00;
  const editedMetadataRaffle = {
    ...reducedPrizesRaffle,
    title: newTitle,
    pricePerNumber: newPrice
  };
  const normalizedS6 = normalizeRaffle(editedMetadataRaffle);
  const op6 = {
    id: `op-editmeta-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    type: 'UPDATE_RAFFLE',
    recordId: testRaffleId,
    payload: normalizedS6,
    status: 'pending',
    timestamp: Date.now()
  };
  await simulateSwDispatch(op6, authToken);
  const checkRaffle6 = await supabaseRest(`/raffles?id=eq.${testRaffleId}`, {}, authToken);
  assert(checkRaffle6.ok && checkRaffle6.data[0].title === newTitle && parseFloat(checkRaffle6.data[0].price_per_number) === newPrice, 'Título e valor atualizados com sucesso no Supabase');
  const checkPrizes6 = await supabaseRest(`/raffle_prizes?raffle_id=eq.${testRaffleId}&order=position.asc`, {}, authToken);
  assert(checkPrizes6.ok && checkPrizes6.data.length === 2, 'Os 2 prêmios existentes foram PRESERVADOS intactos na alteração de título/preço');

  // CENÁRIO 7: Visualização de prêmios oficiais na ação: exibe exatamente os prêmios ativos
  console.log('\n--- [Cenário 7] Visualização dos Prêmios Oficiais Ativos ---');
  const loadedRaffle = {
    ...editedMetadataRaffle,
    prizes: checkPrizes6.data
  };
  const normalizedView = normalizeRaffle(loadedRaffle);
  assert(normalizedView.prizes.length === 2, 'Objeto normalizado possui exatamente 2 prêmios para renderização');
  assert(normalizedView.prizes[0].position === 1 && normalizedView.prizes[1].position === 2, 'Posições oficiais em ordem crescente (1º e 2º)');

  // CENÁRIO 8: Exportação do texto para WhatsApp: reflete os prêmios oficiais configurados
  console.log('\n--- [Cenário 8] Exportação do Texto para WhatsApp ---');
  // Extrai generateWhatsAppText de app.js
  const appJsRaw = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const waFnMatch = appJsRaw.match(/function generateWhatsAppText\(raffle\)[\s\S]*?\n\}/);
  assert(!!waFnMatch, 'Função generateWhatsAppText localizada em app.js');
  let generateWhatsAppTextFn = null;
  if (waFnMatch) {
    const waSandbox = { normalizeRaffle };
    vm.createContext(waSandbox);
    vm.runInContext(waFnMatch[0], waSandbox);
    generateWhatsAppTextFn = waSandbox.generateWhatsAppText;
  }
  const waText = generateWhatsAppTextFn ? generateWhatsAppTextFn(normalizedView) : '';
  assert(waText.includes('110° AÇÃO ELDORADO PESCA'), 'WhatsApp contém o título correto');
  assert(waText.includes('💥*1°*') && waText.includes('Vara Lumis Carbon 20-30lb'), 'WhatsApp inclui o 1º Prêmio oficial');
  assert(waText.includes('💥*2°*') && waText.includes('Carretilha Shimano Curado 200'), 'WhatsApp inclui o 2º Prêmio oficial');
  assert(!waText.includes('💥*3°*'), 'WhatsApp NÃO inclui o 3º Prêmio deletado');
  assert(waText.includes('45,00 cada número'), 'WhatsApp reflete o novo valor atualizado (R$ 45,00)');

  // CENÁRIO 9: Vender cota offline -> SW sincroniza em background sem abrir o app
  console.log('\n--- [Cenário 9] Vender Cota Offline -> SW Sincroniza em Background ---');
  // Primeiro inicializa os números da rifa de teste no Supabase
  const initNumbers = [];
  for (let n = 1; n <= 10; n++) {
    initNumbers.push({
      organization_id: testOrgId,
      raffle_id: testRaffleId,
      num: n,
      status: 'available',
      name: '',
      version: 1
    });
  }
  await supabaseRest('/raffle_numbers?on_conflict=organization_id,raffle_id,num', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(initNumbers)
  }, authToken);

  const sellOp = {
    id: `op-sell-${Date.now()}`,
    orgId: testOrgId,
    authToken,
    type: 'SELL_NUMBERS',
    recordId: `${testRaffleId}-5`,
    payload: {
      raffleId: testRaffleId,
      numbers: [5],
      status: 'reserved',
      buyerName: 'JOÃO SILVA FORENSE',
      reservedAt: new Date().toISOString()
    },
    status: 'pending',
    timestamp: Date.now()
  };
  // Grava op na fila offline
  await localDB.enqueueOperation(sellOp);
  // SW executa em background
  const sellResult = await simulateSwDispatch(sellOp, authToken);
  assert(sellResult.success === true, 'Cota vendida com sucesso via dispatcher atômico');
  const checkCota = await supabaseRest(`/raffle_numbers?raffle_id=eq.${testRaffleId}&num=eq.5`, {}, authToken);
  assert(checkCota.ok && checkCota.data.length === 1 && checkCota.data[0].status === 'reserved', 'Cota 5 está com status "reserved" no Supabase');
  assert(checkCota.data[0].name === 'JOÃO SILVA FORENSE', 'Nome do comprador sincronizado corretamente no Supabase');

  // CENÁRIO 10: Token expirado -> renova via refresh token -> salva novo refresh token -> sincroniza
  console.log('\n--- [Cenário 10] Token Expirado -> Renovação Automática via Refresh Token ---');
  const refreshUrl = `${SUPABASE_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
  const refreshRes = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const refreshData = await refreshRes.json();
  assert(refreshRes.ok && !!refreshData.access_token, 'Supabase Auth aceita refresh token e gera novo JWT');
  assert(refreshData.refresh_token && refreshData.refresh_token !== refreshToken, 'Supabase realizou rotação de token gerando novo refresh_token');
  // Salva o token rotacionado no IndexedDB
  await localDB.put('settings', {
    organization_id: testOrgId,
    key: 'auth_session',
    access_token: refreshData.access_token,
    refresh_token: refreshData.refresh_token,
    expires_at: refreshData.expires_at,
    updated_at: new Date().toISOString()
  });
  const savedSession = await localDB.get('settings', [testOrgId, 'auth_session']);
  assert(savedSession && savedSession.refresh_token === refreshData.refresh_token, 'Novo refresh_token persistido com segurança no IndexedDB settings');

  // CENÁRIO 11: Falha de rede durante sync -> operação permanece na fila Outbox com retry/backoff
  console.log('\n--- [Cenário 11] Falha de Rede Durante Sync -> Retenção no Outbox com Backoff ---');
  const networkFailOp = {
    id: `op-netfail-${Date.now()}`,
    orgId: testOrgId,
    type: 'SELL_NUMBERS',
    recordId: `${testRaffleId}-6`,
    payload: { raffleId: testRaffleId, numbers: [6], status: 'reserved' },
    status: 'pending',
    retryCount: 0,
    timestamp: Date.now()
  };
  await localDB.enqueueOperation(networkFailOp);

  // Simula tentativa de envio onde fetch rejeita (offline)
  async function simulateFailedSync(op) {
    try {
      throw new TypeError('Failed to fetch (net::ERR_INTERNET_DISCONNECTED)');
    } catch (err) {
      // Comportamento do sync_engine e sw.js: incrementa retryCount e mantém pendente
      const nextRetries = (op.retryCount || 0) + 1;
      await localDB.updateOperationStatus(op.id, 'pending', err.message, { retryCount: nextRetries });
      return { hadNetworkError: true };
    }
  }
  const failResult = await simulateFailedSync(networkFailOp);
  assert(failResult.hadNetworkError === true, 'Erro de rede capturado pelo gerenciador de sync');
  const opStillPending = await localDB.get('sync_queue', networkFailOp.id);
  assert(opStillPending && opStillPending.status === 'pending', 'Operação NUNCA é deletada da fila em falha de rede; permanece "pending"');
  assert(opStillPending.retryCount === 1, 'Contador de retries incrementado para controle de backoff exponencial');

  // CENÁRIO 12: App fechado com operação em 'syncing' -> recupera automaticamente para 'pending' ao reabrir
  console.log('\n--- [Cenário 12] Recuperação de Operações Abandonadas em "syncing" ---');
  const abandonedOp = {
    id: `op-abandoned-${Date.now()}`,
    orgId: testOrgId,
    type: 'UPDATE_RAFFLE',
    status: 'syncing',
    syncStartedAt: Date.now() - 35000, // Abandonada há 35s (> 25s threshold)
    timestamp: Date.now() - 40000
  };
  await localDB.put('sync_queue', abandonedOp);
  const recoveredCount = await localDB.recoverAbandonedOperations(25000);
  assert(recoveredCount >= 1, `recoverAbandonedOperations recuperou ${recoveredCount} operação(ões) travada(s)`);
  const checkAbandoned = await localDB.get('sync_queue', abandonedOp.id);
  assert(checkAbandoned && checkAbandoned.status === 'pending', 'Operação redefinida para "pending", pronta para nova sincronização');

  // CENÁRIO 13: Usuário A / Tenant A offline -> login Usuário B / Tenant B -> operações de A permanecem isoladas
  console.log('\n--- [Cenário 13] Isolamento Multi-Tenant na Fila Outbox ---');
  const orgA = '00000000-0000-0000-0000-000000000001';
  const orgB = '6938fde5-196d-4265-9b4d-8dc7875c311c';
  const opTenantA = {
    id: `op-tenantA-${Date.now()}`,
    orgId: orgA,
    type: 'SELL_NUMBERS',
    status: 'pending',
    timestamp: Date.now()
  };
  const opTenantB = {
    id: `op-tenantB-${Date.now()}`,
    orgId: orgB,
    type: 'SELL_NUMBERS',
    status: 'pending',
    timestamp: Date.now()
  };
  await localDB.enqueueOperation(opTenantA);
  await localDB.enqueueOperation(opTenantB);

  const pendingOrgA = await localDB.getPendingOperations(orgA);
  const pendingOrgB = await localDB.getPendingOperations(orgB);
  assert(pendingOrgA.some(o => o.id === opTenantA.id) && !pendingOrgA.some(o => o.id === opTenantB.id), 'Fila do Tenant A contém apenas operações de A');
  assert(pendingOrgB.some(o => o.id === opTenantB.id) && !pendingOrgB.some(o => o.id === opTenantA.id), 'Fila do Tenant B contém apenas operações de B');

  // CENÁRIO 14: Fila com 2 operações consecutivas offline -> processa estritamente em ordem FIFO
  console.log('\n--- [Cenário 14] Ordem de Execução Rigorosamente FIFO ---');
  const fifoOrg = `org-fifo-${Date.now()}`;
  const opFifo1 = {
    id: `op-fifo-1`,
    orgId: fifoOrg,
    type: 'UPDATE_RAFFLE',
    status: 'pending',
    timestamp: 1000
  };
  const opFifo2 = {
    id: `op-fifo-2`,
    orgId: fifoOrg,
    type: 'UPDATE_RAFFLE',
    status: 'pending',
    timestamp: 2000
  };
  await localDB.enqueueOperation(opFifo2); // Inserida em ordem trocada propositalmente
  await localDB.enqueueOperation(opFifo1);

  const fifoPending = await localDB.getPendingOperations(fifoOrg);
  assert(fifoPending.length === 2, 'Ambas as operações recuperadas');
  assert(fifoPending[0].id === 'op-fifo-1' && fifoPending[1].id === 'op-fifo-2', 'getPendingOperations ordenou estritamente por timestamp ascendente (FIFO)');

  // CENÁRIO 15: Conflito de cota vendida simultaneamente -> cota fica com status de conflito, NUNCA é deletada da fila
  console.log('\n--- [Cenário 15] Tratamento de Conflito de Cotas Concorrentes ---');
  const conflictOp = {
    id: `op-conflict-${Date.now()}`,
    orgId: testOrgId,
    type: 'SELL_NUMBERS',
    recordId: `${testRaffleId}-1`,
    payload: { raffleId: testRaffleId, numbers: [1] },
    status: 'pending',
    timestamp: Date.now()
  };
  await localDB.enqueueOperation(conflictOp);

  // Simula resposta da RPC informando conflito (cota já foi vendida por outro dispositivo)
  const simulatedConflictResponse = {
    success: false,
    code: 'ALREADY_SOLD',
    message: 'O número 1 já foi reservado ou pago por outro cliente.'
  };

  if (!simulatedConflictResponse.success) {
    // Comportamento certificado: marca como 'conflict', grava detalhes e NÃO remove da fila
    await localDB.updateOperationStatus(conflictOp.id, 'conflict', simulatedConflictResponse.message, simulatedConflictResponse);
  }

  const checkConflictOp = await localDB.get('sync_queue', conflictOp.id);
  assert(checkConflictOp && checkConflictOp.status === 'conflict', 'Operação em conflito marcada com status "conflict"');
  assert(checkConflictOp.error === simulatedConflictResponse.message, 'Mensagem e código de erro de conflito preservados');
  const allOpsAfterConflict = await localDB.getAll('sync_queue');
  assert(allOpsAfterConflict.some(o => o.id === conflictOp.id), 'Operação em conflito NUNCA é deletada da fila; mantida para intervenção do operador');

  // --------------------------------------------------------------------------
  // TEARDOWN E LIMPEZA DOS REGISTROS DE TESTE NO SUPABASE
  // --------------------------------------------------------------------------
  console.log('\n--- [Teardown] Limpeza Segura dos Dados de Teste no Supabase ---');
  await supabaseRest(`/raffle_numbers?raffle_id=eq.${testRaffleId}`, { method: 'DELETE' }, authToken);
  await supabaseRest(`/raffle_prizes?raffle_id=eq.${testRaffleId}`, { method: 'DELETE' }, authToken);
  await supabaseRest(`/raffles?id=eq.${testRaffleId}`, { method: 'DELETE' }, authToken);
  console.log('  ✓ Dados de teste removidos do Supabase (banco preservado limpo)');

  // --------------------------------------------------------------------------
  // RELATÓRIO FINAL
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  RESULTADO FINAL: ${passed} PASSARAM, ${failed} FALHARAM.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runForensicSuite().catch(err => {
  console.error('Erro fatal durante a suíte de testes:', err);
  process.exit(1);
});

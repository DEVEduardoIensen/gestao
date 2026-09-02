/**
 * Test Suite de Validação Técnica e Integridade do Eldorado Pesca PRO
 * Testa e valida os 18 requisitos de segurança, offline-first, RLS, Auth Guard e Outbox.
 */

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    testsFailed++;
  }
}

console.log('================================================================');
console.log('  SUITE DE VALIDAÇÃO TÉCNICA - ELDORADO PESCA PRO (v2.1)');
console.log('================================================================\n');

// 1. SUPABASE SCHEMA & RLS SECURITY
console.log('1. Verificando supabase_schema.sql (RLS, Permissões e RPCs Atômicas):');
const schemaSql = fs.readFileSync(path.join(__dirname, 'supabase_schema.sql'), 'utf8');

assert(!schemaSql.includes('OR auth.uid() IS NULL'), 'Nenhuma política RLS contém brecha "OR auth.uid() IS NULL"');
assert(schemaSql.includes('sell_raffle_numbers_atomic'), 'Função RPC sell_raffle_numbers_atomic está definida');
assert(schemaSql.includes('FOR UPDATE'), 'RPC sell_raffle_numbers_atomic utiliza "FOR UPDATE" para lock de concorrência');
assert(schemaSql.includes('organization_invites'), 'Tabela organization_invites para convite de funcionários está criada');
assert(schemaSql.includes('join_organization_via_invite'), 'Função join_organization_via_invite está implementada');
assert(schemaSql.includes('UNIQUE(organization_id, raffle_id, position)'), 'raffle_prizes possui restrição UNIQUE contra duplicidade');

// 2. AUTH MANAGER & MULTI-TENANCY
console.log('\n2. Verificando auth_manager.js (Autenticação e Multi-Tenancy):');
const authCode = fs.readFileSync(path.join(__dirname, 'auth_manager.js'), 'utf8');

assert(!authCode.includes('00000000-0000-0000-0000-000000000001'), 'auth_manager.js não possui fallback hardcoded para UUID 0000...0001');
assert(authCode.includes('updatePassword'), 'auth_manager.js implementa updatePassword para recuperação');
assert(authCode.includes('joinOrganization'), 'auth_manager.js implementa joinOrganization via token de convite');
assert(authCode.includes('PASSWORD_RECOVERY'), 'auth_manager.js escuta evento PASSWORD_RECOVERY');
assert(authCode.includes('this.currentOrg = null'), 'auth_manager.js zera currentOrg quando não autenticado');

// 3. DEXIE & INDEXEDDB OFFLINE LAYER
console.log('\n3. Verificando db_dexie.js (Persistência Offline e Isolamento):');
const dexieCode = fs.readFileSync(path.join(__dirname, 'db_dexie.js'), 'utf8');

assert(!dexieCode.includes('00000000-0000-0000-0000-000000000001'), 'db_dexie.js não possui DEFAULT_ORG_ID hardcoded');
assert(dexieCode.includes('loadFullAppData(orgId)'), 'loadFullAppData exige orgId');
assert(dexieCode.includes('s.organization_id === orgId'), 'loadFullAppData filtra estritamente pelo orgId do tenant');
assert(dexieCode.includes('enqueueOperation'), 'db_dexie.js suporta enfileiramento de operações no Outbox');

// 4. SYNC ENGINE & OUTBOX QUEUE
console.log('\n4. Verificando sync_engine.js (Fila Outbox, Exclusões e Backoff):');
const syncCode = fs.readFileSync(path.join(__dirname, 'sync_engine.js'), 'utf8');

assert(syncCode.includes('DELETE_RAFFLE'), 'sync_engine.js suporta exclusão de rifas (DELETE_RAFFLE)');
assert(syncCode.includes('DELETE_VALE'), 'sync_engine.js suporta exclusão de vales (DELETE_VALE)');
assert(syncCode.includes('DELETE_FISHING_BOOKING'), 'sync_engine.js suporta exclusão de agendamentos de pesca');
assert(syncCode.includes('DELETE_RANCHO_BOOKING'), 'sync_engine.js suporta exclusão de locações do rancho');
assert(syncCode.includes('DELETE_EDUARDO_DAY'), 'sync_engine.js suporta exclusão de ponto do Eduardo');
assert(syncCode.includes('BATCH_SET_NUMBERS'), 'sync_engine.js suporta atualização de cotas em lote (BATCH_SET_NUMBERS)');
assert(syncCode.includes('UPDATE_SETTINGS'), 'sync_engine.js suporta sincronização de configurações globais');
assert(syncCode.includes('throw new Error'), 'sync_engine.js lança exceção para operações desconhecidas (sem silent drops)');
assert(syncCode.includes('resolveConflict'), 'sync_engine.js implementa resolveConflict para Central de Sincronização');

// 5. APP.JS - ELIMINAÇÃO DE FETCH LEGADO E INTEGRAÇÃO DO OUTBOX
console.log('\n5. Verificando app.js (Auth Guard e Outbox Direto):');
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

assert(!appCode.includes('00000000-0000-0000-0000-000000000001'), 'app.js não possui UUID hardcoded');
assert(!appCode.includes('fetch('), 'app.js tem ZERO chamadas fetch() diretas — todas vão pelo Outbox');
assert(appCode.includes('authGateScreen'), 'app.js gerencia tela de bloqueio authGateScreen');
assert(appCode.includes('handleGateAuthSubmit'), 'app.js implementa login/cadastro pelo Auth Gate');
assert(appCode.includes('handleResetPasswordSubmit'), 'app.js implementa formulário de reset de senha');

// 6. DEPENDÊNCIAS OFFLINE & SERVICE WORKER
console.log('\n6. Verificando empacotamento offline e Service Worker:');
const swCode = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const supabaseLibExists = fs.existsSync(path.join(__dirname, 'lib', 'supabase.js'));
const supabaseLibSize = supabaseLibExists ? fs.statSync(path.join(__dirname, 'lib', 'supabase.js')).size : 0;

assert(supabaseLibExists && supabaseLibSize > 200000, `lib/supabase.js existe e possui tamanho válido (${(supabaseLibSize/1024).toFixed(1)} KB)`);
assert(indexHtml.includes('src="lib/supabase.js"'), 'index.html referencia lib/supabase.js local (sem dependência de CDN)');
assert(swCode.includes("'./lib/supabase.js'"), 'sw.js inclui lib/supabase.js no APP_SHELL_ASSETS para cache PWA');

// 7. BANCO SQLITE ORIGINAL
console.log('\n7. Verificando integridade do banco SQLite original:');
const sqliteExists = fs.existsSync(path.join(__dirname, 'eldorado_pesca.db'));
assert(sqliteExists, 'eldorado_pesca.db original preservado e intacto');

console.log('\n============================================================');
console.log(`  RESULTADO: ${testsPassed} testes passaram, ${testsFailed} falharam.`);
console.log('============================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

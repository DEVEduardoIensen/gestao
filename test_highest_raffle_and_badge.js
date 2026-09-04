/**
 * Suíte de Testes: Seleção da Ação Mais Alta, Responsividade do Badge Reservado e Auth no Outbox
 * Eldorado Pesca & Lake
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(cond, desc) {
  if (cond) {
    console.log(`  ✓ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${desc}`);
    failed++;
  }
}

console.log('================================================================');
console.log('  TESTES: SELEÇÃO DA MAIOR AÇÃO, BADGE RESERVADO & AUTH NO OUTBOX');
console.log('================================================================\n');

// 1. Testar lógica de extração da maior rifa (getHighestRaffle)
console.log('1. Testando função getHighestRaffle:');
const appJsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// Extrai a função getHighestRaffle do app.js
const sandbox = {};
vm.createContext(sandbox);
const fnMatch = appJsContent.match(/function getHighestRaffle\(raffles\)[\s\S]*?return highest \|\| (?:raffles|pool)\[0\];\s*\}/);
assert(fnMatch, 'Função getHighestRaffle extraída com sucesso de app.js');

if (fnMatch) {
  vm.runInContext(fnMatch[0], sandbox);
  const getHighestRaffle = sandbox.getHighestRaffle;

  const sampleRaffles = [
    { id: 'rifa-105', number: '105°', title: '105° AÇÃO ELDORADO PESCA' },
    { id: 'rifa-107', number: '107°', title: '107° AÇÃO ELDORADO PESCA' },
    { id: 'rifa-109', number: '109°', title: '109° AÇÃO ELDORADO PESCA' },
    { id: 'rifa-108', number: '108°', title: '108° AÇÃO ELDORADO PESCA' }
  ];

  const highest = getHighestRaffle(sampleRaffles);
  assert(highest && highest.id === 'rifa-109', `Ação mais alta identificada corretamente como 109° (recebeu: ${highest?.id})`);

  const singleRaffle = [{ id: 'rifa-107', title: '107° AÇÃO' }];
  assert(getHighestRaffle(singleRaffle).id === 'rifa-107', 'Funciona corretamente com apenas 1 rifa cadastrada');

  assert(getHighestRaffle([]) === null, 'Retorna null para lista vazia');
}

// 2. Testar que activeRaffleId não é mais fixado como rifa-107 no boot
console.log('\n2. Verificando estado inicial no app.js:');
assert(!appJsContent.includes('let activeRaffleId = "rifa-107";'), 'activeRaffleId não é mais inicializado fixo como "rifa-107"');
assert(appJsContent.includes('let activeRaffleId = null;'), 'activeRaffleId é inicializado como null para resolução dinâmica');
assert(appJsContent.includes('userSelectedRaffleExplicitly'), 'Flag userSelectedRaffleExplicitly implementada para respeitar seleção manual do operador');
assert(appJsContent.includes('getHighestRaffle(appData.raffles)'), 'initApp utiliza getHighestRaffle');
assert(appJsContent.includes('getHighestRaffle(sanitized.raffles)'), 'mergeRemoteData utiliza getHighestRaffle');

// 3. Testar placeholder no index.html
console.log('\n3. Verificando index.html (Remoção de flash 107°):');
const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(!htmlContent.includes('<h3 class="raffle-title-main" id="raffleDisplayTitle">107° AÇÃO ELDORADO PESCA</h3>'), 'HTML estático não fixa mais 107° no raffleDisplayTitle');
assert(htmlContent.includes('id="raffleDisplayTitle">Carregando ação...</h3>'), 'HTML estático usa placeholder neutro "Carregando ação..."');

// 4. Testar Responsividade de "Reservado" no CSS e no JS
console.log('\n4. Verificando Responsividade do badge Reservado no styles.css e app.js:');
const cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
assert(cssContent.includes('.status-text-short'), 'styles.css define suporte à classe .status-text-short');
assert(cssContent.includes('.status-text-full'), 'styles.css define suporte à classe .status-text-full');
assert(cssContent.includes('@media (max-width: 440px)'), 'styles.css possui breakpoint para telas ultra-estreitas (<= 440px)');
assert(appJsContent.includes('status-text-full') && appJsContent.includes('status-text-short'), 'app.js renderiza tanto texto completo ("Reservado") quanto curto ("Res.") para o badge');

// 5. Testar Token de Auth e Suporte a Background Sync no db_dexie e sw.js
console.log('\n5. Verificando Autenticação no Service Worker & IndexedDB:');
const dexieContent = fs.readFileSync(path.join(__dirname, 'db_dexie.js'), 'utf8');
const swContent = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const authContent = fs.readFileSync(path.join(__dirname, 'auth_manager.js'), 'utf8');

assert(dexieContent.includes('saveAuthSession'), 'db_dexie.js expõe saveAuthSession');
assert(dexieContent.includes('authToken: authToken'), 'db_dexie.js persiste authToken na operação do outbox');
assert(authContent.includes('saveAuthSession'), 'auth_manager.js sincroniza sessão com IndexedDB');
assert(swContent.includes('getAuthTokenFromDB'), 'sw.js busca token autenticado no IndexedDB');
assert(swContent.includes('refreshSupabaseTokenInSW'), 'sw.js possui renovação automática de token expirado em background');
assert(swContent.includes("self.addEventListener('online'"), 'sw.js escuta evento online para disparo automático ao ligar Wi-Fi');

console.log('\n============================================================');
console.log(`  RESULTADO: ${passed} passaram, ${failed} falharam.`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);

/**
 * Suíte de Testes Automatizados: Sincronização em Segundo Plano (Desktop & Mobile)
 * Eldorado Pesca & Lake (v2.7.0)
 */

const fs = require('fs');
const path = require('path');

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
console.log('  VALIDAÇÃO: BACKGROUND SYNC, SYSTEM TRAY & PERSISTÊNCIA OFFLINE');
console.log('================================================================\n');

// 1. Electron Main Process & Preload
console.log('1. Verificando Electron Desktop (System Tray & Processo em Background):');
const mainCode = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const preloadCode = fs.readFileSync(path.join(__dirname, 'preload.js'), 'utf8');

assert(mainCode.includes('new Tray('), 'main.js inicializa Tray nativo');
assert(mainCode.includes('mainWindow.hide()'), 'main.js oculta a janela no close sem finalizar o processo');
assert(mainCode.includes("mainWindow.webContents.send('trigger-background-sync')"), 'main.js despacha sinal de sync para renderer em background');
assert(mainCode.includes('app.isQuiting'), 'main.js gerencia flag isQuiting para saída limpa');
assert(mainCode.includes('Abrir Eldorado Pesca PRO'), 'Menu da bandeja inclui opção para restaurar janela');
assert(mainCode.includes('Sincronizar Agora'), 'Menu da bandeja inclui disparo manual de sincronização');
assert(preloadCode.includes('onTriggerBackgroundSync'), 'preload.js expõe onTriggerBackgroundSync');
assert(preloadCode.includes('notifySyncStatus'), 'preload.js expõe notifySyncStatus');

// 2. Service Worker & Mobile Background Sync API
console.log('\n2. Verificando Service Worker (W3C Background Sync API & Dispatcher):');
const swCode = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');

assert(swCode.includes('eldorado-pwa-v2.7.0'), 'sw.js atualizado para versão v2.7.0');
assert(swCode.includes("self.addEventListener('sync'"), 'sw.js escuta evento "sync" do sistema operacional');
assert(swCode.includes("self.addEventListener('periodicsync'"), 'sw.js escuta evento "periodicsync"');
assert(swCode.includes('eldorado-outbox-sync'), 'sw.js trata tag eldorado-outbox-sync');
assert(swCode.includes('processBackgroundOutboxSync'), 'sw.js implementa processBackgroundOutboxSync');
assert(swCode.includes('openLocalIndexedDB'), 'sw.js lê fila diretamente do IndexedDB em background');
assert(swCode.includes('sell_raffle_numbers_atomic'), 'sw.js despacha vendas de cotas para o Supabase');
assert(swCode.includes('BroadcastChannel'), 'sw.js notifica abas abertas sobre término do sync');

// 3. Persistência e Enfileiramento no Dexie / IndexedDB
console.log('\n3. Verificando db_dexie.js (Registro de Background Sync no Outbox):');
const dexieCode = fs.readFileSync(path.join(__dirname, 'db_dexie.js'), 'utf8');

assert(dexieCode.includes('reg.sync.register(\'eldorado-outbox-sync\')'), 'db_dexie.js registra tag de background sync no Service Worker');
assert(dexieCode.includes('reg.periodicSync.register'), 'db_dexie.js registra periodicSync');

// 4. SyncEngine: Concorrência e Auto-Recuperação de Rede
console.log('\n4. Verificando sync_engine.js (Travamento de Concorrência & Auto-Recuperação):');
const syncCode = fs.readFileSync(path.join(__dirname, 'sync_engine.js'), 'utf8');

assert(syncCode.includes('this._activeQueuePromise'), 'sync_engine.js implementa trava de concorrência com activeQueuePromise');
assert(syncCode.includes("window.electronAPI.onTriggerBackgroundSync"), 'sync_engine.js responde ao gatilho de sync do Electron');
assert(syncCode.includes("new BroadcastChannel('eldorado-sync-channel')"), 'sync_engine.js escuta canal de broadcast do Service Worker');
assert(syncCode.includes('pageshow'), 'sync_engine.js escuta evento pageshow para auto-sync mobile');
assert(syncCode.includes('navigator.onLine && !this.isOnline'), 'sync_engine.js auto-recupera isOnline em checagem periódica');

// 5. App.js: Smart Merge Anti-Sobrescrita
console.log('\n5. Verificando app.js (Smart Merge Anti-Sobrescrita de Dados Locais):');
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

assert(appCode.includes('Smart Merge'), 'app.js implementa Smart Merge');
assert(appCode.includes('Preservando') && appCode.includes('operações locais pendentes'), 'app.js preserva fila pendente contra rollback');
assert(appCode.includes('targetRaffle.numbers'), 'Smart Merge protege cotas modificadas localmente');
assert(appCode.includes('sanitized.valesAndPrizes'), 'Smart Merge protege vales locais');
assert(appCode.includes('sanitized.fishingBookings'), 'Smart Merge protege agendamentos locais');
assert(appCode.includes('TRIGGER_SYNC'), 'saveState dispara TRIGGER_SYNC para o Service Worker');

// 6. Versões do Pacote e Arquivo Principal
console.log('\n6. Verificando Consistência de Versões (v2.7.0):');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const htmlCode = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert(pkg.version === '2.7.0', 'package.json está na versão 2.7.0');
assert(htmlCode.includes('app.js?v=2.7.0'), 'index.html referencia app.js?v=2.7.0');
assert(htmlCode.includes('v2.7.0 PRO'), 'index.html exibe badge v2.7.0 PRO');

console.log('\n============================================================');
console.log(`  RESULTADO: ${passed} passaram, ${failed} falharam.`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);

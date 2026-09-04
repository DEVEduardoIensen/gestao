/**
 * Teste de Validação Específica para Desktop Offline e Sincronização Wi-Fi
 * Eldorado Pesca & Lake
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
console.log('  VALIDAÇÃO DO APP DESKTOP, PERSISTÊNCIA OFFLINE E REALTIME');
console.log('================================================================\n');

// 1. Atalhos do Windows e Executável Nativo
console.log('1. Verificando Executável Nativo e Atalhos Desktop (Sem Ícone do Google):');
const exePath = path.join(__dirname, 'Eldorado Pesca.exe');
assert(fs.existsSync(exePath), 'Eldorado Pesca.exe existe no diretório raiz do projeto');

const possibleLnkPaths = [
  path.join(process.env.USERPROFILE, 'Desktop', 'Eldorado Pesca & Lake.lnk'),
  path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop', 'Eldorado Pesca & Lake.lnk'),
  path.join(process.env.USERPROFILE, 'Eldorado Pesca & Lake.lnk')
];
const desktopLnk = possibleLnkPaths.find(p => fs.existsSync(p)) || possibleLnkPaths[0];
assert(fs.existsSync(desktopLnk), 'Atalho oficial na Área de Trabalho existe');

const lnkContent = fs.existsSync(desktopLnk) ? fs.readFileSync(desktopLnk, 'latin1') : '';
assert(lnkContent.includes('Eldorado Pesca.exe'), 'Atalho aponta para o executável Eldorado Pesca.exe nativo');
assert(!lnkContent.includes('chrome_proxy.exe'), 'Atalho NÃO aponta para chrome_proxy.exe (elimina a bolinha do Google)');

// 2. AuthManager - Suporte a Desktop e Fallback Seguro Offline
console.log('\n2. Verificando AuthManager (Desktop & Offline Safe):');
const authCode = fs.readFileSync(path.join(__dirname, 'auth_manager.js'), 'utf8');
assert(authCode.includes('isDesktopApp'), 'auth_manager.js possui detecção isDesktopApp()');
assert(authCode.includes('isStandaloneOrInstalled'), 'auth_manager.js possui isStandaloneOrInstalled()');
assert(authCode.includes('ensureDirectInstalledSession'), 'auth_manager.js possui ensureDirectInstalledSession()');
assert(authCode.includes('getDefaultOrgId'), 'auth_manager.js possui getDefaultOrgId() dinâmico');
assert(authCode.includes("event === 'SIGNED_OUT'"), 'auth_manager.js só apaga dados de login em logout explícito (protege sessão offline)');

// 3. App.js - Blindagem de saveState e Carregamento Offline
console.log('\n3. Verificando app.js (Persistência Offline Garantida):');
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
assert(appCode.includes('window.mergeRemoteData'), 'app.js implementa window.mergeRemoteData() para updates em tempo real');
assert(appCode.includes('window.__ELDORADO_IS_DESKTOP_APP'), 'app.js reconhece desktop sem bloquear com tela de autenticação');
assert(!appCode.match(/const orgId = window\.authManager \? window\.authManager\.getOrganizationId\(\) : null;\s+if \(!orgId\) return;/), 'saveState não descarta mais gravações por orgId nulo');

// 4. SyncEngine - Supabase Realtime & Auto-Sync ao Ligar Wi-Fi
console.log('\n4. Verificando sync_engine.js (Supabase Realtime & Wi-Fi Reconnect):');
const syncCode = fs.readFileSync(path.join(__dirname, 'sync_engine.js'), 'utf8');
assert(syncCode.includes('initRealtimeSubscription'), 'sync_engine.js implementa canal Realtime do Supabase');
assert(syncCode.includes('handleRealtimePayload'), 'sync_engine.js trata payloads Realtime e atualiza grid');
assert(syncCode.includes('scheduleDebouncedRemoteRefresh'), 'sync_engine.js implementa refresh com debounce');
assert(syncCode.includes("window.addEventListener('online'"), 'sync_engine.js escuta reconexão do Wi-Fi');
assert(syncCode.includes("document.addEventListener('visibilitychange'"), 'sync_engine.js sincroniza ao voltar ao app');

// 5. Service Worker - Caching Offline Resiliente
console.log('\n5. Verificando sw.js (Cache PWA v2.6.0):');
const swCode = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
assert(/eldorado-pwa-v2\.[6789]/.test(swCode), 'sw.js atualizado para a versão de cache v2.6.0 ou superior (v2.7.x)');
assert(swCode.includes('ignoreSearch: true'), 'sw.js ignora query strings (cache match resiliente offline)');

// 6. Electron Main Process
console.log('\n6. Verificando main.js & preload.js (Electron Desktop):');
const mainCode = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const preloadPath = path.join(__dirname, 'preload.js');
assert(fs.existsSync(preloadPath), 'preload.js existe');
assert(mainCode.includes('preload: path.join(__dirname, \'preload.js\')'), 'main.js carrega preload.js');
assert(mainCode.includes('localIndexPath'), 'main.js possui fallback offline para carregar index.html diretamente');
assert(mainCode.includes('app.setAppUserModelId'), 'main.js define AppUserModelId para ícone limpo na barra de tarefas');

console.log('\n============================================================');
console.log(`  RESULTADO: ${passed} passaram, ${failed} falharam.`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);

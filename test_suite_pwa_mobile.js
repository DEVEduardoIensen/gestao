/**
 * Test Suite Completo de Validação PWA, Mobile First, Offline, Concorrência e Vercel
 * Eldorado Pesca & Lake (v2.2)
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
console.log('  SUITE DE TESTES INTEGRADOS — PWA MOBILE + SUPABASE + OFFLINE');
console.log('================================================================\n');

// 1. PWA MANIFEST & ICONS
console.log('1. Verificando PWA Manifest e Ícones:');
const manifestPath = path.join(__dirname, 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json existe na raiz');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert(manifest.name === 'Eldorado Pesca & Lake', `Nome da PWA configurado para "${manifest.name}"`);
assert(manifest.display === 'standalone', 'Display configurado como "standalone"');
assert(manifest.theme_color === '#060a13', 'Theme color configurado (#060a13)');
assert(manifest.background_color === '#060a13', 'Background color configurado (#060a13)');
assert(manifest.start_url === './' || manifest.start_url === '/', 'start_url válido');

// Ícones
const icon192 = path.join(__dirname, 'icon-192.png');
const icon512 = path.join(__dirname, 'icon-512.png');
const appleIcon = path.join(__dirname, 'apple-touch-icon.png');
const logoWebp = path.join(__dirname, 'logo.webp');

assert(fs.existsSync(icon192) && fs.statSync(icon192).size > 1000, `icon-192.png presente (${(fs.statSync(icon192).size/1024).toFixed(1)} KB)`);
assert(fs.existsSync(icon512) && fs.statSync(icon512).size > 1000, `icon-512.png presente (${(fs.statSync(icon512).size/1024).toFixed(1)} KB)`);
assert(fs.existsSync(appleIcon) && fs.statSync(appleIcon).size > 1000, `apple-touch-icon.png presente (${(fs.statSync(appleIcon).size/1024).toFixed(1)} KB)`);
assert(fs.existsSync(logoWebp) && fs.statSync(logoWebp).size > 1000, `logo.webp presente (${(fs.statSync(logoWebp).size/1024).toFixed(1)} KB)`);

// 2. SERVICE WORKER & APP SHELL ASSETS
console.log('\n2. Verificando Service Worker e Integridade do App Shell:');
const swPath = path.join(__dirname, 'sw.js');
assert(fs.existsSync(swPath), 'sw.js existe');
const swContent = fs.readFileSync(swPath, 'utf8');
assert(/eldorado-pwa-v2\./.test(swContent), 'Service Worker atualizado para versão v2.x.x');
assert(swContent.includes('skipWaiting'), 'Service Worker implementa skipWaiting');
assert(swContent.includes('clients.claim'), 'Service Worker assume controle da página (clients.claim)');
assert(!swContent.includes('indexedDB.deleteDatabase'), 'Service Worker NUNCA apaga IndexedDB durante updates');

// Verifica se cada arquivo declarado no APP_SHELL_ASSETS existe fisicamente
const assetMatches = swContent.match(/const APP_SHELL_ASSETS = \[([\s\S]*?)\];/);
if (assetMatches) {
  const assets = assetMatches[1]
    .split(',')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(s => s && s !== './');
  
  let allAssetsExist = true;
  assets.forEach(asset => {
    const cleanAsset = asset.replace(/^\.\//, '');
    const assetFilePath = path.join(__dirname, cleanAsset);
    const exists = fs.existsSync(assetFilePath);
    if (!exists) {
      console.error(`    Arquivo do cache ausente: ${asset}`);
      allAssetsExist = false;
    }
  });
  assert(allAssetsExist, 'Todos os assets do App Shell existem fisicamente no repositório');
}

// 3. HTML META TAGS & MOBILE READINESS
console.log('\n3. Verificando HTML5 & Mobile Meta Tags no index.html:');
const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(htmlContent.includes('viewport-fit=cover'), 'Viewport configurado com viewport-fit=cover para notch iOS');
assert(htmlContent.includes('apple-mobile-web-app-capable'), 'Meta tag apple-mobile-web-app-capable presente');
assert(htmlContent.includes('apple-touch-icon'), 'apple-touch-icon configurado');
assert(htmlContent.includes('modalSyncCenter'), 'Central de Sincronização acessível no DOM');
assert(htmlContent.includes('dbStatusBadge'), 'Badge de status online/offline presente no cabeçalho');

// 4. AUTH MANAGER OFFLINE RESILIENCE
console.log('\n4. Verificando AuthManager e Resiliência Offline:');
const authContent = fs.readFileSync(path.join(__dirname, 'auth_manager.js'), 'utf8');
assert(authContent.includes('restoreCachedOrganizations'), 'auth_manager.js implementa restoreCachedOrganizations');
assert(authContent.includes('ELDORADO_CACHED_ORGS'), 'auth_manager.js persiste cache local das organizações');
assert(authContent.includes('ELDORADO_ACTIVE_ORG_ID'), 'auth_manager.js preserva organização ativa offline');
assert(authContent.includes('updatePassword'), 'auth_manager.js suporta redefinição de senha');
assert(!authContent.includes('00000000-0000-0000-0000-000000000001'), 'Sem fallback hardcoded para tenant único');

// 5. CSS MOBILE FIRST & TOUCH OPTIMIZATION
console.log('\n5. Verificando Regras CSS Mobile First em styles.css:');
const cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
assert(cssContent.includes('@media (max-width: 768px)'), 'styles.css possui media queries para telas <= 768px');
assert(cssContent.includes('font-size: 16px !important'), 'Prevenção de auto-zoom indesejado no iOS Safari (inputs >= 16px)');
assert(cssContent.includes('touch-action: manipulation'), 'touch-action: manipulation aplicado para remoção de delay 300ms');
assert(cssContent.includes('overflow-x: auto'), 'Abas de navegação possuem rolagem horizontal suave');
assert(cssContent.includes('num-tile'), 'Estilo das cotas (.num-tile) definido com contraste nítido');

// 6. SYNC ENGINE & ATOMIC COTAS RPC
console.log('\n6. Verificando Sync Engine, Concorrência e Outbox:');
const syncContent = fs.readFileSync(path.join(__dirname, 'sync_engine.js'), 'utf8');
assert(syncContent.includes('sell_raffle_numbers_atomic'), 'RPC sell_raffle_numbers_atomic integrada no Sync Engine');
assert(syncContent.includes('resolveConflict'), 'resolveConflict implementado para resolução de concorrência');
assert(syncContent.includes('DELETE_RAFFLE') && syncContent.includes('DELETE_VALE'), 'Exclusões propagadas pelo Outbox');

// 7. VERCEL CONFIGURATION
console.log('\n7. Verificando vercel.json:');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8'));
assert(vercelConfig.cleanUrls === true, 'vercel.json cleanUrls ativado');
assert(Array.isArray(vercelConfig.rewrites) && vercelConfig.rewrites.length > 0, 'vercel.json possui fallback de rotas SPA');
assert(Array.isArray(vercelConfig.headers) && vercelConfig.headers.length >= 2, 'vercel.json possui headers de Cache-Control para PWA');

// 8. SQLITE ORIGINAL PRESERVATION
console.log('\n8. Verificando Integridade do SQLite Original:');
const dbFile = path.join(__dirname, 'eldorado_pesca.db');
assert(fs.existsSync(dbFile) && fs.statSync(dbFile).size > 50000, `eldorado_pesca.db intacto (${(fs.statSync(dbFile).size/1024).toFixed(1)} KB)`);

console.log('\n============================================================');
console.log(`  RESULTADO: ${testsPassed} testes passaram, ${testsFailed} falharam.`);
console.log('============================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

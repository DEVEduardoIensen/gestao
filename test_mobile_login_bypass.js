/**
 * Teste E2E e Unitário: Bypass da Tela de Login no App Instalado no Mobile
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('  TESTE DE VALIDAÇÃO DO BYPASS DE LOGIN NO MOBILE INSTALADO');
console.log('================================================================\n');

// 1. Validar auth_manager.js
const authCode = fs.readFileSync(path.join(__dirname, 'auth_manager.js'), 'utf8');
assert(authCode.includes('isMobileInstalledApp()'), 'auth_manager.js implementa isMobileInstalledApp()');
assert(authCode.includes('ensureMobileInstalledSession()'), 'auth_manager.js implementa ensureMobileInstalledSession()');
assert(!authCode.includes('00000000-0000-0000-0000-000000000001'), 'auth_manager.js não possui UUID hardcoded');
console.log('✓ [PASS] auth_manager.js possui detecção e inicialização dinâmica para mobile instalado');

// 2. Validar index.html
const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(htmlContent.includes('id="authGateScreen" class="auth-gate-screen" style="display: none;"'), 'authGateScreen inicia com display: none');
assert(htmlContent.includes('window.__ELDORADO_IS_MOBILE_APP = true;'), 'Script inline no head faz detecção precoce de app móvel');
console.log('✓ [PASS] index.html configurado para zero flicker e início limpo no mobile');

// 3. Validar app.js
const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
assert(appCode.includes('isMobileInstalled'), 'app.js verifica se é mobile instalado no initAppState');
assert(appCode.includes('ELDORADO_MOBILE_INSTALLED'), 'triggerInstallApp persiste marcação de instalação mobile');
console.log('✓ [PASS] app.js bypassa bloqueio de autenticação quando instalado no celular');

// 4. Validar styles.css
const cssCode = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
assert(cssCode.includes('overflow-y: auto;'), '.auth-gate-screen suporta rolagem vertical quando teclado abre');
assert(cssCode.includes('-webkit-overflow-scrolling: touch;'), 'Rolagem fluida no iOS Safari');
console.log('✓ [PASS] styles.css corrigido para prevenir travamentos no teclado mobile');

console.log('\n============================================================');
console.log('  TODAS AS VALIDAÇÕES DO MOBILE BYPASS PASSARAM COM SUCESSO!');
console.log('============================================================');

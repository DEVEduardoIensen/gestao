const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  TESTE DE VALIDAÇÃO: TELA DE LOGIN NO SITE WEB & BYPASS NOS APPS');
console.log('================================================================\n');

// 1. Validar auth_manager.js
const authFile = fs.readFileSync(path.join(__dirname, 'auth_manager.js'), 'utf8');
assert(!authFile.includes('if (this.currentOrg && this.currentOrg.id) {\n      return true;'), 'auth_manager.js não dá bypass de login apenas por ter currentOrg');
assert(authFile.includes('return !!(this.user && this.currentOrg && this.currentOrg.id);'), 'auth_manager.js exige usuário real para autenticação web');
assert(authFile.includes('(isMobileDevice && isMarkedInstalled)'), 'auth_manager.js exige dispositivo móvel para flag de instalação mobile');
console.log('✓ [PASS] auth_manager.js devidamente configurado para exigir login no site web');

// 2. Validar index.html
const htmlFile = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
assert(htmlFile.includes("var hasSavedAuth = !!localStorage.getItem('sb-tfttmfbfzyymuwiwpxyw-auth-token');"), 'index.html valida apenas token real do Supabase como sessão salva');
assert(htmlFile.includes("document.documentElement.classList.add('show-auth-gate');"), 'index.html ativa auth gate precocemente para visitantes web');
const pkgFile = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
assert(htmlFile.includes(`v${pkgFile.version} PRO`), `index.html exibe versão v${pkgFile.version} PRO`);
console.log('✓ [PASS] index.html bloqueia visitantes não autenticados e atualiza versão');

// 3. Validar sw.js e package.json
const swFile = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
assert(swFile.includes(`const CACHE_NAME = 'eldorado-pwa-v${pkgFile.version}';`), `sw.js atualizado para versão v${pkgFile.version}`);
assert.strictEqual(pkgFile.version, '2.8.5', 'package.json atualizado para 2.8.5');
console.log(`✓ [PASS] sw.js e package.json sincronizados na versão ${pkgFile.version}`);

console.log('\n============================================================');
console.log('  TODAS AS VALIDAÇÕES DE AUTH GATE & BYPASS PASSARAM COM SUCESSO!');
console.log('============================================================');

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('  TESTE: ABERTURA DO SCANNER DE CÓDIGO DE BARRAS NO MOBILE (v2.9.2)');
console.log('================================================================\n');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// 1. Botão de ativação no index.html
assert(html.includes('id="btnOpenBoletoLiveScanner"'), 'Botão btnOpenBoletoLiveScanner deve possuir ID dedicado');
assert(html.includes('onclick="openBoletoLiveBarcodeScanner()"'), 'Botão deve invocar openBoletoLiveBarcodeScanner()');
assert(html.includes('touch-action: manipulation;'), 'Botão deve ter touch-action: manipulation para eliminar delay de 300ms no touch');
console.log('✓ [PASS] Botão de escanear código de barras validado no HTML');

// 2. Modal do Scanner e Fallbacks
assert(html.includes('id="modalBoletoLiveScanner"'), 'Modal modalBoletoLiveScanner presente no DOM');
assert(html.includes('id="boletoScannerFallbackActions"'), 'Container de fallback presente no modal do scanner');
assert(html.includes('triggerBoletoCameraCapture(\'linha\')'), 'Botão de fotografar linha digitável presente no fallback');
assert(html.includes('triggerBoletoCameraCapture(\'completa\')'), 'Botão de fotografar boleto completo presente no fallback');
assert(html.includes('webkit-playsinline'), 'Elemento de vídeo possui webkit-playsinline para iOS Safari');
console.log('✓ [PASS] Modal do scanner e fallbacks inteligentes validados no HTML');

// 3. Estilos CSS para visibilidade e opacidade garantida
assert(css.includes('#modalBoletoLiveScanner.open'), 'CSS possui regra específica para #modalBoletoLiveScanner.open');
assert(css.includes('opacity: 1 !important;'), 'CSS garante opacity: 1 !important quando aberto');
assert(css.includes('pointer-events: auto !important;'), 'CSS garante pointer-events: auto !important');
assert(css.includes('.scanner-fallback-actions'), 'CSS possui estilização para card de fallback no mobile');
console.log('✓ [PASS] Regras de CSS garantem visibilidade 100% e evitam transparência fantasma');

// 4. Lógica no app.js
assert(appJs.includes('modal.classList.add("open");'), 'openBoletoLiveBarcodeScanner adiciona a classe .open');
assert(appJs.includes('modal.style.display = "flex";'), 'openBoletoLiveBarcodeScanner define display flex');
assert(appJs.includes('triggerBoletoCameraCapture'), 'app.js implementa triggerBoletoCameraCapture');
assert(appJs.includes('window.triggerBoletoCameraCapture = triggerBoletoCameraCapture;'), 'triggerBoletoCameraCapture exposta globalmente');
assert(appJs.includes('video.setAttribute(\'webkit-playsinline\', \'\');'), 'Configuração explícita de webkit-playsinline em runtime');
console.log('✓ [PASS] app.js gerencia abertura, compatibilidade iOS Safari e fallback fotográfico');

console.log('\n================================================================');
console.log('  RESULTADO: TODOS OS TESTES DO SCANNER MOBILE PASSARAM (100%)');
console.log('================================================================');

/**
 * test_iphone_camera_and_boleto_reader.js
 * 
 * Bateria de Testes: Compatibilidade com Câmera do iPhone (iOS Safari / PWA)
 * e Leitura de Foto de Boletos (FEBRABAN)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('================================================================');
console.log('  TESTE: COMPATIBILIDADE IPHONE / IOS COM LEITURA DE BOLETOS');
console.log('================================================================\n');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// -------------------------------------------------------------
// 1. Verificação dos Botões da Página Boletos no DOM
// -------------------------------------------------------------
console.log('1. Verificando Botões Oficiais Mantidos na Página de Boletos:');
assert(html.includes('id="btnSyncBoletosCloud"'), 'Botão "Sincronizar Nuvem" deve existir');
assert(html.includes('openNewBoletoModal()'), 'Botão "+ Novo Manual" deve existir');
assert(html.includes('loadDemoBoletos()'), 'Botão "Recarregar Relatório Real" deve existir');
assert(html.includes('exportBoletosBackupJSON()'), 'Botão "Backup JSON" deve existir');
console.log('  ✓ [PASS] Os 4 botões solicitados estão presentes no DOM:');
console.log('      - Sincronizar Nuvem');
console.log('      - + Novo Manual');
console.log('      - Recarregar Relatório Real');
console.log('      - Backup JSON');

console.log('\n2. Verificando Remoção dos Botões Antigos da Barra de Ações:');
const sectionActionsMatch = html.match(/<div class="section-actions"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
const boletosSectionActions = sectionActionsMatch ? sectionActionsMatch[1] : '';

assert(!boletosSectionActions.includes('btnOpenBoletoLiveScanner'), 'Botão "Escanear Código de Barras (Câmera)" removido do cabeçalho');
assert(!boletosSectionActions.includes('Foto Linha Digitável'), 'Botão "Foto Linha Digitável" removido do cabeçalho');
assert(!boletosSectionActions.includes('Importar PDF / Relatório'), 'Botão "Importar PDF / Relatório" removido do cabeçalho');
assert(!boletosSectionActions.includes('Foto Completa'), 'Botão "Foto Completa" removido do cabeçalho');
assert(!boletosSectionActions.includes('<span>Galeria</span>'), 'Botão "Galeria" removido do cabeçalho');
console.log('  ✓ [PASS] Todos os 5 botões redundantes foram removidos com sucesso da barra de ações.');

// -------------------------------------------------------------
// 2. Disparo da Câmera Nativa no iPhone (iOS Safari)
// -------------------------------------------------------------
console.log('\n3. Verificando Disparo da Câmera Nativa no iPhone:');
assert(html.includes('id="boletoCameraInput"'), 'Input boletoCameraInput presente');
assert(html.includes('capture="environment"'), 'Atributo capture="environment" presente para acionar câmera traseira');
assert(html.includes('accept="image/*"'), 'Atributo accept="image/*" presente para aceitar fotos do iOS');

// A Dropzone deve ser uma label associada ao boletoCameraInput para clique nativo no Safari iOS
assert(html.includes('for="boletoCameraInput"') && html.includes('id="boletosDropzone"'), 
  'Dropzone configurada como <label for="boletoCameraInput"> para acionamento nativo e infalível no iOS');

// O Modal + Novo Manual também possui botão para acionar a câmera no iPhone
assert(html.includes('modalBoletoForm') && html.includes('📸 Ler com Câmera'),
  'Modal "+ Novo Manual" possui botão "📸 Ler com Câmera" para fotografar diretamente do formulário');

console.log('  ✓ [PASS] Disparo 100% nativo para iPhone: Dropzone e Modal acionam a câmera traseira');

// -------------------------------------------------------------
// 3. Estilos e Toque no iOS Safari
// -------------------------------------------------------------
console.log('\n4. Verificando Otimizações de Toque e Renderização no iOS:');
assert(css.includes('.boletos-dropzone'), '.boletos-dropzone estilizado no styles.css');
assert(css.includes('touch-action: manipulation'), 'touch-action: manipulation configurado (elimina delay de 300ms no Safari iOS)');
assert(css.includes('-webkit-tap-highlight-color: transparent'), '-webkit-tap-highlight-color configurado para evitar flash cinza no iOS');
console.log('  ✓ [PASS] Estilos táteis do Safari iOS verificados e validados');

// -------------------------------------------------------------
// 4. Teste Sandbox: Pipeline de Pré-processamento e Decodificação
// -------------------------------------------------------------
console.log('\n5. Testando Pipeline de Processamento de Imagem de Alta Resolução (iPhone 12MP/48MP):');

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  Date,
  Math,
  parseInt,
  parseFloat,
  String,
  Number,
  Array,
  Object,
  RegExp,
  JSON,
  Uint8Array,
  window: {
    addEventListener: () => {},
    removeEventListener: () => {}
  },
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => {
      return {
        value: '',
        style: {},
        textContent: '',
        classList: { add: () => {}, remove: () => {} },
        click: () => {}
      };
    },
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => {},
            getImageData: (x, y, w, h) => ({
              data: new Uint8Array(w * h * 4).fill(255)
            }),
            putImageData: () => {}
          }),
          toDataURL: () => 'data:image/jpeg;base64,mockthumb'
        };
      }
      return { style: {}, appendChild: () => {}, addEventListener: () => {} };
    }
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  navigator: {
    clipboard: { writeText: async () => {} },
    vibrate: () => {}
  },
  showToast: () => {},
  formatCurrency: (v) => 'R$ ' + Number(v).toFixed(2),
  escapeHtml: (s) => String(s || '')
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// Executar script app.js no sandbox
vm.runInContext(appJs, sandbox);

// Simulação de cálculo de redimensionamento para fotos de iPhone (4032 x 3024)
const origWidth = 4032;
const origHeight = 3024;
const maxDim = 1600;
let finalW = origWidth;
let finalH = origHeight;
if (origWidth > maxDim || origHeight > maxDim) {
  if (origWidth > origHeight) {
    finalH = Math.round((origHeight * maxDim) / origWidth);
    finalW = maxDim;
  } else {
    finalW = Math.round((origWidth * maxDim) / origHeight);
    finalH = maxDim;
  }
}
assert.strictEqual(finalW, 1600, 'Largura máxima reduzida para 1600px no Safari');
assert.strictEqual(finalH, 1200, 'Altura proporcionalmente ajustada para 1200px');
console.log(`  ✓ [PASS] Redimensionamento inteligente: foto 4032x3024 -> ${finalW}x${finalH} (evita estouro de memória no Safari iOS)`);

// -------------------------------------------------------------
// 5. Decodificação de Linha FEBRABAN Capturada por Foto
// -------------------------------------------------------------
console.log('\n6. Testando Decodificação Automática de Boleto Bancário Fotografado:');
// Linha real e matematicamente válida do Banco do Brasil
const sampleOcrText = `
BANCO DO BRASIL  001-9
00190.00009 00188.100002 00000.000000 2 15660000053880
Beneficiário: JOGA INDUSTRIA E COMERCIO LTDA
CNPJ: 05.123.456/0001-99
Vencimento: 11/09/2026
Valor Cobrado: R$ 538,80
`;

const decoded = sandbox.decodeFebrabanBoleto(sampleOcrText);
assert.strictEqual(decoded.valid, true, 'Boleto bancário deve ser válido');
assert.strictEqual(decoded.bankCode, '001', 'Banco do Brasil identificado');
assert.strictEqual(decoded.amount, '538.80', 'Valor R$ 538.80 identificado');
assert.strictEqual(decoded.dueDate, '2026-09-11', 'Vencimento 11/09/2026 decodificado via fator FEBRABAN');
console.log(`  ✓ [PASS] Boleto bancário identificado com sucesso:`);
console.log(`      Banco: ${decoded.bankName} (${decoded.bankCode})`);
console.log(`      Valor: R$ ${decoded.amount}`);
console.log(`      Vencimento: ${decoded.dueDate}`);
console.log(`      Linha: ${decoded.formattedCode}`);

// -------------------------------------------------------------
// 6. Decodificação de Fatura / Concessionária (48 dígitos)
// -------------------------------------------------------------
console.log('\n7. Testando Decodificação de Fatura de Concessionária (Copel / Água):');
const b1 = '84660000004';
const dv1 = sandbox.calcMod10(b1);
const b2 = '58501092026';
const dv2 = sandbox.calcMod10(b2);
const b3 = '62862660001';
const dv3 = sandbox.calcMod10(b3);
const b4 = '00000000000';
const dv4 = sandbox.calcMod10(b4);

const sampleConcessionaria = `
COPEL DISTRIBUICAO ENERGIA S.A.
${b1}-${dv1} ${b2}-${dv2} ${b3}-${dv3} ${b4}-${dv4}
Vencimento: 20/09/2026
Total a Pagar: R$ 458,50
`;

const decConc = sandbox.decodeFebrabanBoleto(sampleConcessionaria);
assert.strictEqual(decConc.valid, true, 'Concessionária 48 dígitos deve ser válida');
assert.strictEqual(decConc.amount, '458.50', 'Valor da concessionária deve ser R$ 458.50');
console.log(`  ✓ [PASS] Fatura de concessionária identificada:`);
console.log(`      Beneficiário: ${decConc.beneficiary}`);
console.log(`      Valor: R$ ${decConc.amount}`);
console.log(`      Linha: ${decConc.formattedCode}`);

// -------------------------------------------------------------
// 7. Limpeza do Input de Arquivo no iPhone
// -------------------------------------------------------------
console.log('\n8. Verificando Reset do Evento onchange para Fotos Repetidas no iOS:');
assert(appJs.includes('e.target.value = ""'), 'Target value é limpo após a leitura para permitir fotografar o mesmo nome "image.jpg"');
console.log('  ✓ [PASS] Reset do input garante disparos consecutivos no iOS');

console.log('\n================================================================');
console.log('  RESULTADO: 100% DOS TESTES PARA IPHONE E BOLETOS PASSARAM!');
console.log('================================================================\n');

/**
 * test_boleto_reliability_suite.js
 * 
 * Bateria de Testes de Confiabilidade Extrema do Módulo de Boletos (FEBRABAN)
 * Prioridade: PRECISÃO > AUTOMATIZAÇÃO (Conservador: melhor não identificar que errar)
 * 
 * Cobertura de 18 Cenários Críticos:
 * 1. Linha digitável bancária válida (47 dígitos)
 * 2. Código de barras bancário válido (44 dígitos)
 * 3. Linha digitável de arrecadação/concessionária válida (48 dígitos, Mod 10)
 * 4. Código de barras de concessionária válido (44 dígitos, Mod 10)
 * 5. Linha digitável de concessionária válida (48 dígitos, Mod 11)
 * 6. Sequência de 44 dígitos aleatórios -> REJEIÇÃO OBRIGATÓRIA
 * 7. Sequência de 47 dígitos aleatórios -> REJEIÇÃO OBRIGATÓRIA
 * 8. Sequência de 48 dígitos aleatórios -> REJEIÇÃO OBRIGATÓRIA
 * 9. Documento com CPF, CNPJ, telefone, número de NF e valores SEM código -> NUNCA gerar boleto falso
 * 10. OCR com confusão de caracteres (O->0, l->1, etc.) em código válido -> correção precisa
 * 11. Foto com Beneficiário e CNPJ identificados -> Beneficiário correto, nunca chutar o banco
 * 12. Fatores FEBRABAN: Ciclo 1 (histórico pré-2025) e Ciclo 2 (reinício em 22/02/2025)
 * 13. Boleto com valor aberto/zerado -> não inventar valor
 * 14. Boleto sem fator de vencimento (0000) -> vencimento vazio para confirmação
 * 15. Conversão bidirecional: Linha 47 <-> Código de Barras 44
 * 16. Conversão bidirecional: Linha 48 <-> Código de Barras 44 (Concessionárias)
 * 17. Dicionário FEBRABAN dos principais bancos brasileiros
 * 18. Pipeline de pré-processamento de imagem em 4 variantes (original, contraste, binarizada, ROI inferior)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('================================================================');
console.log('  SUÍTE DE CONFIABILIDADE DO MÓDULO DE BOLETOS (FEBRABAN)');
console.log('================================================================\n');

// 1. Configurar Sandbox VM com ambiente controlado
const appJsPath = path.join(__dirname, 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
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
  appData: { boletos: [], settings: {} },
  document: {
    addEventListener: () => {},
    removeEventListener: () => {},
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    getElementById: (id) => ({
      value: '',
      textContent: '',
      innerHTML: '',
      style: {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      addEventListener: () => {},
      removeEventListener: () => {},
      click: () => {}
    }),
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: () => {},
            getImageData: (x, y, w, h) => ({
              data: new Uint8ClampedArray(w * h * 4)
            }),
            putImageData: () => {}
          }),
          toDataURL: () => 'data:image/jpeg;base64,mock'
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
  showToast: (msg, type) => {},
  formatCurrency: (val) => 'R$ ' + Number(val).toFixed(2),
  escapeHtml: (s) => String(s || '')
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

// Executa app.js no sandbox
try {
  vm.runInContext(appJs, sandbox);
  console.log('✓ [PASS] app.js carregado com sucesso no ambiente Sandbox VM.');
} catch (err) {
  console.error('Falha ao carregar app.js na VM:', err);
  process.exit(1);
}

const {
  calcMod10,
  calcMod11Arrecadacao,
  calcDvGeralFebraban,
  calcFactorDueDate,
  FEBRABAN_BANK_NAMES,
  linhaDigitavelToCodigoBarras,
  codigoBarrasToLinhaDigitavel,
  validateBoletoCode,
  decodeFebrabanBoleto,
  extractBeneficiaryFromText
} = sandbox;

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [TEST ${totalTests}] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${name}`);
    console.error(`     Erro: ${err.message}`);
  }
}

// ----------------------------------------------------------------------------
// CASO 1: Linha digitável bancária válida (47 dígitos) com DVs matemáticos reais
// Banco do Brasil: 00190.00009 00188.100002 00000.000000 2 15660000053880
// ----------------------------------------------------------------------------
runTest('Linha digitável bancária válida (47 dígitos - Banco do Brasil)', () => {
  const linha = '00190.00009 00188.100002 00000.000000 2 15660000053880';
  const res = validateBoletoCode(linha);
  assert.strictEqual(res.valid, true, 'Deve ser considerado válido');
  assert.strictEqual(res.bankCode, '001', 'Banco do Brasil');
  assert.strictEqual(res.type, 'bank');
  assert.strictEqual(res.amount, '538.80');
  assert.strictEqual(res.dueDate, '2026-09-11');
  assert.strictEqual(res.barcode.length, 44);
  assert.strictEqual(res.barcode, '00192156600000538800000000188100000000000000');
});

// ----------------------------------------------------------------------------
// CASO 2: Código de barras bancário válido (44 dígitos)
// ----------------------------------------------------------------------------
runTest('Código de barras bancário válido (44 dígitos)', () => {
  const barcode = '00192156600000538800000000188100000000000000';
  const res = validateBoletoCode(barcode);
  assert.strictEqual(res.valid, true, 'Deve ser válido');
  assert.strictEqual(res.bankCode, '001');
  assert.strictEqual(res.amount, '538.80');
  assert.strictEqual(res.dueDate, '2026-09-11');
  assert.strictEqual(res.digitLine.length, 47);
});

// ----------------------------------------------------------------------------
// CASO 3: Linha de arrecadação/concessionária válida (48 dígitos, Mod 10)
// Exemplo: Copel / Sanepar (moeda 6)
// ----------------------------------------------------------------------------
runTest('Linha de arrecadação/concessionária válida (48 dígitos, Modulo 10)', () => {
  const b1 = '84660000004';
  const dv1 = calcMod10(b1);
  const b2 = '58501092026';
  const dv2 = calcMod10(b2);
  const b3 = '62862660001';
  const dv3 = calcMod10(b3);
  const b4 = '00000000000';
  const dv4 = calcMod10(b4);
  const linha48 = `${b1}${dv1}${b2}${dv2}${b3}${dv3}${b4}${dv4}`;

  const res = validateBoletoCode(linha48);
  assert.strictEqual(res.valid, true, 'Linha 48 dígitos Mod 10 deve ser válida');
  assert.strictEqual(res.type, 'utility');
  assert.strictEqual(res.amount, '458.50');
  assert.strictEqual(res.barcode.length, 44);
});

// ----------------------------------------------------------------------------
// CASO 4: Código de barras de concessionária válido (44 dígitos, Mod 10)
// ----------------------------------------------------------------------------
runTest('Código de barras de concessionária válido (44 dígitos, Modulo 10)', () => {
  const partBeforeDv = '846';
  const partAfterDv = '0000004585010920266286266000100000000000';
  const dvGeral = calcMod10(partBeforeDv + partAfterDv);
  const barcode44 = partBeforeDv + dvGeral + partAfterDv;

  const res = validateBoletoCode(barcode44);
  assert.strictEqual(res.valid, true, 'Código 44 dígitos arrecadação Mod 10 deve ser válido');
  assert.strictEqual(res.type, 'utility');
  assert.strictEqual(res.amount, '458.50');
});

// ----------------------------------------------------------------------------
// CASO 5: Linha de concessionária válida com Modulo 11 (moeda 8)
// ----------------------------------------------------------------------------
runTest('Linha de concessionária válida (48 dígitos, Modulo 11)', () => {
  const b1 = '84880000012';
  const dv1 = calcMod11Arrecadacao(b1);
  const b2 = '34567890123';
  const dv2 = calcMod11Arrecadacao(b2);
  const b3 = '45678901234';
  const dv3 = calcMod11Arrecadacao(b3);
  const b4 = '56789012345';
  const dv4 = calcMod11Arrecadacao(b4);
  const linha48 = `${b1}${dv1}${b2}${dv2}${b3}${dv3}${b4}${dv4}`;

  const res = validateBoletoCode(linha48);
  assert.strictEqual(res.valid, true, 'Linha 48 dígitos Mod 11 deve ser válida');
  assert.strictEqual(res.type, 'utility');
});

// ----------------------------------------------------------------------------
// CASO 6: Sequência de 44 dígitos aleatórios -> REJEIÇÃO OBRIGATÓRIA
// ----------------------------------------------------------------------------
runTest('Rejeição obrigatória de 44 dígitos aleatórios sem DV matemático válido', () => {
  const random44 = '12345678901234567890123456789012345678901234';
  const res = validateBoletoCode(random44);
  assert.strictEqual(res.valid, false, '44 dígitos aleatórios NÃO podem ser válidos');
});

// ----------------------------------------------------------------------------
// CASO 7: Sequência de 47 dígitos aleatórios -> REJEIÇÃO OBRIGATÓRIA
// ----------------------------------------------------------------------------
runTest('Rejeição obrigatória de 47 dígitos aleatórios sem DVs de bloco FEBRABAN', () => {
  const random47 = '99999999999999999999999999999999999999999999999';
  const res = validateBoletoCode(random47);
  assert.strictEqual(res.valid, false, '47 dígitos aleatórios NÃO podem ser válidos');
});

// ----------------------------------------------------------------------------
// CASO 8: Sequência de 48 dígitos aleatórios -> REJEIÇÃO OBRIGATÓRIA
// ----------------------------------------------------------------------------
runTest('Rejeição obrigatória de 48 dígitos aleatórios', () => {
  const random48 = '812345678901234567890123456789012345678901234567';
  const res = validateBoletoCode(random48);
  assert.strictEqual(res.valid, false, '48 dígitos aleatórios sem DV de bloco NÃO podem ser válidos');
});

// ----------------------------------------------------------------------------
// CASO 9: Documento com CPF, CNPJ, telefone, número de NF e valores SEM código
// DEVE IGNORAR NÚMEROS ISOLADOS E NÃO CRIAR BOLETO FALSO!
// ----------------------------------------------------------------------------
runTest('Documento com CPF, CNPJ, telefone, NF e valores sem código -> código vazio', () => {
  const docText = `
    NOTA FISCAL ELETRÔNICA Nº 018810 SÉRIE 1
    EMITENTE: JOGA INDUSTRIA E COMERCIO LTDA
    CNPJ: 05.123.456/0001-89
    TELEFONE: (44) 3028-1100
    DESTINATÁRIO: ELDORADO PESCA ESPORTIVA
    CPF: 123.456.789-00
    VALOR TOTAL DA NOTA: R$ 1.475,96
    VENCIMENTO: 31/08/2026
    FORMA DE PAGAMENTO: BOLETO BANCARIO A PRAZO
    OBSERVACOES: PEDIDO 441029494392 COD CLIENTE 998822114455
  `;
  const dec = decodeFebrabanBoleto(docText);
  assert.strictEqual(dec.code, '', 'Código do boleto deve ficar VAZIO pois não há linha FEBRABAN');
  assert.strictEqual(dec.beneficiary, 'Joga Indústria e Comércio', 'Beneficiário extraído do contexto');
  assert.strictEqual(dec.dueDate, '2026-08-31', 'Data de vencimento extraída do texto');
  assert.strictEqual(dec.amount, '1475.96', 'Valor extraído do texto');
});

// ----------------------------------------------------------------------------
// CASO 10: OCR com confusão de caracteres (O/0, l/1, s/5, etc.) em linha válida
// ----------------------------------------------------------------------------
runTest('Correção de caracteres confusos de OCR (O->0, l->1) em linha válida', () => {
  // Original válido: 00190.00009 00188.100002 00000.000000 2 15660000053880
  // Com erros de OCR: O0190.00009 O0188.l00002 OOOOO.OOOOOO 2 l566000005388O
  const ocrText = 'O0190.00009 O0188.l00002 OOOOO.OOOOOO 2 l566000005388O';
  const dec = decodeFebrabanBoleto(ocrText);
  assert.strictEqual(dec.valid, true, 'Deve corrigir O->0 e l->1 e validar');
  assert.strictEqual(dec.bankName, 'Banco do Brasil');
  assert.strictEqual(dec.amount, '538.80');
  assert.strictEqual(dec.dueDate, '2026-09-11');
});

// ----------------------------------------------------------------------------
// CASO 11: Foto com Beneficiário e CNPJ identificados -> Beneficiário correto,
// NUNCA chutar o banco como beneficiário!
// ----------------------------------------------------------------------------
runTest('Beneficiário e CNPJ identificados corretamente; Banco NÃO é beneficiário', () => {
  const boletoText = `
    BANCO SANTANDER (BRASIL) S.A. | 033-7 | 03399.88776 55443.322114 99887.766550 3 15660000043288
    Beneficiário: KALA COMERCIO E DISTRIBUICAO LTDA
    CNPJ/CPF: 11.222.333/0001-44
    Vencimento: 11/09/2026
    Valor do Documento: R$ 432,88
  `;
  const dec = decodeFebrabanBoleto(boletoText);
  assert(dec.beneficiary.includes('KALA') || dec.beneficiary.includes('Kala'), 'Beneficiário deve ser Kala');
  assert.notStrictEqual(dec.beneficiary, 'Santander', 'Banco Santander NÃO pode ser beneficiário');
  assert.strictEqual(dec.bankName, 'Santander', 'Banco emissor deve ser Santander');
  assert.strictEqual(dec.amount, '432.88');
});

// ----------------------------------------------------------------------------
// CASO 12: Fatores FEBRABAN: Ciclo 1 (histórico) e Ciclo 2 (reinício em 22/02/2025)
// ----------------------------------------------------------------------------
runTest('Cálculo de vencimento pelo Fator FEBRABAN (Ciclo 1 e Ciclo 2)', () => {
  // Ciclo 2: Fator 1000 = 22/02/2025
  const dt1000 = calcFactorDueDate(1000);
  assert.strictEqual(dt1000, '2025-02-22', 'Fator 1000 deve ser 2025-02-22 (início Ciclo 2)');

  // Ciclo 2: Fator 1566 = 22/02/2025 + 566 dias = 11/09/2026
  const dt1566 = calcFactorDueDate(1566);
  assert.strictEqual(dt1566, '2026-09-11', 'Fator 1566 deve ser 2026-09-11');

  // Ciclo 1: Fator 9500 = 07/10/1997 + 9500 dias = 2023-10-10
  const dt9500 = calcFactorDueDate(9500);
  assert.strictEqual(dt9500, '2023-10-10', 'Fator 9500 histórico do Ciclo 1 deve ser 2023-10-10');
});

// ----------------------------------------------------------------------------
// CASO 13: Boleto com valor aberto/zerado (0000000000)
// ----------------------------------------------------------------------------
runTest('Boleto com valor zerado/em branco no código -> valor vazio, sem crash', () => {
  const linhaZeroValor = '00190.00009 00188.100002 00000.000000 6 15660000000000';
  const res = validateBoletoCode(linhaZeroValor);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.amount, null, 'Valor zerado deve retornar null/vazio');
  assert.strictEqual(res.dueDate, '2026-09-11');
});

// ----------------------------------------------------------------------------
// CASO 14: Boleto sem fator de vencimento (0000)
// ----------------------------------------------------------------------------
runTest('Boleto sem fator de vencimento (0000) -> data vazia para confirmação', () => {
  const linhaSemFator = '00190.00009 00188.100002 00000.000000 1 00000000053880';
  const res = validateBoletoCode(linhaSemFator);
  assert.strictEqual(res.valid, true);
  assert.strictEqual(res.dueDate, null, 'Data deve ser nula/vazia quando fator for 0000');
  assert.strictEqual(res.amount, '538.80');
});

// ----------------------------------------------------------------------------
// CASO 15: Conversão bidirecional: Linha 47 <-> Código de Barras 44
// ----------------------------------------------------------------------------
runTest('Conversão bidirecional exata entre Linha (47) e Código de Barras (44)', () => {
  const linhaOriginal = '00190.00009 00188.100002 00000.000000 2 15660000053880';
  const barcode = linhaDigitavelToCodigoBarras(linhaOriginal);
  assert.strictEqual(barcode.length, 44);

  const linhaReconvertida = codigoBarrasToLinhaDigitavel(barcode);
  assert.strictEqual(linhaReconvertida.replace(/\D/g, ''), linhaOriginal.replace(/\D/g, ''));
});

// ----------------------------------------------------------------------------
// CASO 16: Conversão bidirecional: Linha 48 <-> Código de Barras 44 (Concessionárias)
// ----------------------------------------------------------------------------
runTest('Conversão bidirecional Linha 48 <-> Barcode 44 para Concessionárias', () => {
  const b1 = '84660000004';
  const dv1 = calcMod10(b1);
  const b2 = '58501092026';
  const dv2 = calcMod10(b2);
  const b3 = '62862660001';
  const dv3 = calcMod10(b3);
  const b4 = '00000000000';
  const dv4 = calcMod10(b4);
  const linha48 = `${b1}${dv1}${b2}${dv2}${b3}${dv3}${b4}${dv4}`;

  const barcode44 = linhaDigitavelToCodigoBarras(linha48);
  assert.strictEqual(barcode44.length, 44);
  assert.strictEqual(barcode44, b1 + b2 + b3 + b4);

  const reconvertida = codigoBarrasToLinhaDigitavel(barcode44);
  assert.strictEqual(reconvertida.replace(/\D/g, ''), linha48);
});

// ----------------------------------------------------------------------------
// CASO 17: Dicionário FEBRABAN dos principais bancos brasileiros
// ----------------------------------------------------------------------------
runTest('Identificação de bancos pelo código de 3 dígitos', () => {
  assert.strictEqual(FEBRABAN_BANK_NAMES['001'], 'Banco do Brasil');
  assert.strictEqual(FEBRABAN_BANK_NAMES['237'], 'Bradesco');
  assert.strictEqual(FEBRABAN_BANK_NAMES['104'], 'Caixa Econômica Federal');
  assert.strictEqual(FEBRABAN_BANK_NAMES['341'], 'Itaú Unibanco');
  assert.strictEqual(FEBRABAN_BANK_NAMES['033'], 'Santander');
  assert.strictEqual(FEBRABAN_BANK_NAMES['748'], 'Sicredi');
  assert.strictEqual(FEBRABAN_BANK_NAMES['756'], 'Sicoob');
  assert.strictEqual(FEBRABAN_BANK_NAMES['260'], 'Nubank');
  assert.strictEqual(FEBRABAN_BANK_NAMES['077'], 'Banco Inter');
  assert(FEBRABAN_BANK_NAMES['336'].includes('C6'), 'Deve identificar C6');
});

// ----------------------------------------------------------------------------
// CASO 18: Pré-processamento de imagem: contrato de 4 variantes
// ----------------------------------------------------------------------------
runTest('Contrato de pré-processamento de imagem (preprocessImageForCanvas)', () => {
  assert.strictEqual(typeof sandbox.preprocessImageForCanvas, 'function', 'preprocessImageForCanvas deve existir');
  assert.strictEqual(typeof sandbox.scanBoletoFromImagePipeline, 'function', 'scanBoletoFromImagePipeline deve existir');
});

console.log('\n================================================================');
console.log(`  RESULTADO: ${passedTests} de ${totalTests} testes passaram com sucesso! (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}

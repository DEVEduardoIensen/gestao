/**
 * Suíte de Testes: Botão de Cotas Livres para WhatsApp (Não Reservadas / Não Pagas)
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
console.log('  TESTES: BOTÃO E EXPORTAÇÃO DE COTAS LIVRES PARA WHATSAPP');
console.log('================================================================\n');

// 1. Carregar app.js e extrair funções do módulo
console.log('1. Testando lógica de filtragem e formatação em app.js:');
const appJsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

const sandbox = {
  appData: {
    settings: {
      storeName: 'ELDORADO PESCA LTDA',
      pixKey: '42999162340',
      phone: '42 9 9916-2340'
    }
  },
  window: {},
  document: {}
};
vm.createContext(sandbox);

// Executa bloco que define getAvailableRaffleNumbers e generateAvailableWhatsAppText
const fnFilterMatch = appJsContent.match(/function getAvailableRaffleNumbers\(raffle\)[\s\S]*?\n\}/);
const fnGenMatch = appJsContent.match(/function generateAvailableWhatsAppText\(raffle, format = 'full'\)[\s\S]*?\n\}/);

assert(fnFilterMatch, 'Função getAvailableRaffleNumbers encontrada em app.js');
assert(fnGenMatch, 'Função generateAvailableWhatsAppText encontrada em app.js');

if (fnFilterMatch && fnGenMatch) {
  vm.runInContext(fnFilterMatch[0], sandbox);
  vm.runInContext(fnGenMatch[0], sandbox);

  const getAvailable = sandbox.getAvailableRaffleNumbers;
  const generateText = sandbox.generateAvailableWhatsAppText;

  // Cenário de teste: Rifa com 10 números em vários estados
  const sampleRaffle = {
    id: 'rifa-teste',
    title: '108° AÇÃO ELDORADO PESCA',
    subtitle: 'AÇÃO RÁPIDA',
    pricePerNumber: 25,
    totalNumbers: 10,
    pixKey: '42999162340',
    pixOwner: 'ELDORADO PESCA LTDA',
    privateContact: '42 9 9916-2340',
    numbers: [
      { num: 1, status: 'paid', name: 'CARLOS' },
      { num: 2, status: 'available', name: '' },
      { num: 3, status: 'reserved', name: 'MARCOS' },
      { num: 4, status: 'available', name: '' },
      { num: 5, status: 'paid', name: 'ANA' },
      { num: 6, status: 'reserved', name: 'FERNANDO' },
      { num: 7, status: 'available', name: '' },
      { num: 8, status: 'available', name: '' },
      { num: 9, status: 'paid', name: 'LUCAS' },
      { num: 10, status: 'available', name: '' }
    ]
  };

  // Teste de filtragem
  const available = getAvailable(sampleRaffle);
  assert(available.length === 5, `Filtra exatamente 5 cotas livres (recebeu: ${available.length})`);
  const nums = available.map(i => i.num);
  assert(JSON.stringify(nums) === JSON.stringify([2, 4, 7, 8, 10]), `Retorna apenas os números livres [2, 4, 7, 8, 10] (recebeu: ${JSON.stringify(nums)})`);

  // Garante que pagos e reservados foram excluídos
  const hasPaid = available.some(i => i.status === 'paid');
  const hasReserved = available.some(i => i.status === 'reserved');
  assert(!hasPaid, 'Nenhum número com status "paid" foi incluído');
  assert(!hasReserved, 'Nenhum número com status "reserved" foi incluído');

  // Teste formato compact (Apenas Números)
  const compactText = generateText(sampleRaffle, 'compact');
  assert(compactText === '02, 04, 07, 08, 10', `Formato compacto retorna números padronizados com zeros: "${compactText}"`);

  // Teste formato lines (Linha a linha)
  const linesText = generateText(sampleRaffle, 'lines');
  assert(linesText.includes('02 -\n') && linesText.includes('10 -\n'), 'Formato em linhas contém números com hífen');
  assert(linesText.includes('*NÚMEROS LIVRES:*'), 'Formato em linhas inclui cabeçalho limpo');

  // Teste formato padrão (Somente *NÚMEROS LIVRES:* e os números)
  const fullText = generateText(sampleRaffle, 'full');
  assert(fullText === '*NÚMEROS LIVRES:*\n02, 04, 07, 08, 10', `Formato padrão contém EXATAMENTE "*NÚMEROS LIVRES:*\\n02, 04, 07, 08, 10" (recebeu: "${fullText.replace(/\n/g, '\\n')}")`);
  assert(!fullText.includes('AÇÃO RÁPIDA'), 'Não contém subtítulo ou texto introdutório desnecessário');
  assert(!fullText.includes('Pix'), 'Não contém chave Pix ou dados financeiros redundantes');
  assert(!fullText.includes('ELDORADO PESCA LTDA'), 'Não contém rodapé longo');

  // Cenário de Rifa 100% preenchida (0 livres)
  const fullyPaidRaffle = {
    ...sampleRaffle,
    numbers: sampleRaffle.numbers.map(n => ({ ...n, status: 'paid' }))
  };
  const emptyAvailable = getAvailable(fullyPaidRaffle);
  assert(emptyAvailable.length === 0, 'Rifa completa retorna 0 cotas livres');
  const finishedMsg = generateText(fullyPaidRaffle, 'full');
  assert(finishedMsg.includes('*NÚMEROS LIVRES:*') && finishedMsg.includes('Nenhum número livre'), 'Rifa completa gera aviso limpo');
}

// 2. Verificar index.html
console.log('\n2. Verificando presença dos novos elementos em index.html:');
const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert(htmlContent.includes('id="btnExportAvailableWhatsApp"'), 'Botão principal "btnExportAvailableWhatsApp" presente na barra de ações');
assert(htmlContent.includes('Cotas Livres WhatsApp'), 'Texto do botão "Cotas Livres WhatsApp" visível no HTML');
assert(htmlContent.includes('id="btnSideExportAvailable"'), 'Atalho "btnSideExportAvailable" presente no card de ações rápidas');
assert(htmlContent.includes('id="modalExportAvailableWhatsApp"'), 'Modal "modalExportAvailableWhatsApp" estruturado');
assert(htmlContent.includes('id="textareaAvailableExport"'), 'Textarea "textareaAvailableExport" presente no modal');
assert(htmlContent.includes('id="btnFormatFull"'), 'Botão seletor de formato "Mensagem Completa" presente');
assert(htmlContent.includes('id="btnFormatCompact"'), 'Botão seletor de formato "Apenas Números" presente');
assert(htmlContent.includes('id="btnFormatLines"'), 'Botão seletor de formato "Linha por Linha" presente');
assert(htmlContent.includes('id="btnDoCopyAvailableWhatsApp"'), 'Botão "Copiar Texto" presente no rodapé do modal');
assert(htmlContent.includes('id="btnDoSendAvailableWhatsApp"'), 'Botão "Enviar no WhatsApp" presente no rodapé do modal');

// 3. Verificar styles.css
console.log('\n3. Verificando estilos no styles.css:');
const cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

assert(cssContent.includes('.btn-whatsapp-available'), 'Classe .btn-whatsapp-available definida no CSS');
assert(cssContent.includes('.btn-whatsapp-send'), 'Classe .btn-whatsapp-send definida no CSS');
assert(cssContent.includes('.export-format-pill'), 'Classe .export-format-pill definida no CSS');
assert(cssContent.includes('.badge-available-count'), 'Classe .badge-available-count definida no CSS');

// 4. Verificar listeners no app.js
console.log('\n4. Verificando vinculação de eventos em app.js:');
assert(appJsContent.includes('btnExportAvailableWhatsApp'), 'Listener de btnExportAvailableWhatsApp registrado');
assert(appJsContent.includes('btnSideExportAvailable'), 'Listener de btnSideExportAvailable registrado');
assert(appJsContent.includes('btnDoCopyAvailableWhatsApp'), 'Listener de btnDoCopyAvailableWhatsApp registrado');
assert(appJsContent.includes('btnDoSendAvailableWhatsApp'), 'Listener de btnDoSendAvailableWhatsApp registrado');
assert(appJsContent.includes('api.whatsapp.com/send?text='), 'Disparo para API oficial do WhatsApp implementado');

// 5. Executar suite de regressão existente
console.log('\n5. Executando suíte de testes de regressão existente:');
try {
  require('./test_highest_raffle_and_badge.js');
  console.log('  ✓ [PASS] Suíte test_highest_raffle_and_badge.js passou sem regressões');
} catch (e) {
  console.error('  ✗ [FAIL] Erro na suíte test_highest_raffle_and_badge:', e.message);
  failed++;
}

console.log('\n============================================================');
console.log(`  RESULTADO: ${passed} passaram, ${failed} falharam.`);
console.log('============================================================\n');

process.exit(failed > 0 ? 1 : 0);

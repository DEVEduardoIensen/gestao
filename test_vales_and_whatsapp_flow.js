/**
 * Eldorado Pesca - Suíte de Testes:
 * Validação do Fluxo de Escolha de Prêmios (Aguardando Retirada vs Entregue)
 * e Mensagens de WhatsApp para Pendências.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0;
let failed = 0;

function check(title, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${title}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    failed++;
  }
}

console.log('============================================================');
console.log('  TESTES: FLUXO VALES & PRÊMIOS + WHATSAPP DE PENDÊNCIAS');
console.log('============================================================\n');

const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const dexieJs = fs.readFileSync(path.join(__dirname, 'db_dexie.js'), 'utf8');
const swJs = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// 1. Verificações de Arquitetura e Desempenho
console.log('1. Desempenho e Não-Bloqueio no db_dexie.js e sw.js:');
check('db_dexie.js não possui mais Promise.race com timeout de 2500ms bloqueante', () => {
  assert(!dexieJs.includes('SW ready timeout'));
});

check('db_dexie.js executa registro de sync via Promise.resolve assíncrono (fire-and-forget)', () => {
  assert(dexieJs.includes('Promise.resolve().then(async () => {'));
  assert(dexieJs.includes("reg.sync.register('eldorado-outbox-sync')"));
  assert(dexieJs.includes('reg.periodicSync.register'));
});

check('sw.js delega para cliente em primeiro plano se houver janela ativa (evita conflito duplo)', () => {
  assert(swJs.includes("self.clients.matchAll({ type: 'window' })"));
  assert(swJs.includes('Janela ativa detectada'));
});

// 2. Verificações dos Botões de Ação na Aba Vales e Prêmios
console.log('\n2. Fluxo da Aba Vales e Prêmios em app.js:');
check('Botão de escolha de prêmio físico chama premio_fisico (e NÃO premio_entregue)', () => {
  assert(appJs.includes("choosePrizeOption('${item.id}', 'premio_fisico')"));
  assert(!appJs.includes("choosePrizeOption('${item.id}', 'premio_entregue')"));
});

check('Card de A Decidir inclui botão de WhatsApp para contato com o ganhador', () => {
  assert(appJs.includes("generatePrizeWhatsAppMessage('${item.id}', 'choice')"));
});

check('Card de Aguardando Retirada inclui botão de WhatsApp para avisar que está pronto', () => {
  assert(appJs.includes("generatePrizeWhatsAppMessage('${item.id}', 'pickup')"));
});

check('Card de Escolhendo o Dia inclui botão de WhatsApp para agendar pescaria', () => {
  assert(appJs.includes("generatePrizeWhatsAppMessage('${item.id}', 'schedule')"));
});

check('Card de Vale Compras possui WhatsApp com extrato de haver', () => {
  assert(appJs.includes("generateValeWhatsAppReceipt('${item.id}')"));
});

// 3. Verificações da Lógica de choosePrizeOption e Mensagens WhatsApp
console.log('\n3. Comportamento Funcional e Gerador de Mensagens:');
check('generatePrizeWhatsAppMessage está implementada em app.js', () => {
  assert(appJs.includes('function generatePrizeWhatsAppMessage(itemId, msgType)'));
});

check('generatePrizeWhatsAppMessage contempla os 3 tipos: choice, pickup, schedule', () => {
  assert(appJs.includes('msgType === "choice"'));
  assert(appJs.includes('msgType === "pickup"'));
  assert(appJs.includes('msgType === "schedule"'));
});

check('generatePrizeWhatsAppMessage inclui dados da loja e WhatsApp oficial (42 9 9916-2340)', () => {
  assert(appJs.includes('42 9 9916-2340'));
  assert(appJs.includes('Eldorado Pesca'));
});

check('generatePrizeWhatsAppMessage faz fallback para clipboard caso não tenha telefone', () => {
  assert(appJs.includes('showToast("Texto da mensagem copiado para a área de transferência!"'));
  assert(appJs.includes('window.open(url, "_blank")'));
});

// 4. Modal de Edição de Vales e Prêmios
console.log('\n4. Modal de Edição em index.html:');
check('index.html contém opção explícita de A Decidir (Prêmio Físico, Diária ou Vale)', () => {
  assert(indexHtml.includes('A Decidir (Prêmio Físico, Diária ou Vale)'));
});

console.log('\n============================================================');
console.log(`  RESULTADO: ${passed} passaram, ${failed} falharam.`);
console.log('============================================================');

if (failed > 0) process.exit(1);

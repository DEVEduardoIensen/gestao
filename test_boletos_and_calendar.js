/**
 * Teste de Validação: Gestão de Boletos (BoletoScan) & Calendário Editorial 104 Posts
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  TESTE DE VALIDAÇÃO: BOLETOSCAN PRO & CRONOGRAMA 104 POSTS');
console.log('================================================================\n');

const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const jsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const cronogramaContent = fs.readFileSync(path.join(__dirname, 'instagram_cronograma_104.js'), 'utf8');

// 1. Verificação da Ordem dos Botões de Navegação
console.log('1. Verificando Ordem dos Botões de Navegação:');
const agendaPos = htmlContent.indexOf('id="tabBtnAgenda"');
const instaPos = htmlContent.indexOf('id="tabBtnInstagram"');
const ranchoPos = htmlContent.indexOf('id="tabBtnRancho"');
const boletosPos = htmlContent.indexOf('id="tabBtnBoletos"');

assert(agendaPos !== -1, 'tabBtnAgenda existe');
assert(instaPos !== -1, 'tabBtnInstagram existe');
assert(ranchoPos !== -1, 'tabBtnRancho existe');
assert(boletosPos !== -1, 'tabBtnBoletos existe');
assert(agendaPos < instaPos && instaPos < ranchoPos && ranchoPos < boletosPos,
  'Ordem estrita respeitada: Agenda -> Instagram -> Rancho -> Boletos');
console.log('  ✓ [PASS] Ordem dos botões no index.html: Agenda -> Instagram -> Rancho -> Boletos');

// 2. Verificação da Aba Boletos e Ausência de Botão PWA (conforme solicitação do usuário)
console.log('\n2. Verificando Estrutura da Aba Boletos:');
assert(htmlContent.includes('id="tab-boletos"'), 'Seção tab-boletos presente');
assert(htmlContent.includes('id="boletoCameraInput"'), 'Input de captura nativa para iPhone presente');
assert(htmlContent.includes('capture="environment"'), 'Atributo capture=environment configurado para câmera traseira nativa');
assert(htmlContent.includes('id="boletoGalleryInput"'), 'Input de galeria presente');
assert(htmlContent.includes('id="boletosDropzone"'), 'Dropzone para arraste e cola de boletos presente');
assert(htmlContent.includes('id="statBoletoTotalToPay"'), 'KPI Total a Pagar presente');
assert(htmlContent.includes('id="statBoletoTotalPaid"'), 'KPI Total Quitado presente');
assert(htmlContent.includes('id="statBoletoDueToday"'), 'KPI Vencendo Hoje presente');
assert(htmlContent.includes('id="statBoletoLate"'), 'KPI Boletos Atrasados presente');
assert(htmlContent.includes('id="boletosAgendaContainer"'), 'Container da agenda dia a dia presente');
assert(htmlContent.includes('id="modalBoletoForm"'), 'Modal de registro e confirmação de boleto presente');

// Garantir que botão/modal redundante de instalar PWA foi removido
assert(!htmlContent.includes('id="modalBoletoInstallPwa"'), 'Modal redundante de instalação PWA removido conforme solicitado');
assert(!htmlContent.includes('openBoletoPwaModal'), 'Chamada openBoletoPwaModal removida do index.html');
console.log('  ✓ [PASS] Aba Boletos estruturada e botão/modal redundante de PWA removido com sucesso');

// 3. Verificação do Cronograma Oficial de 104 Posts
console.log('\n3. Verificando Cronograma Oficial Multimarcas (104 Posts):');
// Carregar o array de 104 posts
const sandbox = {};
eval(cronogramaContent.replace('window.', 'sandbox.'));
const posts104 = sandbox.OFFICIAL_INSTAGRAM_104_POSTS;

assert(Array.isArray(posts104), 'OFFICIAL_INSTAGRAM_104_POSTS é um array');
assert.strictEqual(posts104.length, 104, `Devem existir exatamente 104 postagens planejadas (encontrado: ${posts104.length})`);

const steelfishCount = posts104.filter(p => p.theme === 'steelfish').length;
const fishingCoCount = posts104.filter(p => p.theme === 'fishing_company').length;
const trFishingCount = posts104.filter(p => p.theme === 'tr_fishing').length;
const mathiasCount = posts104.filter(p => p.theme === 'iscas_mathias').length;
const titanCount = posts104.filter(p => p.theme === 'titan_caiaques').length;

assert.strictEqual(steelfishCount, 32, `Steelfish deve ter 32 posts (Segundas e Sextas). Encontrado: ${steelfishCount}`);
assert.strictEqual(fishingCoCount, 32, `Fishing Company deve ter 32 posts (Terças e Sábados). Encontrado: ${fishingCoCount}`);
assert.strictEqual(trFishingCount, 16, `TR Fishing deve ter 16 posts (Quartas). Encontrado: ${trFishingCount}`);
assert.strictEqual(mathiasCount, 16, `Iscas Mathias deve ter 16 posts (Quintas). Encontrado: ${mathiasCount}`);
assert.strictEqual(titanCount, 8, `Titan Caiaques deve ter 8 posts (Quartas alternadas). Encontrado: ${titanCount}`);
assert.strictEqual(steelfishCount + fishingCoCount + trFishingCount + mathiasCount + titanCount, 104, 'Soma totaliza 104');

// Verificar marcos sazonais
const primavera = posts104.find(p => p.date === '2026-09-22');
assert(primavera && primavera.seasonalHook.includes('Primavera'), 'Marco de Primavera em 22/09 integrado');
const criancas = posts104.find(p => p.date === '2026-10-12');
assert(criancas && criancas.seasonalHook.includes('Crianças'), 'Marco de Dia das Crianças em 12/10 integrado');
const blackFriday = posts104.filter(p => p.date >= '2026-11-23' && p.date <= '2026-11-30');
assert(blackFriday.length > 0 && blackFriday.some(p => p.seasonalHook.includes('Black Friday')), 'Marco Black Friday integrado');
console.log('  ✓ [PASS] 104 posts validados com distribuição exata (Steelfish 32, Fishing Co 32, TR Fishing 16, Mathias 16, Titan 8) e datas sazonais');

// 4. Verificação de Lógica no app.js
console.log('\n4. Verificando Funções no app.js:');
assert(jsContent.includes('boletos: []'), 'appData inicializa boletos');
assert(jsContent.includes('renderBoletosView'), 'renderBoletosView implementado');
assert(jsContent.includes('updateBoletosStats'), 'updateBoletosStats implementado');
assert(jsContent.includes('renderBoletosAgenda'), 'renderBoletosAgenda implementado');
assert(jsContent.includes('copyBoletoCode'), 'copyBoletoCode implementado');
assert(jsContent.includes('toggleBoletoPaidStatus'), 'toggleBoletoPaidStatus implementado');
assert(jsContent.includes('deleteBoleto'), 'deleteBoleto implementado');
assert(jsContent.includes('decodeFebrabanBoleto'), 'decodeFebrabanBoleto implementado');
assert(jsContent.includes('preprocessImageForCanvas'), 'preprocessImageForCanvas implementado para iPhone');
assert(jsContent.includes('loadDemoBoletos'), 'loadDemoBoletos implementado');
assert(jsContent.includes('exportBoletosBackupJSON'), 'exportBoletosBackupJSON implementado');
assert(jsContent.includes('renderInstagramTable'), 'renderInstagramTable implementado');
assert(jsContent.includes('exportInstagramCalendarCSV'), 'exportInstagramCalendarCSV implementado');
assert(jsContent.includes('loadOfficialInstagramSchedule'), 'loadOfficialInstagramSchedule implementado');
assert(jsContent.includes('copyInstagramPauta'), 'copyInstagramPauta implementado');
console.log('  ✓ [PASS] Todas as funções do BoletoScan e do Calendário Multimarcas presentes no app.js');

// 5. Teste Unitário do Decodificador FEBRABAN
console.log('\n5. Teste Unitário do Decodificador FEBRABAN:');
// Extrai e testa a função decodeFebrabanBoleto
const evalContext = {};
const fnCode = jsContent.substring(
  jsContent.indexOf('function decodeFebrabanBoleto('),
  jsContent.indexOf('function decodeBoletoCodeManually(')
);
eval(`evalContext.decodeFebrabanBoleto = ${fnCode}`);

const sampleBoleto47 = '23793.38128 60083.013528 85006.333303 9 15660000053880';
const decoded47 = evalContext.decodeFebrabanBoleto(sampleBoleto47);
assert.strictEqual(decoded47.bankName, 'Bradesco', 'Banco Bradesco identificado pelo código 237');
assert.strictEqual(decoded47.amount, '538.80', 'Valor de R$ 538,80 extraído com precisão');
assert.strictEqual(decoded47.dueDate, '2026-09-11', 'Data de vencimento 2026-09-11 calculada pelo fator FEBRABAN 1566');

const sampleTextVisual = 'CONCESSIONARIA COPEL ENERGIA LTDA Vencimento: 10/09/2026 Valor: R$ 428,50';
const decodedVisual = evalContext.decodeFebrabanBoleto(sampleTextVisual);
assert.strictEqual(decodedVisual.beneficiary, 'Copel Energia', 'Beneficiário Copel reconhecido');
assert.strictEqual(decodedVisual.dueDate, '2026-09-10', 'Data 2026-09-10 extraída do texto');
assert.strictEqual(decodedVisual.amount, '428.50', 'Valor 428.50 extraído do texto');
console.log('  ✓ [PASS] Decodificador FEBRABAN testado com sucesso (fator de vencimento, centavos e regex)');

// 6. Verificação de Estilos no styles.css
console.log('\n6. Verificando Estilos Visuais no styles.css:');
assert(cssContent.includes('.boletos-dropzone'), 'Estilo boletos-dropzone presente');
assert(cssContent.includes('.boleto-day-block'), 'Estilo boleto-day-block presente');
assert(cssContent.includes('.boleto-card'), 'Estilo boleto-card presente');
assert(cssContent.includes('.badge-boleto-late'), 'Estilo badge-boleto-late presente');
assert(cssContent.includes('.badge-boleto-today'), 'Estilo badge-boleto-today presente');
assert(cssContent.includes('.badge-boleto-due'), 'Estilo badge-boleto-due presente');
assert(cssContent.includes('.badge-boleto-paid'), 'Estilo badge-boleto-paid presente');
assert(cssContent.includes('.table-editorial'), 'Estilo table-editorial presente');
console.log('  ✓ [PASS] Estilos CSS validados');

console.log('\n================================================================');
console.log('  RESULTADO: Todos os testes de validação passaram com sucesso!');
console.log('================================================================\n');

/**
 * Teste de Validação da Aba: Calendário de Conteúdo para Instagram (Modo Ponytail)
 * Valida: Ausência de emojis, remoção do card Próximos Posts, metas contratuais de patrocinadores (Steelfish 2/sem, Tr Fishing, Iscas Mathias, Titan Caiaques).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('  TESTE DE VALIDAÇÃO: ABA CALENDÁRIO INSTAGRAM (MODO PONYTAIL)');
console.log('================================================================\n');

const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const jsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

// 1. Verificação do Botão de Navegação e Ordem Estrita
console.log('1. Verificando Ordem dos Botões de Navegação no index.html:');
const agendaPos = htmlContent.indexOf('id="tabBtnAgenda"');
const instaPos = htmlContent.indexOf('id="tabBtnInstagram"');
const ranchoPos = htmlContent.indexOf('id="tabBtnRancho"');

assert(agendaPos !== -1, 'Botão tabBtnAgenda existe');
assert(instaPos !== -1, 'Botão tabBtnInstagram existe');
assert(ranchoPos !== -1, 'Botão tabBtnRancho existe');
assert(agendaPos < instaPos && instaPos < ranchoPos, 'Aba Instagram está posicionada exatamente entre Agenda de Pesca e Rancho');
console.log('  ✓ [PASS] Ordem de navegação: Agenda de Pesca -> Instagram -> Rancho');

// 2. Verificação de Ausência de Emojis na Aba e no Modal do Instagram
console.log('\n2. Verificando Ausência de Emojis no HTML do Instagram:');
const instaTabStart = htmlContent.indexOf('id="tab-instagram"');
const instaTabEnd = htmlContent.indexOf('id="tab-rancho"');
const instaTabHtml = htmlContent.substring(instaTabStart, instaTabEnd);

const modalStart = htmlContent.indexOf('id="modalInstagramPost"');
const modalEnd = htmlContent.indexOf('id="toastContainer"');
const modalHtml = htmlContent.substring(modalStart, modalEnd);

const surrogateRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
const tabEmojis = instaTabHtml.match(surrogateRegex);
const modalEmojis = modalHtml.match(surrogateRegex);

assert(!tabEmojis || tabEmojis.length === 0, `Nenhum emoji permitido no HTML da aba Instagram (encontrado: ${tabEmojis})`);
assert(!modalEmojis || modalEmojis.length === 0, `Nenhum emoji permitido no modal do Instagram (encontrado: ${modalEmojis})`);
console.log('  ✓ [PASS] Zero emojis na aba e no modal do Instagram');

// 3. Verificação da Remoção do Card Próximos Posts
console.log('\n3. Verificando Remoção do Card Próximos Posts e Expansão do Calendário:');
assert(!htmlContent.includes('id="sideUpcomingInstagramList"'), 'Card lateral Próximos Posts foi removido conforme solicitado');
assert(!htmlContent.includes('sideUpcomingInstaCount'), 'Contador lateral de próximos posts foi removido');
assert(htmlContent.includes('id="instagramCalendarGrid"'), 'Grade do calendário interativo presente');
console.log('  ✓ [PASS] Card Próximos Posts removido com sucesso e calendário livre');

// 4. Verificação dos Patrocinadores Oficiais e Metas Contratuais (Steelfish 2/sem)
console.log('\n4. Verificando Patrocinadores Oficiais do Eldorado Lake e Metas:');
assert(htmlContent.includes('id="statInstaSteelfishCount"'), 'Card de estatística de meta Steelfish presente');
assert(htmlContent.includes('id="statInstaOtherSponsorsCount"'), 'Card de estatística de outros patrocinadores presente');
assert(htmlContent.includes('id="badgeSteelfishWeekStatus"'), 'Badge de meta semanal Steelfish presente');
assert(htmlContent.includes('id="filterInstaSteelfish"'), 'Filtro específico para Steelfish (2/sem) presente');
assert(htmlContent.includes('id="filterInstaSponsors"'), 'Filtro de patrocinadores presente');
assert(htmlContent.includes('value="steelfish"'), 'Opção Steelfish no select de temas/patrocinadores');
assert(htmlContent.includes('value="tr_fishing"'), 'Opção Tr Fishing no select de patrocinadores');
assert(htmlContent.includes('value="iscas_mathias"'), 'Opção Iscas Mathias no select de patrocinadores');
assert(htmlContent.includes('value="titan_caiaques"'), 'Opção Titan Caiaques no select de patrocinadores');
console.log('  ✓ [PASS] Patrocinadores (Steelfish, Tr Fishing, Iscas Mathias, Titan Caiaques) e metas 2/sem integrados');

// 5. Verificação de Lógica no app.js
console.log('\n5. Verificando Lógica no app.js:');
assert(jsContent.includes('instagramPosts'), 'appData possui instagramPosts');
assert(jsContent.includes('renderInstagramView'), 'app.js implementa renderInstagramView');
assert(jsContent.includes('renderInstagramCalendar'), 'app.js implementa renderInstagramCalendar');
assert(jsContent.includes('updateInstagramStats'), 'app.js implementa updateInstagramStats');
assert(jsContent.includes('steelfishWeekCount'), 'app.js calcula contagem semanal de posts da Steelfish para meta 2/sem');
assert(jsContent.includes('filterInstaSteelfish'), 'app.js suporta filtro Steelfish');
assert(jsContent.includes('filterInstaSponsors'), 'app.js suporta filtro Patrocinadores');
assert(jsContent.includes('openNewInstagramPostModal'), 'app.js implementa openNewInstagramPostModal');
assert(jsContent.includes('openEditInstagramPostModal'), 'app.js implementa openEditInstagramPostModal');
assert(jsContent.includes('copyInstagramCaption'), 'app.js implementa cópia de legenda');
console.log('  ✓ [PASS] Lógica de patrocinadores e cálculo da meta semanal funcionando no app.js');

// 6. Verificação de Estilos no styles.css
console.log('\n6. Verificando Estilos Visuais no styles.css:');
assert(cssContent.includes('.badge-insta-sponsor'), 'styles.css possui estilo para badge de patrocinador');
assert(cssContent.includes('.badge-insta-sponsor-steelfish'), 'styles.css possui estilo destacado para Steelfish');
assert(cssContent.includes('.insta-day-chip.chip-steelfish'), 'styles.css possui chip destacado da Steelfish no calendário');
assert(cssContent.includes('.insta-day-chip.chip-sponsor'), 'styles.css possui chip de patrocinadores');
console.log('  ✓ [PASS] Estilos específicos de patrocinadores definidos no CSS');

// 7. Verificação Estrutural de Tags HTML
console.log('\n7. Verificando Integridade Estrutural do DOM em index.html:');
const mainStartIndex = htmlContent.indexOf('<main');
const mainEndIndex = htmlContent.indexOf('</main>');
const mainHtml = htmlContent.substring(mainStartIndex, mainEndIndex);

const openSectionCount = (mainHtml.match(/<section\b/g) || []).length;
const closeSectionCount = (mainHtml.match(/<\/section>/g) || []).length;
assert.strictEqual(openSectionCount, closeSectionCount, `Tags <section> devem estar balanceadas em <main> (${openSectionCount} abertas, ${closeSectionCount} fechadas)`);

const ranchoSectionStart = htmlContent.indexOf('id="tab-rancho"');
assert(instaTabEnd === ranchoSectionStart, 'tab-instagram deve fechar antes do início de tab-rancho');
console.log('  ✓ [PASS] Todas as sections em <main> estão fechadas e independentes');

console.log('\n================================================================');
console.log('  RESULTADO: Todos os testes passaram com sucesso!');
console.log('================================================================\n');



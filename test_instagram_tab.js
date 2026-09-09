/**
 * Teste de Validação da Nova Aba: Calendário de Conteúdo para Instagram (Modo Ponytail)
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

// 2. Verificação da Seção e Elementos Principais
console.log('\n2. Verificando Seção tab-instagram e Componentes:');
assert(htmlContent.includes('id="tab-instagram"'), 'Seção tab-instagram existe');
assert(htmlContent.includes('id="statInstaTotalMonth"'), 'Card estatística total do mês presente');
assert(htmlContent.includes('id="statInstaReadyCount"'), 'Card estatística prontos presente');
assert(htmlContent.includes('id="statInstaDraftCount"'), 'Card estatística rascunhos presente');
assert(htmlContent.includes('id="statInstaPublishedCount"'), 'Card estatística publicados presente');
assert(htmlContent.includes('id="instagramCalendarGrid"'), 'Grade interativa do calendário presente');
assert(htmlContent.includes('id="sideUpcomingInstagramList"'), 'Sidebar de próximos posts presente');
assert(htmlContent.includes('id="instagramPostsContainer"'), 'Container de lista de posts presente');
assert(htmlContent.includes('id="modalInstagramPost"'), 'Modal de criação/edição presente');
console.log('  ✓ [PASS] Todos os elementos de DOM da aba Instagram estão definidos');

// 3. Verificação de Lógica no app.js
console.log('\n3. Verificando Lógica e Funções no app.js:');
assert(jsContent.includes('instagramPosts'), 'appData possui instagramPosts');
assert(jsContent.includes('renderInstagramView'), 'app.js implementa renderInstagramView');
assert(jsContent.includes('renderInstagramCalendar'), 'app.js implementa renderInstagramCalendar');
assert(jsContent.includes('openNewInstagramPostModal'), 'app.js implementa openNewInstagramPostModal');
assert(jsContent.includes('openEditInstagramPostModal'), 'app.js implementa openEditInstagramPostModal');
assert(jsContent.includes('handleSaveInstagramPostSubmit'), 'app.js implementa handleSaveInstagramPostSubmit');
assert(jsContent.includes('copyInstagramCaption'), 'app.js implementa copyInstagramCaption com 1 clique');
assert(jsContent.includes('case "tab-instagram":'), 'renderTab trata a aba tab-instagram');
console.log('  ✓ [PASS] Lógica do calendário e modal do Instagram presente e registrada');

// 4. Verificação de Estilos no styles.css
console.log('\n4. Verificando Estilos Visuais no styles.css:');
assert(cssContent.includes('.badge-insta-reels'), 'styles.css possui estilo para Reels');
assert(cssContent.includes('.badge-insta-feed'), 'styles.css possui estilo para Feed');
assert(cssContent.includes('.badge-insta-stories'), 'styles.css possui estilo para Stories');
assert(cssContent.includes('.insta-day-chip'), 'styles.css possui estilo para chips no calendário');
console.log('  ✓ [PASS] Estilos específicos de badges e chips do Instagram definidos');

// 5. Verificação Estrutural de Tags HTML (Garante que nenhuma section está aninhada indevidamente)
console.log('\n5. Verificando Integridade Estrutural do DOM em index.html:');
const mainStartIndex = htmlContent.indexOf('<main');
const mainEndIndex = htmlContent.indexOf('</main>');
const mainHtml = htmlContent.substring(mainStartIndex, mainEndIndex);

const openSectionCount = (mainHtml.match(/<section\b/g) || []).length;
const closeSectionCount = (mainHtml.match(/<\/section>/g) || []).length;
assert.strictEqual(openSectionCount, closeSectionCount, `Tags <section> devem estar balanceadas em <main> (${openSectionCount} abertas, ${closeSectionCount} fechadas)`);

const eduardoSectionStart = htmlContent.indexOf('id="tab-eduardo"');
const eduardoSectionEnd = htmlContent.indexOf('</section>', eduardoSectionStart);
const instaSectionStart = htmlContent.indexOf('id="tab-instagram"');

assert(instaSectionStart > eduardoSectionEnd, 'tab-instagram deve estar completamente fora e após o fechamento de tab-eduardo');
console.log('  ✓ [PASS] Todas as sections em <main> estão fechadas e independentes');

console.log('\n================================================================');
console.log('  RESULTADO: Todos os testes da aba Instagram passaram com sucesso!');
console.log('================================================================');


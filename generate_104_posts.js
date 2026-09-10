// Script gerador das 104 postagens oficiais multimarcas para Eldorado Pesca
const fs = require('fs');
const path = require('path');

function pad(n) { return String(n).padStart(2, '0'); }

const start = new Date(2026, 8, 9);
const end = new Date(2026, 11, 31);
const allDays = [];
let cur = new Date(start);
while (cur <= end) {
  allDays.push({
    dateStr: `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`,
    d: new Date(cur),
    dayOfWeek: cur.getDay(),
    month: cur.getMonth() + 1
  });
  cur.setDate(cur.getDate() + 1);
}

const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

// 1. Steelfish (32 posts) - Segundas e Sextas
const steelfishDays = allDays.filter(x => x.dayOfWeek === 1 || x.dayOfWeek === 5);

// 2. Fishing Company (32 posts) - Terças e Sábados
const fishingCoDays = allDays.filter(x => x.dayOfWeek === 2 || x.dayOfWeek === 6);

// 3. TR Fishing (16 posts) - Quartas
const wednesdays = allDays.filter(x => x.dayOfWeek === 3);
const trFishingDays = wednesdays.slice(0, 16);

// 4. Mathias (16 posts) - Quintas
const thursdays = allDays.filter(x => x.dayOfWeek === 4);
const mathiasDays = thursdays.slice(0, 16);

// 5. Titan (8 posts) - 2 Quartas alternadas por mês
const titanIndexes = [1, 3, 5, 7, 9, 11, 13, 15];
const titanDays = titanIndexes.map(idx => wednesdays[idx]);

const rawList = [];

// Helper para seasonal hook
function getSeasonalHook(dateStr) {
  if (dateStr === '2026-09-22') return 'Início da Primavera';
  if (dateStr === '2026-10-12') return 'Dia das Crianças';
  if (dateStr >= '2026-11-23' && dateStr <= '2026-11-30') return 'Black Friday & Cyber Monday';
  if (dateStr >= '2026-12-15' && dateStr <= '2026-12-25') return 'Campanha de Natal';
  if (dateStr > '2026-12-25') return 'Férias de Verão & Ano Novo';
  return '';
}

// Roteiros Steelfish (32)
const steelfishThemes = [
  { t: "Ataque na Superfície: Stick vs Zara nos Bicos de Foz do Areia", f: "reels", p: "Ação & Esportividade" },
  { t: "Trabalho Lento de Meia-Água para Dias de Vento Frio", f: "feed", p: "Técnicas de Iscas" },
  { t: "Explosão de Bocudo: Teste do Drag da Carretilha Steelfish", f: "reels", p: "Ação & Equipamento" },
  { t: "Guia de Cores: Osso, Cromada ou Transparente em Água Limpa?", f: "feed", p: "Dicas de Iscas" },
  { t: "Primavera dos Tucunarés: Acelere o Recolhimento na Superfície", f: "reels", p: "Ação & Esportividade" },
  { t: "Pausa Provocadora: O Segredo para Peixe Manhoso", f: "feed", p: "Técnicas de Iscas" },
  { t: "Carretilha Steelfish: Lançamento Preciso nas Estruturas Submersas", f: "reels", p: "Equipamento & Alta Performance" },
  { t: "Top 3 Iscas Steelfish que Não Podem Faltar no Estojo", f: "feed", p: "Catálogo & Dicas" },
  { t: "Dia das Crianças: Ensinando a Primeira Fisgada com Isca Artificial", f: "reels", p: "Esportividade & Família" },
  { t: "Ajuste de Freio Magnético para Evitar Cabeleira no Vento", f: "feed", p: "Dicas de Manuseio" },
  { t: "Fisgada Firme: Como Evitar que o Tucunaré Escape no Pulo", f: "reels", p: "Ação & Esportividade" },
  { t: "Iscas de Meia-Água com Rattlin: Quando Usar Vibração Sonora", f: "feed", p: "Técnicas de Iscas" },
  { t: "Desafio na Galhada: Precisão Milimétrica com Carretilha Steelfish", f: "reels", p: "Ação & Equipamento" },
  { t: "Pesque e Solte: Como Manusear o Troféu com Alicate de Contenção", f: "feed", p: "Consciência & Esporte" },
  { t: "Black Friday Steelfish: Os Maiores Descontos em Varas e Iscas", f: "reels", p: "Campanha Comercial" },
  { t: "Cyber Monday: Kits Exclusivos Steelfish para a Temporada de Verão", f: "feed", p: "Campanha Comercial" },
  { t: "Água Esquentando: Aumente o Tamanho da Isca de Superfície", f: "reels", p: "Ação & Esportividade" },
  { t: "Popper Furioso: Como Criar o Borbulho Irresistível para os Grandes", f: "feed", p: "Técnicas de Iscas" },
  { t: "Presente de Natal do Pescador: Varas e Carretilhas Steelfish", f: "reels", p: "Campanha de Natal" },
  { t: "Natal no Lago: O Que Levar na Maleta de Iscas para as Férias", f: "feed", p: "Campanha de Natal" },
  { t: "Retrospectiva dos Maiores Ataques do Ano com Iscas Steelfish", f: "reels", p: "Ação & Esportividade" },
  { t: "Metas de Pesca 2027: Qual Troféu Você Vai Buscar com a Steelfish?", f: "feed", p: "Lifestyle & Esporte" },
  { t: "Troca de Garatéias: Como Reforçar sem Prejudicar o Nado da Isca", f: "feed", p: "Manutenção & Dicas" },
  { t: "Ataque Visual: Slow Motion de Tucunaré Engolindo a Zara", f: "reels", p: "Ação & Esportividade" },
  { t: "Vara Rápida vs Moderada: Qual Escolher para Iscas de Hélice?", f: "feed", p: "Equipamento" },
  { t: "Combinação Perfeita: Linha Multifilamento e Líder de Fluorocarbono", f: "reels", p: "Técnica" },
  { t: "Leitura de Água: Identificando Bicos de Pedra e Ilhas Submersas", f: "feed", p: "Leitura de Ambiente" },
  { t: "Aceleração no Final do Recolhimento: O Truque dos Guias", f: "reels", p: "Dicas de Pesca" },
  { t: "Snap Reforçado: Segurança Máxima na Batalha com o Troféu", f: "feed", p: "Acessórios" },
  { t: "Pescaria de Caiaque: Como Arremessar Sentado sem Perder Distância", f: "reels", p: "Ação & Esportividade" },
  { t: "Top 5 Capturas de Dezembro no Eldorado Lake com Steelfish", f: "feed", p: "Galeria de Troféus" },
  { t: "Férias no Lago: Comece o Ano Novo na Batida do Peixe!", f: "reels", p: "Férias de Verão" }
];

steelfishDays.forEach((item, idx) => {
  const tInfo = steelfishThemes[idx % steelfishThemes.length];
  const hook = getSeasonalHook(item.dateStr);
  const dayName = dayNames[item.dayOfWeek];
  rawList.push({
    date: item.dateStr,
    dayOfWeek: dayName,
    time: "18:30",
    brand: "Steelfish",
    theme: "steelfish",
    format: tInfo.f,
    pillar: tInfo.p,
    title: tInfo.t,
    seasonalHook: hook,
    caption: `[STEELFISH • POST CONTRATUAL ${dayName.toUpperCase()}]\n\n${tInfo.t}\n\n${hook ? `Especial: ${hook}!\n` : ''}Na pesca esportiva de alta performance, cada arremesso precisa ser cirúrgico. As iscas e carretilhas Steelfish entregam a estabilidade e o acabamento que o pescador exigente busca nos grandes lagos.\n\nDica prática: Garanta o recolhimento cadenciado e teste variações de velocidade no mesmo ponto.\n\nEquipamento oficial do Eldorado Lake.\nConfira o catálogo em @steelfish.oficial.\n\n#steelfish #pescaesportiva #tucunare #iscasartificiais #eldoradopesca #reelsdepesca`,
    status: item.dateStr <= '2026-09-10' ? 'published' : (item.dateStr <= '2026-09-15' ? 'ready' : 'planned')
  });
});

// Roteiros Fishing Company (32) - Terças e Sábados
const fishingCoThemes = [
  { t: "Camisas UV50+: Por Que o Pescador Não Pode Negligenciar o Sol do Meio-Dia", f: "feed", p: "Proteção & Saúde" },
  { t: "Sábado no Lago: Conforto Térmico da Saída ao Pôr do Sol", f: "reels", p: "Lifestyle Outdoor" },
  { t: "Tecnologia Dry Fit Antibacteriana: Como Funciona no Calor Extremo", f: "feed", p: "Tecnologia Têxtil" },
  { t: "Primavera Chegando: Cores Vivas e Estampas Exclusivas da Fishing Co.", f: "reels", p: "Moda & Performance" },
  { t: "Início da Primavera: O Uniforme Oficial da Temporada de Pesca", f: "feed", p: "Sazonalidade" },
  { t: "Muv & Bandana: Proteção Total para Rosto, Pescoço e Orelhas", f: "reels", p: "Proteção Solar" },
  { t: "Jaqueta Corta-Vento Repelente à Água para Navegação Rápida", f: "feed", p: "Equipamento & Conforto" },
  { t: "Sábado de Troféus: Como a Liberdade de Movimento Faz a Diferença no Arremesso", f: "reels", p: "Ação & Lifestyle" },
  { t: "Linha Kids UV50+: Protegendo as Crianças no Dia das Crianças e Finais de Semana", f: "feed", p: "Família & Crianças" },
  { t: "Dia das Crianças com a Família no Eldorado Lake: Roupa Certa para os Pequenos", f: "reels", p: "Família & Lifestyle" },
  { t: "Luvas de Pesca UV: Aderência Firme na Carretilha e Zero Bolhas", f: "feed", p: "Acessórios Técnicos" },
  { t: "Respirabilidade em Ação: O Teste de Secagem Ultrarrápida", f: "reels", p: "Tecnologia Têxtil" },
  { t: "Bermudas e Calças Técnicas com Bolsos Multifuncionais para Iscas e Alicates", f: "feed", p: "Praticidade Outdoor" },
  { t: "Pôr do Sol no Rancho: A Transição do Dia Quente para a Brisa Noturna", f: "reels", p: "Lifestyle & Rancho" },
  { t: "Black Friday Fishing Company: Roupas UV50+ com Descontos Históricos", f: "feed", p: "Campanha Comercial" },
  { t: "Cyber Monday: Garanta seu Guarda-Roupa de Pesca para as Férias de Verão", f: "reels", p: "Campanha Comercial" },
  { t: "Dezembro Chegou: O Sol Mais Forte do Ano Exige Proteção Certificada UV50+", f: "feed", p: "Proteção & Verão" },
  { t: "Mochila Estanque e Vestuário: Como Montar a Mala de Pesca Perfeita", f: "reels", p: "Organização & Dicas" },
  { t: "Presente de Natal Inesquecível para o Pescador: Linha Fishing Company", f: "feed", p: "Campanha de Natal" },
  { t: "Natal com Estilo: Roupas que Vão do Barco ao Churrasco com Amigos", f: "reels", p: "Campanha de Natal" },
  { t: "Férias de Verão: O Kit Indispensável para 5 Dias Seguidos de Pescaria", f: "feed", p: "Férias & Aventura" },
  { t: "Adeus 2026: Vista a Camisa dos Grandes Pescadores para o Novo Ano", f: "reels", p: "Celebração & Lifestyle" },
  { t: "Bonés com Aba Anti-Reflexo: Melhor Visão dos Peixes na Água Rasa", f: "feed", p: "Acessórios Técnicos" },
  { t: "Navegando a 40 Milhas: O Conforto do Corta-Vento Fishing Company", f: "reels", p: "Performance & Ação" },
  { t: "Lavagem e Cuidados: Como Manter a Proteção UV50+ Eterna na sua Camisa", f: "feed", p: "Manutenção & Dicas" },
  { t: "Estilo na Foto do Troféu: Valorize sua Captura com um Uniforme Impecável", f: "reels", p: "Fotografia de Pesca" },
  { t: "Camuflagem Aquática: As Estampas Subaquáticas que Integram Você à Natureza", f: "feed", p: "Design Exclusivo" },
  { t: "Treino e Pesca: A Roupa que Funciona no Caiaque e na Academia", f: "reels", p: "Versatilidade" },
  { t: "Chuva de Verão: Secagem em Minutos para Continuar a Batalha", f: "feed", p: "Performance Clima" },
  { t: "Sábado Premiado: A Roupa Oficial dos Campeões de Pesca Esportiva", f: "reels", p: "Lifestyle Campeão" },
  { t: "Guia de Tamanhos e Caimento Masculino e Feminino na Pesca", f: "feed", p: "Catálogo & Escolha" },
  { t: "Último Sábado do Ano: Celebre suas Conquistas na Natureza!", f: "reels", p: "Fim de Ano & Natureza" }
];

fishingCoDays.forEach((item, idx) => {
  const tInfo = fishingCoThemes[idx % fishingCoThemes.length];
  const hook = getSeasonalHook(item.dateStr);
  const dayName = dayNames[item.dayOfWeek];
  rawList.push({
    date: item.dateStr,
    dayOfWeek: dayName,
    time: "19:00",
    brand: "Fishing Company",
    theme: "fishing_company",
    format: tInfo.f,
    pillar: tInfo.p,
    title: tInfo.t,
    seasonalHook: hook,
    caption: `[FISHING COMPANY • ${dayName.toUpperCase()}]\n\n${tInfo.t}\n\n${hook ? `Destaque: ${hook}!\n` : ''}Conforto, proteção solar fator UV50+ e durabilidade extrema. Na represa de Foz do Areia o sol não perdoa: proteja sua saúde sem abrir mão da máxima respirabilidade.\n\nVista a marca que veste os pescadores mais exigentes do Brasil.\nDisponível na loja oficial @fishingcompany.\n\n#fishingcompany #camisadepesca #protecaouv #pescaesportiva #eldoradopesca #outdoorlife`,
    status: item.dateStr <= '2026-09-10' ? 'published' : (item.dateStr <= '2026-09-15' ? 'ready' : 'planned')
  });
});

// Roteiros TR Fishing (16 posts) - Quartas
const trFishingThemes = [
  { t: "Nó FG Perfeito em Menos de 60 Segundos para Linha Multifilamento", f: "reels", p: "Dicas Técnicas" },
  { t: "Manutenção Preventiva de Carretilhas: Lubrificação Básica sem Abrir Tudo", f: "feed", p: "Manutenção & Durabilidade" },
  { t: "Guia de Bitolas: 20lb, 30lb ou 40lb? Qual Escolher para Tucunaré?", f: "feed", p: "Linhas & Equipamentos" },
  { t: "Como Desembaraçar Cabeleiras sem Cortar a Linha Multifilamento", f: "reels", p: "Dicas Rápidas" },
  { t: "Nó SF vs Nó Albright: Qual Suporta Mais Carga de Arrasto?", f: "feed", p: "Comparativo Técnico" },
  { t: "Líder de Fluorocarbono: O Segredo da Invisibilidade e Resistência à Abrasão", f: "reels", p: "Técnica Subaquática" },
  { t: "Ajuste Fino do Freio Centrífugo: Como Configurar para Arremessos Longos", f: "feed", p: "Configuração de Carretilha" },
  { t: "Alicate de Bico Longo com Corte de Multifilamento: O Acessório Vital", f: "reels", p: "Ferramentas do Pescador" },
  { t: "Como Prender o Anzol na Isca Soft sem Rasgar a Borracha", f: "feed", p: "Montagens & Iscas Soft" },
  { t: "Limpeza Pós-Pescaria: Removendo Resíduos e Sujeira dos Passadores da Vara", f: "reels", p: "Conservação" },
  { t: "Black Friday TR Fishing: Peças, Linhas e Ferramentas com Super Preços", f: "feed", p: "Campanha Comercial" },
  { t: "Troca Rápida de Garatéias com Alicate Split Ring: Passo a Passo", f: "reels", p: "Dicas Práticas" },
  { t: "Passadores de Zircônia vs Óxido de Alumínio: Entenda a Diferença", f: "feed", p: "Engenharia de Varas" },
  { t: "Presente de Natal Útil: O Kit de Ferramentas Essencial da TR Fishing", f: "reels", p: "Campanha de Natal" },
  { t: "Revisão Geral de Fim de Ano: Deixe seus Equipamentos Prontos para as Férias", f: "feed", p: "Revisão de Equipamentos" },
  { t: "Guia Definitivo de Equipamentos para a Temporada de Verão 2027", f: "reels", p: "Planejamento Técnico" }
];

trFishingDays.forEach((item, idx) => {
  const tInfo = trFishingThemes[idx % trFishingThemes.length];
  const hook = getSeasonalHook(item.dateStr);
  const dayName = dayNames[item.dayOfWeek];
  rawList.push({
    date: item.dateStr,
    dayOfWeek: dayName,
    time: "18:00",
    brand: "TR Fishing",
    theme: "tr_fishing",
    format: tInfo.f,
    pillar: tInfo.p,
    title: tInfo.t,
    seasonalHook: hook,
    caption: `[TR FISHING • QUARTA TÉCNICA]\n\n${tInfo.t}\n\n${hook ? `Contexto Especial: ${hook}!\n` : ''}Dica técnica direta ao ponto para elevar o nível da sua pescaria. O detalhe no nó, na calibragem e no equipamento é o que separa a perda do peixe do troféu no barco.\n\nConte com a TR Fishing para equipamentos precisos e soluções inteligentes.\nSiga @trfishingoficial.\n\n#trfishing #dicasdepesca #pescaesportiva #nofg #equipamentodepesca #eldoradopesca`,
    status: item.dateStr <= '2026-09-10' ? 'published' : (item.dateStr <= '2026-09-15' ? 'ready' : 'planned')
  });
});

// Roteiros Mathias (16 posts) - Quintas
const mathiasThemes = [
  { t: "Bastidores do Despacho: Como Embalamos seus Pedidos com Segurança", f: "reels", p: "Credibilidade & Logística" },
  { t: "Catálogo Iscas Mathias: As Cores Mais Pedidas da Semana", f: "feed", p: "Catálogo & Destaques" },
  { t: "Entrega Expressa para Todo o Brasil: Do Nosso Estoque para a sua Tralha", f: "reels", p: "Agilidade & Confiança" },
  { t: "Testadas e Aprovadas: O Nado Irresistível das Iscas Artesanais Mathias", f: "feed", p: "Qualidade de Produto" },
  { t: "Depoimentos de Clientes: Fotos dos Troféus Pegos com Iscas Mathias", f: "feed", p: "Prova Social" },
  { t: "Estoque Renovado: Chegaram Novos Modelos de Iscas de Superfície", f: "reels", p: "Lançamentos" },
  { t: "Como Montar seu Kit de Iscas para Pescaria em Represas", f: "feed", p: "Dicas de Compra" },
  { t: "Segurança na Compra Online: Atendimento Humano e Suporte Rápido", f: "reels", p: "Credibilidade" },
  { t: "Promoção Relâmpago de Quinta-Feira: Iscas Selecionadas no Site", f: "feed", p: "Ofertas Especiais" },
  { t: "Embalagem Reforçada: Garantia de Tubos Protetores para Varas e Iscas", f: "reels", p: "Cuidados de Envio" },
  { t: "Esquenta Black Friday Iscas Mathias: Frete Grátis e Cupons Exclusivos", f: "feed", p: "Campanha Comercial" },
  { t: "Black Friday Mathias: O Maior Desconto do Ano em Todo o Site", f: "reels", p: "Campanha Comercial" },
  { t: "Dezembro em Alta: Garanta suas Iscas Antes do Recesso de Fim de Ano", f: "feed", p: "Aviso de Envios" },
  { t: "Presente de Amigo Secreto do Pescador: Vales e Iscas Mathias", f: "reels", p: "Campanha de Natal" },
  { t: "Última Semana de Envios de 2026: Despacho Imediato para suas Férias", f: "feed", p: "Logística de Férias" },
  { t: "Gratidão 2026: Milhares de Pedidos Entregues e Milhares de Peixes Fisgados", f: "reels", p: "Comunidade & Fim de Ano" }
];

mathiasDays.forEach((item, idx) => {
  const tInfo = mathiasThemes[idx % mathiasThemes.length];
  const hook = getSeasonalHook(item.dateStr);
  const dayName = dayNames[item.dayOfWeek];
  rawList.push({
    date: item.dateStr,
    dayOfWeek: dayName,
    time: "18:30",
    brand: "Iscas Mathias",
    theme: "iscas_mathias",
    format: tInfo.f,
    pillar: tInfo.p,
    title: tInfo.t,
    seasonalHook: hook,
    caption: `[ISCAS MATHIAS • QUINTA DE CATÁLOGO]\n\n${tInfo.t}\n\n${hook ? `Atenção: ${hook}!\n` : ''}Credibilidade, envio rápido e produtos selecionados a dedo para pescadores que buscam resultado garantido. Cada pedido é embalado com proteção máxima e despachado no mesmo dia.\n\nGaranta as suas iscas favoritas antes que esgotem.\nAcesse @iscasmathias e chame no WhatsApp de atendimento!\n\n#iscasmathias #iscasartificiais #pescaesportiva #lojadepesca #despachorapido #eldoradopesca`,
    status: item.dateStr <= '2026-09-10' ? 'published' : (item.dateStr <= '2026-09-15' ? 'ready' : 'planned')
  });
});

// Roteiros Titan Caiaques (8 posts) - 2 Quartas alternadas por mês
const titanThemes = [
  { t: "Titan Caiaques: Engenharia Náutica e Máxima Estabilidade em Pé", f: "reels", p: "Alta Performance & Engenharia" },
  { t: "Pedal Sistema Mecânico: Navegação Silenciosa sem Espantar os Cardumes", f: "feed", p: "Tecnologia & Ação" },
  { t: "Outubro de Aventura: Explorando os Braços Secretos da Represa de Caiaque", f: "reels", p: "Aventura & Exploração" },
  { t: "Espaço de Carga e Conforto: Cadeira Ergonômica para 8 Horas de Pescaria", f: "feed", p: "Ergonomia & Design" },
  { t: "Black Friday Titan Caiaques: Condições Especiais para Realizar seu Sonho", f: "reels", p: "Campanha Comercial" },
  { t: "Segurança Náutica: Flutuabilidade Impossível de Naufragar no Caiaque Titan", f: "feed", p: "Segurança Náutica" },
  { t: "O Melhor Presente de Natal: Liberdade Absoluta na Água com seu Caiaque Titan", f: "reels", p: "Campanha de Natal" },
  { t: "Férias no Lago: A Experiência Incomparável de Pescar a Poucos Centímetros da Água", f: "feed", p: "Férias & Lifestyle" }
];

titanDays.forEach((item, idx) => {
  const tInfo = titanThemes[idx % titanThemes.length];
  const hook = getSeasonalHook(item.dateStr);
  const dayName = dayNames[item.dayOfWeek];
  rawList.push({
    date: item.dateStr,
    dayOfWeek: dayName,
    time: "19:30",
    brand: "Titan Caiaques",
    theme: "titan_caiaques",
    format: tInfo.f,
    pillar: tInfo.p,
    title: tInfo.t,
    seasonalHook: hook,
    caption: `[TITAN CAIAQUES • ALTA PERFORMANCE]\n\n${tInfo.t}\n\n${hook ? `Destaque: ${hook}!\n` : ''}A verdadeira revolução na pesca em caiaque. Estabilidade que permite ficar em pé com total firmeza, sistema de propulsão a pedal silencioso e acabamento de padrão internacional.\n\nDescubra novos pontos de pesca inacessíveis para barcos comuns.\nConheça a linha completa em @titancaiaques.\n\n#titancaiaques #caiaquedepesca #pescadecaiaque #altaperformance #eldoradopesca #caiaqueiro`,
    status: item.dateStr <= '2026-09-10' ? 'published' : (item.dateStr <= '2026-09-15' ? 'ready' : 'planned')
  });
});

// Ordenação cronológica estrita
rawList.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

// Atribuição de IDs sequenciais
rawList.forEach((item, i) => {
  item.id = `insta-104-${String(i + 1).padStart(3, '0')}`;
});

console.log(`Geradas exatamente ${rawList.length} postagens planejadas.`);

const fileContent = `/**
 * CRONOGRAMA EDITORIAL OFICIAL MULTIMARCAS (104 POSTS)
 * Período: 09 de Setembro a 31 de Dezembro de 2026 (16 semanas)
 * Marcas:
 * - Steelfish: 32 posts (Segundas e Sextas)
 * - Fishing Company: 32 posts (Terças e Sábados)
 * - TR Fishing: 16 posts (Quartas-feiras)
 * - Iscas Mathias: 16 posts (Quintas-feiras)
 * - Titan Caiaques: 8 posts (Quartas alternadas)
 * Datas Sazonais: Primavera (22/09), Dia das Crianças (12/10), Black Friday (23-30/11), Natal & Verão (Dezembro)
 */
window.OFFICIAL_INSTAGRAM_104_POSTS = ${JSON.stringify(rawList, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'instagram_cronograma_104.js'), fileContent, 'utf8');
console.log('Arquivo instagram_cronograma_104.js gerado com sucesso!');

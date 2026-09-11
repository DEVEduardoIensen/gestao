/**
 * Eldorado Pesca & Lake - Core Application Logic
 * Clean, High-Performance Management for Raffles, Store Credit (Vales), Prize Winner Sorter, Prize Exchanges, Fishing Agenda (Eldorado Lake) & Employee Days
 */

// Universal Local Date Formatting Helper (Prevents UTC timezone shifts in Brazil / UTC-3)
function getLocalDateStr(d = new Date()) {
  if (!d) d = new Date();
  if (typeof d === 'string') {
    if (d.includes('T')) {
      d = new Date(d);
    } else {
      const parts = d.split('-');
      if (parts.length === 3) return d;
      d = new Date(d);
    }
  }
  if (isNaN(d.getTime())) d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Global State
let appData = {
  settings: {},
  raffles: [],
  valesAndPrizes: [],
  eduardoWorkDays: [],
  fishingBookings: [],
  ranchoBookings: [],
  instagramPosts: [],
  boletos: []
};

// UI State
let activeRaffleId = null;
let userSelectedRaffleExplicitly = false;
let activeTab = "tab-rifas";

// Helper: Seleciona sempre a ação de maior numeração (cota mais recente/atual)
function getHighestRaffle(raffles) {
  if (!Array.isArray(raffles) || raffles.length === 0) return null;
  const pool = raffles.filter(r => !!r);
  if (pool.length === 0) return null;

  let highest = null;
  let maxNum = -1;
  pool.forEach(r => {
    let num = -1;
    const titleMatch = (r.title || '').match(/(\d+)\s*°?/);
    const numMatch = (String(r.number || '')).match(/(\d+)/);
    if (titleMatch) {
      num = parseInt(titleMatch[1], 10);
    } else if (numMatch) {
      num = parseInt(numMatch[1], 10);
    }
    if (num > maxNum) {
      maxNum = num;
      highest = r;
    }
  });
  return highest || pool[0];
}
let currentValesFilter = "all";
let currentFishingFilter = "all";
let currentRanchoFilter = "all";
let currentInstagramFilter = "all";
let currentInstagramViewMode = "cards";
let currentInstagramMonthFilter = "all";
let currentInstagramStatusFilter = "all";
let currentBoletoFilter = "all";
let boletoSelectedYear = 2026;
let boletoSelectedMonth = 8; // 8 = Setembro
let activeBoletoId = null;
let lastScannedBoletoDataUrl = null;
let calSelectedYear = new Date().getFullYear();
let calSelectedMonth = new Date().getMonth(); // 0-indexed (7 = August)
let fishCalSelectedYear = new Date().getFullYear();
let fishCalSelectedMonth = new Date().getMonth();
let ranchoCalSelectedYear = new Date().getFullYear();
let ranchoCalSelectedMonth = new Date().getMonth();
let instagramCalSelectedYear = new Date().getFullYear();
let instagramCalSelectedMonth = new Date().getMonth();
let activeInstagramPostId = null;
let isConnectedToBackend = false;

// Initialize Application on DOM Ready
function sanitizeAppData(data) {
  if (!data || typeof data !== 'object') data = {};
  if (!data.settings || typeof data.settings !== 'object') {
    data.settings = (typeof INITIAL_SAMPLE_DATA !== 'undefined' && INITIAL_SAMPLE_DATA.settings) ? INITIAL_SAMPLE_DATA.settings : {
      eduardoDailyRate: 62.00,
      eduardoHalfRate: 31.00,
      storeName: "ELDORADO PESCA LTDA",
      pixKey: "42999162340",
      phone: "42 9 9916-2340"
    };
  }
  if (!Array.isArray(data.raffles)) {
    data.raffles = (typeof INITIAL_SAMPLE_DATA !== 'undefined' && Array.isArray(INITIAL_SAMPLE_DATA.raffles)) ? INITIAL_SAMPLE_DATA.raffles : [];
  } else {
    data.raffles = data.raffles.filter(r => !!r);
    data.raffles.forEach(r => {
      if (r && r.title) {
        r.title = r.title.replace(/\s*\((?:ativa|ativas|finalizada|finalizadas)\)/gi, '').trim();
      }
    });
    data.raffles = data.raffles.map(r => (typeof normalizeRaffle === 'function') ? normalizeRaffle(r) : r);
  }
  if (!Array.isArray(data.valesAndPrizes)) {
    data.valesAndPrizes = (typeof INITIAL_SAMPLE_DATA !== 'undefined' && Array.isArray(INITIAL_SAMPLE_DATA.valesAndPrizes)) ? INITIAL_SAMPLE_DATA.valesAndPrizes : [];
  }
  if (!Array.isArray(data.eduardoWorkDays)) {
    data.eduardoWorkDays = (typeof INITIAL_SAMPLE_DATA !== 'undefined' && Array.isArray(INITIAL_SAMPLE_DATA.eduardoWorkDays)) ? INITIAL_SAMPLE_DATA.eduardoWorkDays : [];
  }
  if (!Array.isArray(data.fishingBookings)) {
    data.fishingBookings = (typeof INITIAL_SAMPLE_DATA !== 'undefined' && Array.isArray(INITIAL_SAMPLE_DATA.fishingBookings)) ? INITIAL_SAMPLE_DATA.fishingBookings : [];
  }
  if (!Array.isArray(data.ranchoBookings)) {
    data.ranchoBookings = (typeof INITIAL_SAMPLE_DATA !== 'undefined' && Array.isArray(INITIAL_SAMPLE_DATA.ranchoBookings)) ? INITIAL_SAMPLE_DATA.ranchoBookings : [];
  }
  if (!Array.isArray(data.instagramPosts)) {
    data.instagramPosts = (data.settings && Array.isArray(data.settings.instagramPosts))
      ? data.settings.instagramPosts
      : [
          {
            id: 'insta-sample-1',
            date: getLocalDateStr(),
            time: '18:30',
            format: 'reels',
            theme: 'steelfish',
            title: 'Steelfish: Teste de Resistência das Carretilhas nos Tucunarés do Eldorado Lake',
            caption: 'Equipamento colocado à prova no Eldorado Lake! As carretilhas e varas da Steelfish aguentando a explosão dos grandes tucunarés azuis na represa de Foz do Areia.\n\nDica técnica: linha multifilamento de alta qualidade e drag calibrado na medida certa.\n\nConfira os produtos oficiais na @steelfish.oficial.\n\n#eldoradopesca #steelfish #pescaesportiva #tucunareazul #fozdoareia',
            status: 'ready'
          },
          {
            id: 'insta-sample-2',
            date: getLocalDateStr(new Date(Date.now() + 86400000 * 2)),
            time: '19:00',
            format: 'feed',
            theme: 'steelfish',
            title: 'Steelfish: Guia de Cores e Ação de Iscas para Água Limpa',
            caption: 'Segunda postagem semanal Steelfish: Qual cor de isca de superfície usar em dias de sol forte e vento brando? Detalhamos o trabalho lento com paradas estratégicas nos bicos da represa.\n\nParceiro oficial: @steelfish.oficial\n\n#steelfish #iscasartificiais #pesqueesolte #eldoradopesca',
            status: 'draft'
          },
          {
            id: 'insta-sample-3',
            date: getLocalDateStr(new Date(Date.now() + 86400000 * 4)),
            time: '11:00',
            format: 'feed',
            theme: 'titan_caiaques',
            title: 'Titan Caiaques: Acesso Exclusivo às Melhores Estruturas de Foz do Areia',
            caption: 'Chegar onde os barcos maiores não entram: essa é a vantagem da estabilidade dos caiaques da Titan Caiaques no lago. Conforto para o pescador arremessar em pé o dia todo.\n\nParceiro oficial Eldorado Lake: @titancaiaques\n\n#titancaiaques #caiaquefishing #eldoradopesca',
            status: 'ready'
          },
          {
            id: 'insta-sample-4',
            date: getLocalDateStr(new Date(Date.now() - 86400000 * 1)),
            time: '17:30',
            format: 'stories',
            theme: 'iscas_mathias',
            title: 'Iscas Mathias: Ataque Violento na Meia-Água ao Entardecer',
            caption: 'Registro direto da água pelo guia Thiago Witeck. Tucunaré bruto capturado com isca Mathias na caída de barranco.\n\n#iscasmathias #eldoradolake #pescaesportiva',
            status: 'published'
          },
          {
            id: 'insta-sample-5',
            date: getLocalDateStr(new Date(Date.now() + 86400000 * 5)),
            time: '12:00',
            format: 'feed',
            theme: 'fishing_company',
            title: 'Fishing Company: Camisas UV50+ e Conforto Térmico no Lake',
            caption: 'Linha oficial de vestuário de alta performance para os dias ensolarados na represa de Foz do Areia. Proteção UV50+, secagem rápida e tecido antimicrobiano.\n\nParceiro oficial: @fishingcompanyoficial\n\n#fishingcompany #vestuariopesca #protecaouv #eldoradopesca',
            status: 'ready'
          }
        ];
  }
  if (!Array.isArray(data.boletos)) {
    data.boletos = (data.settings && Array.isArray(data.settings.boletos))
      ? data.settings.boletos
      : [];
  }
  // Se estiver vazio ou contiver apenas mock antigo (bol-demo-001), carrega os 16 títulos reais do relatório
  if (data.boletos.length === 0 || (data.boletos.length > 0 && String(data.boletos[0].id).startsWith('bol-demo-'))) {
    data.boletos = getThiagoRealContasAPagar();
    if (!data.settings) data.settings = {};
    data.settings.boletos = data.boletos;
  }
  return data;
}

document.addEventListener("DOMContentLoaded", async () => {
  await initAppState();
  setupEventListeners();
  renderAll();
});

/* ==========================================================================
   State & Persistence Management (Offline-First Dexie + Supabase + Outbox)
   ========================================================================== */
function updateDbStatusBadge(status) {
  const badge = document.getElementById("dbStatusBadge");
  const text = document.getElementById("dbStatusText");
  if (!badge || !text) return;

  if (status === "online" || status === "synced" || status === true) {
    badge.className = "db-status-badge online";
    badge.title = "Supabase PostgreSQL conectado e sincronizado";
    text.textContent = "Sincronizado";
  } else if (status === "syncing") {
    badge.className = "db-status-badge syncing";
    badge.title = "Sincronizando com o Supabase...";
    text.textContent = "Sincronizando...";
  } else {
    badge.className = "db-status-badge offline";
    badge.title = "Modo Offline ativo. As alterações serão sincronizadas ao reconectar.";
    text.textContent = "Offline";
  }
}

async function initAppState() {
  // Inicializa escuta de PWA e verificação de Service Worker imediatamente (antes do Auth Guard)
  initSyncAndPwaHandlers();

  const isDirectAccess = (window.authManager && typeof window.authManager.isStandaloneOrInstalled === 'function' && window.authManager.isStandaloneOrInstalled()) ||
    window.__ELDORADO_IS_DESKTOP_APP ||
    window.__ELDORADO_IS_MOBILE_APP ||
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Electron')) ||
    (typeof window !== 'undefined' && window.location && (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

  // 1. Recupera sessão do usuário se houver (com stale-while-revalidate ultrarrápido)
  if (window.authManager) {
    try {
      await window.authManager.checkInitialSession();
      updateAuthUi();
    } catch (e) {
      console.warn('[Auth] Erro na sessão inicial:', e);
    }
  }

  const gateScreen = document.getElementById("authGateScreen");

  // 2. AUTH GUARD: Se o usuário não estiver autenticado e não for app instalado no desktop/mobile, bloqueia o acesso
  if (!isDirectAccess && (!window.authManager || !window.authManager.isAuthenticated())) {
    document.documentElement.classList.add('show-auth-gate');
    if (gateScreen) gateScreen.style.display = "flex";
    appData = {
      settings: {},
      raffles: [],
      valesAndPrizes: [],
      eduardoWorkDays: [],
      fishingBookings: [],
      ranchoBookings: []
    };
    updateDbStatusBadge('offline');
    if (window.authManager && window.authManager.isPasswordRecovery) {
      openModal('modalResetPassword');
    }
    return;
  }

  // Usuário autenticado ou app instalado: esconde tela de bloqueio inicial sem piscar
  document.documentElement.classList.remove('show-auth-gate');
  if (gateScreen) gateScreen.style.display = "none";

  // Se estiver acessando pelo navegador comum e ainda não tiver clicado para entrar no painel nesta sessão, abre a tela de direcionamento com os 3 botões
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isPostLoginDone = sessionStorage.getItem('ELDORADO_POST_LOGIN_DONE') === 'true';

  if (!isStandalone && !isDirectAccess && !isPostLoginDone) {
    openAccessHub();
  } else {
    proceedToDashboard();
  }

  const defaultOrgId = (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.DEFAULT_ORG_ID : null);
  const orgId = (window.authManager && window.authManager.getOrganizationId()) || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID') || defaultOrgId;

  // 3. ZERO-LATENCY FIRST PAINT (< 2ms): Lê imediatamente do localStorage síncrono e pinta as cotas no frame zero!
  let loadedFromLocal = false;
  const fastSaved = (orgId ? localStorage.getItem("ELDORADO_PESCA_STORE_DATA_" + orgId) : null) || (defaultOrgId ? localStorage.getItem("ELDORADO_PESCA_STORE_DATA_" + defaultOrgId) : null);
  if (fastSaved) {
    try {
      const parsedFast = JSON.parse(fastSaved);
      if (parsedFast && (Array.isArray(parsedFast.raffles) && parsedFast.raffles.length > 0)) {
        appData = sanitizeAppData(parsedFast);
        loadedFromLocal = true;
        if (!userSelectedRaffleExplicitly) {
          const highest = getHighestRaffle(appData.raffles);
          activeRaffleId = highest ? highest.id : appData.raffles[0].id;
        }
        // Exibição instantânea das cotas antes de qualquer operação assíncrona
        renderAll();
      }
    } catch (e) {}
  }

  // 4. Complementa/sincroniza com o IndexedDB persistente (isolado por tenant)
  if (window.localDB) {
    try {
      const localData = await window.localDB.loadFullAppData(orgId);
      if (localData && (localData.raffles || localData.valesAndPrizes || localData.fishingBookings || localData.ranchoBookings)) {
        appData = sanitizeAppData(localData);
        loadedFromLocal = true;
        if (appData.raffles && appData.raffles.length > 0) {
          if (!userSelectedRaffleExplicitly) {
            const highest = getHighestRaffle(appData.raffles);
            activeRaffleId = highest ? highest.id : appData.raffles[0].id;
          }
        }
        renderAll();
      }
    } catch (err) {
      console.warn('[Offline-First] Erro ao ler IndexedDB:', err);
    }
  }

  if (!loadedFromLocal) {
    appData = sanitizeAppData({
      settings: { eduardoDailyRate: 62.00, eduardoHalfRate: 31.00 },
      raffles: [],
      valesAndPrizes: [],
      eduardoWorkDays: [],
      fishingBookings: [],
      ranchoBookings: []
    });
    renderAll();
  }

  // Define rifa ativa para renderização rápida
  if (appData.raffles && appData.raffles.length > 0) {
    if (!userSelectedRaffleExplicitly) {
      const highest = getHighestRaffle(appData.raffles);
      activeRaffleId = highest ? highest.id : appData.raffles[0].id;
    } else {
      const stillExists = activeRaffleId && appData.raffles.some(r => String(r.id) === String(activeRaffleId));
      if (!stillExists) {
        const highest = getHighestRaffle(appData.raffles);
        activeRaffleId = highest ? highest.id : appData.raffles[0].id;
      }
    }
  } else {
    activeRaffleId = null;
  }

  // 4. Sincronização em background transparente (não bloqueia a renderização)
  if (navigator.onLine && window.syncEngine && window.supabaseClient) {
    updateDbStatusBadge('syncing');

    (async () => {
      try {
        if (window.syncEngine) {
          await window.syncEngine.processQueue();
        }
        const remoteData = await window.syncEngine.fetchRemoteData(orgId);
        if (remoteData) {
          await window.mergeRemoteData(remoteData);
        }
        updateDbStatusBadge('synced');
      } catch (err) {
        console.warn('[Supabase] Falha no background sync:', err);
        updateDbStatusBadge(navigator.onLine ? 'synced' : 'offline');
      }
    })();
  } else {
    updateDbStatusBadge(navigator.onLine ? 'synced' : 'offline');
  }

  // Verifica se há pedido de recuperação de senha ativo
  if (window.authManager && window.authManager.isPasswordRecovery) {
    openModal('modalResetPassword');
  }
}

// Mescla dados remotos recebidos do Supabase / Realtime na memória e no cache local (Smart Merge)
window.mergeRemoteData = async function(remoteData) {
  if (!remoteData) return;
  const orgId = (window.authManager && window.authManager.getOrganizationId()) || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID') || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.DEFAULT_ORG_ID : null);

  if (remoteData.raffles || remoteData.valesAndPrizes || remoteData.fishingBookings || remoteData.ranchoBookings || remoteData.eduardoWorkDays || remoteData.settings) {
    const sanitized = sanitizeAppData(remoteData);

    // SMART MERGE: Protege e preserva alterações locais ainda não sincronizadas no Outbox
    if (window.localDB) {
      try {
        const pendingOps = await window.localDB.getPendingOperations(orgId);
        if (Array.isArray(pendingOps) && pendingOps.length > 0) {
          console.log(`[SmartMerge] Preservando ${pendingOps.length} operações locais pendentes contra sobrescrita...`);
          pendingOps.forEach(op => {
            if (!op.payload) return;

            // 1. Preservar Cotas Modificadas Localmente
            if (op.type === 'SELL_NUMBERS' && Array.isArray(sanitized.raffles)) {
              const targetRaffle = sanitized.raffles.find(r => r.id === op.payload.raffleId);
              if (targetRaffle && Array.isArray(targetRaffle.numbers) && Array.isArray(op.payload.numbers)) {
                op.payload.numbers.forEach(num => {
                  const item = targetRaffle.numbers.find(n => n.num === num);
                  if (item) {
                    item.status = op.payload.status;
                    item.name = op.payload.buyerName || '';
                    item.reservedAt = op.payload.reservedAt;
                    item.paidAt = op.payload.paidAt;
                  }
                });
              }
            } else if (op.type === 'BATCH_SET_NUMBERS' && Array.isArray(sanitized.raffles)) {
              const targetRaffle = sanitized.raffles.find(r => r.id === op.payload.raffleId);
              if (targetRaffle && Array.isArray(targetRaffle.numbers) && Array.isArray(op.payload.numbersList)) {
                op.payload.numbersList.forEach(n => {
                  const item = targetRaffle.numbers.find(num => num.num === n.num);
                  if (item) {
                    item.status = n.status;
                    item.name = n.name || '';
                    item.reservedAt = n.reservedAt;
                    item.paidAt = n.paidAt;
                  }
                });
              }
            }
            // 2. Preservar Vales & Prêmios Modificados Localmente
            else if (op.type === 'UPDATE_VALE' && Array.isArray(sanitized.valesAndPrizes)) {
              const idx = sanitized.valesAndPrizes.findIndex(v => v.id === op.payload.id);
              if (idx >= 0) sanitized.valesAndPrizes[idx] = { ...sanitized.valesAndPrizes[idx], ...op.payload };
              else sanitized.valesAndPrizes.unshift(op.payload);
            } else if (op.type === 'DELETE_VALE' && Array.isArray(sanitized.valesAndPrizes)) {
              sanitized.valesAndPrizes = sanitized.valesAndPrizes.filter(v => v.id !== op.payload.id);
            }
            // 3. Preservar Agendamentos de Pesca Modificados Localmente
            else if (op.type === 'BOOK_FISHING' && Array.isArray(sanitized.fishingBookings)) {
              const idx = sanitized.fishingBookings.findIndex(f => f.id === op.payload.id);
              if (idx >= 0) sanitized.fishingBookings[idx] = { ...sanitized.fishingBookings[idx], ...op.payload };
              else sanitized.fishingBookings.push(op.payload);
            } else if (op.type === 'DELETE_FISHING_BOOKING' && Array.isArray(sanitized.fishingBookings)) {
              sanitized.fishingBookings = sanitized.fishingBookings.filter(f => f.id !== op.payload.id);
            }
            // 4. Preservar Locações do Rancho Modificadas Localmente
            else if (op.type === 'BOOK_RANCHO' && Array.isArray(sanitized.ranchoBookings)) {
              const idx = sanitized.ranchoBookings.findIndex(r => r.id === op.payload.id);
              if (idx >= 0) sanitized.ranchoBookings[idx] = { ...sanitized.ranchoBookings[idx], ...op.payload };
              else sanitized.ranchoBookings.push(op.payload);
            } else if (op.type === 'DELETE_RANCHO_BOOKING' && Array.isArray(sanitized.ranchoBookings)) {
              sanitized.ranchoBookings = sanitized.ranchoBookings.filter(r => r.id !== op.payload.id);
            }
            // 5. Preservar Ponto do Eduardo
            else if (op.type === 'SET_EDUARDO_DAY' && Array.isArray(sanitized.eduardoWorkDays)) {
              const idx = sanitized.eduardoWorkDays.findIndex(d => d.date === op.payload.date);
              if (idx >= 0) sanitized.eduardoWorkDays[idx] = { ...sanitized.eduardoWorkDays[idx], ...op.payload };
              else sanitized.eduardoWorkDays.push(op.payload);
            } else if (op.type === 'DELETE_EDUARDO_DAY' && Array.isArray(sanitized.eduardoWorkDays)) {
              sanitized.eduardoWorkDays = sanitized.eduardoWorkDays.filter(d => d.date !== op.payload.date);
            }
            // 6. Preservar Criação/Edição de Rifa
            else if ((op.type === 'CREATE_RAFFLE' || op.type === 'UPDATE_RAFFLE') && Array.isArray(sanitized.raffles)) {
              const idx = sanitized.raffles.findIndex(r => String(r.id) === String(op.payload.id));
              if (idx >= 0) {
                const existing = sanitized.raffles[idx];
                const preservedPrizes = Array.isArray(op.payload.prizes) ? op.payload.prizes : existing.prizes;
                const preservedNumbers = Array.isArray(op.payload.numbers) ? op.payload.numbers : existing.numbers;
                sanitized.raffles[idx] = {
                  ...existing,
                  ...op.payload,
                  prizes: preservedPrizes,
                  numbers: preservedNumbers
                };
              } else {
                sanitized.raffles.unshift(op.payload);
              }
            } else if (op.type === 'DELETE_RAFFLE' && Array.isArray(sanitized.raffles)) {
              sanitized.raffles = sanitized.raffles.filter(r => String(r.id) !== String(op.payload.id));
            }
            // 7. Preservar Configurações
            else if (op.type === 'UPDATE_SETTINGS') {
              if (!sanitized.settings) sanitized.settings = {};
              sanitized.settings[op.payload.key] = op.payload.value;
            }
          });
        }
      } catch (err) {
        console.warn('[SmartMerge] Nota sobre verificação de fila pendente:', err);
      }
    }

    // Define rifa ativa (prioriza a ação mais alta se não escolhida manualmente ou se a atual não existir mais)
    if (sanitized.raffles && sanitized.raffles.length > 0) {
      if (!userSelectedRaffleExplicitly) {
        const highest = getHighestRaffle(sanitized.raffles);
        activeRaffleId = highest ? highest.id : sanitized.raffles[0].id;
      } else {
        const stillExists = activeRaffleId && sanitized.raffles.some(r => String(r.id) === String(activeRaffleId));
        if (!stillExists) {
          const highest = getHighestRaffle(sanitized.raffles);
          activeRaffleId = highest ? highest.id : sanitized.raffles[0].id;
        }
      }
    }

    appData = sanitized;

    // RENDERIZAÇÃO IMEDIATA: Atualiza a tela instantaneamente sem esperar I/O de disco
    renderAll();
    updateGlobalStats();

    // Persistência assíncrona não-bloqueante
    if (window.localDB) {
      window.localDB.saveFullAppData(appData, orgId).catch(e => {
        console.warn('[mergeRemoteData] Falha ao persistir no IndexedDB:', e);
      });
    }

    try {
      localStorage.setItem("ELDORADO_PESCA_STORE_DATA_" + orgId, JSON.stringify(appData));
    } catch (e) {}
  }
};

async function saveState(syncOperation = null) {
  const orgId = (window.authManager && window.authManager.getOrganizationId()) || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID') || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.DEFAULT_ORG_ID : null);

  // 1. Salva no IndexedDB (Dexie) indexado pelo organization_id
  if (window.localDB) {
    try {
      await window.localDB.saveFullAppData(appData, orgId);
    } catch (e) {
      console.warn('[Dexie] Falha ao persistir snapshot no IndexedDB:', e);
    }

    // 2. Se houver operação atômica de sincronização, adiciona na fila outbox
    if (syncOperation) {
      try {
        await window.localDB.enqueueOperation({
          ...syncOperation,
          orgId: orgId
        });
      } catch (e) {
        console.warn('[Outbox] Falha ao enfileirar operação:', e);
      }
      if (window.syncEngine) {
        window.syncEngine.processQueue();
      }

      // Notifica o Service Worker para agendamento de sincronização imediata ou em segundo plano
      if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' });
        } catch (e) {}
      }
    }
  }

  // 3. Backup assíncrono com debounce para não travar a Main Thread (Zero Stuttering)
  scheduleLocalStorageBackup(orgId);

  updateGlobalStats();
}


let localStorageBackupTimer = null;
function scheduleLocalStorageBackup(orgId) {
  if (!orgId || !appData) return;
  if (localStorageBackupTimer) clearTimeout(localStorageBackupTimer);
  localStorageBackupTimer = setTimeout(() => {
    try {
      localStorage.setItem("ELDORADO_PESCA_STORE_DATA_" + orgId, JSON.stringify(appData));
    } catch (e) {}
  }, 2000);
}

// Salva snapshot imediatamente ao fechar a aba
window.addEventListener('beforeunload', () => {
  const orgId = window.authManager ? window.authManager.getOrganizationId() : null;
  if (orgId && appData) {
    try {
      localStorage.setItem("ELDORADO_PESCA_STORE_DATA_" + orgId, JSON.stringify(appData));
    } catch (e) {}
  }
});

function initSyncAndPwaHandlers() {
  // Service Worker Registration com auto-update imediato e bypass de cache HTTP
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      console.log('[PWA] Service Worker registrado com sucesso:', reg.scope);

      // Se já houver um worker esperando, força ativação imediata
      if (reg.waiting) {
        console.log('[PWA] Worker em espera detectado no app.js. Ativando...');
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Força verificação imediata de atualizações no servidor/Vercel
      reg.update().catch(() => {});

      // Escuta novas versões sendo baixadas
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              console.log('[PWA] Nova versão instalada. Ativando imediatamente...');
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        }
      });
    }).catch(err => {
      console.warn('[PWA] Falha ao registrar Service Worker:', err);
    });

    // Quando o novo Service Worker assumir controle, recarrega para aplicar na hora
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        console.log('[PWA] Atualização aplicada. Recarregando aplicação...');
        window.location.reload();
      }
    });

    // Mensagens diretas do SW
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SW_ACTIVATED') {
        console.log('[PWA] Versão ativada recebida:', event.data.version);
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      }
    });

    // Checa atualizações ao voltar e arma o Background Sync de forma assíncrona garantida ao sair ou bloquear o celular
    const armBackgroundSyncOnExit = async () => {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        try {
          const reg = await (navigator.serviceWorker.ready || (navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration() : Promise.resolve(null)));
          if (reg && 'sync' in reg) {
            await Promise.allSettled([
              reg.sync.register('eldorado-outbox-sync'),
              reg.sync.register('sync-outbox'),
              reg.sync.register('sync')
            ]);
            console.log('[PWA] Background Sync tags registradas ao sair do app.');
          }
          if (reg && 'periodicSync' in reg) {
            try {
              await reg.periodicSync.register('eldorado-periodic-sync', { minInterval: 15 * 60 * 1000 });
            } catch (e) {}
          }
        } catch (err) {
          console.warn('[PWA] Falha ao armar Background Sync ao sair:', err);
        }
      }
    };

    const triggerForegroundSync = () => {
      console.log('[PWA] Aplicativo ativo/visível: acionando sincronização imediata da fila outbox...');
      if (window.syncEngine && typeof window.syncEngine.processQueue === 'function') {
        window.syncEngine.processQueue();
      }
      if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
        try {
          navigator.serviceWorker.controller.postMessage({ type: 'TRIGGER_SYNC' });
        } catch (e) {}
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        triggerForegroundSync();
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) reg.update().catch(() => {});
        });
      } else if (document.visibilityState === 'hidden') {
        armBackgroundSyncOnExit();
      }
    });
    window.addEventListener('online', triggerForegroundSync);
    window.addEventListener('focus', triggerForegroundSync);
    window.addEventListener('pagehide', armBackgroundSyncOnExit);
    window.addEventListener('freeze', armBackgroundSyncOnExit);
  }

  // Escuta mudanças de status no SyncEngine
  if (window.syncEngine) {
    window.syncEngine.onStatusChange((status) => {
      updateDbStatusBadge(status);
    });
  }

  // Escuta mudanças no AuthManager
  if (window.authManager) {
    window.authManager.onAuthStateChange(async (event, session) => {
      updateAuthUi();
      if (event === 'PASSWORD_RECOVERY') {
        openModal('modalResetPassword');
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await initAppState();
        renderAll();
      } else if (event === 'SIGNED_OUT') {
        await initAppState();
        renderAll();
      }
    });
  }
}

/**
 * Força verificação e atualização imediata do PWA
 * Usado pelo botão no painel de administração para evitar reinstalações manuais
 */
window.forceCheckAppUpdate = async function() {
  const btn = document.getElementById('btnForceCheckUpdate');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> Verificando...';
  }
  showToast('Verificando se há atualizações na nuvem...', 'info');

  // Se for Electron Desktop
  if (window.__ELDORADO_IS_ELECTRON || window.__ELDORADO_IS_DESKTOP_APP) {
    if (window.electronAPI && typeof window.electronAPI.reloadApp === 'function') {
      window.electronAPI.reloadApp();
      return;
    }
    window.location.reload();
    return;
  }

  if (!navigator.onLine) {
    showToast('Você está offline. Conecte-se à internet para atualizar.', 'warning');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
    return;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          showToast('Nova versão encontrada! Aplicando atualização...', 'success');
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          setTimeout(() => window.location.reload(), 600);
          return;
        }
      }

      // Limpa caches antigos obsoletos
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        const activeCache = 'eldorado-pwa-v2.9.3';
        await Promise.all(
          cacheNames.map(name => {
            if (name !== activeCache) {
              return caches.delete(name);
            }
          })
        );
      }

      showToast('O aplicativo já está na versão mais recente (v2.9.3 PRO)!', 'success');
    } else {
      window.location.reload();
    }
  } catch (err) {
    console.warn('[PWA] Erro ao buscar atualizações:', err);
    showToast('Erro ao verificar atualizações: ' + (err.message || err), 'warning');
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
};

function updateAuthUi() {
  const label = document.getElementById('headerAuthLabel');
  const loggedView = document.getElementById('authLoggedInView');
  const formView = document.getElementById('authFormView');
  const emailDisplay = document.getElementById('authUserEmailDisplay');
  const adminEmailDisplay = document.getElementById('adminUserEmailDisplay');
  const adminUserRoleBadge = document.getElementById('adminUserRoleBadge');
  const adminUserAvatar = document.getElementById('adminUserAvatar');
  const gateScreen = document.getElementById('authGateScreen');

  const user = window.authManager ? window.authManager.user : null;
  const currentOrg = window.authManager ? window.authManager.currentOrg : null;
  const isMobileInstalled = window.authManager && typeof window.authManager.isMobileInstalledApp === 'function' && window.authManager.isMobileInstalledApp();
  const isAuth = (window.authManager ? window.authManager.isAuthenticated() : false) || isMobileInstalled;

  if (gateScreen) {
    const shouldShowGate = !isAuth && !isMobileInstalled;
    if (shouldShowGate) {
      document.documentElement.classList.add('show-auth-gate');
      gateScreen.style.display = 'flex';
    } else {
      document.documentElement.classList.remove('show-auth-gate');
      gateScreen.style.display = 'none';
    }
  }

  if (isAuth && user) {
    if (label) label.textContent = currentOrg ? currentOrg.name : 'Logado';
    if (loggedView) loggedView.style.display = 'block';
    if (formView) formView.style.display = 'none';
    if (emailDisplay) emailDisplay.textContent = user.email || 'Usuário';
    if (adminEmailDisplay) adminEmailDisplay.textContent = user.email || 'Usuário';

    if (adminUserRoleBadge) {
      const role = currentOrg?.role || 'owner';
      adminUserRoleBadge.textContent = role === 'owner' ? 'Proprietário' : (role === 'admin' ? 'Administrador' : 'Membro');
    }

    if (adminUserAvatar) {
      const initials = (currentOrg?.name || user.email || 'EP')
        .split(' ')
        .filter(Boolean)
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      adminUserAvatar.textContent = initials || 'EP';
    }

    const orgSelects = [
      document.getElementById('selectUserOrganization'),
      document.getElementById('adminSelectUserOrganization')
    ].filter(Boolean);

    if (window.authManager && window.authManager.organizations.length > 0) {
      orgSelects.forEach(sel => {
        sel.innerHTML = '';
        window.authManager.organizations.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.id;
          opt.textContent = `${o.name} (${o.role || 'membro'})`;
          if (o.id === currentOrg?.id) opt.selected = true;
          sel.appendChild(opt);
        });
      });
    }
  } else {
    if (label) label.textContent = 'Entrar';
    if (loggedView) loggedView.style.display = 'none';
    if (formView) formView.style.display = 'block';
    if (adminEmailDisplay) adminEmailDisplay.textContent = 'Não Autenticado';
  }
}

let currentAuthTab = 'login';
function switchAuthTab(tab) {
  currentAuthTab = tab;
  ['tabAuthLogin', 'tabAuthRegister', 'tabAuthRecover'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  const activeBtn = document.getElementById(tab === 'login' ? 'tabAuthLogin' : (tab === 'register' ? 'tabAuthRegister' : 'tabAuthRecover'));
  if (activeBtn) activeBtn.classList.add('active');

  const orgGroup = document.getElementById('groupAuthOrgName');
  const inviteGroup = document.getElementById('groupAuthInviteToken');
  const passGroup = document.getElementById('groupAuthPassword');
  const btnSubmit = document.getElementById('btnSubmitAuth');
  const errDiv = document.getElementById('authErrorMessage');
  if (errDiv) errDiv.style.display = 'none';

  if (tab === 'login') {
    if (orgGroup) orgGroup.style.display = 'none';
    if (inviteGroup) inviteGroup.style.display = 'none';
    if (passGroup) passGroup.style.display = 'block';
    if (btnSubmit) btnSubmit.textContent = 'Entrar';
  } else if (tab === 'register') {
    if (orgGroup) orgGroup.style.display = 'block';
    if (inviteGroup) inviteGroup.style.display = 'block';
    if (passGroup) passGroup.style.display = 'block';
    if (btnSubmit) btnSubmit.textContent = 'Criar Minha Conta';
  } else {
    if (orgGroup) orgGroup.style.display = 'none';
    if (inviteGroup) inviteGroup.style.display = 'none';
    if (passGroup) passGroup.style.display = 'none';
    if (btnSubmit) btnSubmit.textContent = 'Enviar Link de Recuperação';
  }
}

// ============================================================================
// PWA Installation Prompt Manager & Multidevice Access
// ============================================================================
let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  console.log('[PWA] Evento beforeinstallprompt capturado com sucesso.');
});

window.addEventListener('appinstalled', () => {
  deferredPwaPrompt = null;
  console.log('[PWA] Aplicativo instalado com sucesso no dispositivo!');
  showToast('🎉 Eldorado Pesca instalado com sucesso!', 'success');
});

function triggerInstallApp(type) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  if (type === 'mobile') {
    try {
      localStorage.setItem('ELDORADO_MOBILE_INSTALLED', 'true');
      localStorage.setItem('ELDORADO_PWA_INSTALLED', 'true');
      if (window.authManager) {
        const orgId = window.authManager.getOrganizationId();
        if (orgId) {
          localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', orgId);
          window.history.replaceState({}, '', './?source=pwa&mode=standalone&platform=mobile&orgId=' + encodeURIComponent(orgId));
        }
      }
    } catch (e) {}
  } else if (type === 'desktop') {
    try {
      localStorage.setItem('ELDORADO_DESKTOP_INSTALLED', 'true');
      localStorage.setItem('ELDORADO_PWA_INSTALLED', 'true');
      if (window.authManager) {
        const orgId = window.authManager.getOrganizationId();
        if (orgId) {
          localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', orgId);
          window.history.replaceState({}, '', './?source=pwa&mode=standalone&platform=desktop&orgId=' + encodeURIComponent(orgId));
        }
      }
    } catch (e) {}

    if (window.__ELDORADO_IS_ELECTRON || (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Electron'))) {
      showToast('Você já está no aplicativo oficial Desktop da Eldorado Pesca!', 'success');
      proceedToDashboard();
      return;
    }
  }

  if (isStandalone) {
    showToast('Você já está utilizando a versão instalada!', 'info');
    proceedToDashboard();
    return;
  }

  if (isIOS) {
    const guide = document.getElementById('iosInstallGuide');
    if (guide) {
      guide.style.display = guide.style.display === 'none' ? 'block' : 'none';
      if (guide.style.display === 'block') {
        guide.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    return;
  }

  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('Instalando Eldorado Pesca no seu dispositivo...', 'success');
        proceedToDashboard();
      }
      deferredPwaPrompt = null;
    });
  } else {
    if (type === 'mobile') {
      showToast('No Chrome do celular: Toque nos 3 pontinhos (⋮) no topo e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".', 'info', 8000);
    } else {
      showToast('No computador: Abra pelo executável oficial "Eldorado Pesca.exe" na Área de Trabalho ou instale pelo menu do Chrome.', 'info', 8000);
      proceedToDashboard();
    }
  }
}
window.triggerInstallApp = triggerInstallApp;

// Controle de Visibilidade de Senha
window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = '🙈';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '👁️';
  }
};

// Controle do Login e Recuperação de Senha
let isGateRecoverMode = false;
function toggleGateRecover() {
  isGateRecoverMode = !isGateRecoverMode;
  const passGroup = document.getElementById('groupGatePassword');
  const passInput = document.getElementById('gatePasswordInput');
  const btnSubmit = document.getElementById('btnSubmitGateAuth');
  const subtitle = document.getElementById('gateSubtitleText');
  const linkToggle = document.getElementById('linkToggleRecover');
  const errDiv = document.getElementById('gateErrorMessage');
  if (errDiv) errDiv.style.display = 'none';

  if (isGateRecoverMode) {
    if (passGroup) passGroup.style.display = 'none';
    if (passInput) passInput.removeAttribute('required');
    if (btnSubmit) btnSubmit.textContent = 'Enviar Link de Recuperação ➔';
    if (subtitle) subtitle.textContent = 'Digite seu e-mail para receber as instruções de recuperação';
    if (linkToggle) linkToggle.textContent = 'Voltar para a tela de login';
  } else {
    if (passGroup) passGroup.style.display = 'block';
    if (passInput) passInput.setAttribute('required', 'required');
    if (btnSubmit) btnSubmit.textContent = 'Entrar no Sistema ➔';
    if (subtitle) subtitle.textContent = 'Acesse o sistema de gestão com suas credenciais';
    if (linkToggle) linkToggle.textContent = 'Esqueceu sua senha? Clique aqui';
  }
}
window.toggleGateRecover = toggleGateRecover;

function openAccessHub() {
  const postHub = document.getElementById('postLoginHubScreen');
  if (postHub) {
    const org = window.authManager ? (typeof window.authManager.getCurrentOrganization === 'function' ? window.authManager.getCurrentOrganization() : window.authManager.currentOrg) : null;
    const orgNameEl = document.getElementById('hubWelcomeOrgName');
    if (orgNameEl && org) {
      orgNameEl.innerHTML = `${escapeHtml(org.name || 'ELDORADO PESCA')} <span class="brand-gold-tag">PRO</span>`;
    }
    postHub.style.display = 'flex';
  }
}
window.openAccessHub = openAccessHub;

function proceedToDashboard() {
  const postHub = document.getElementById('postLoginHubScreen');
  if (postHub) postHub.style.display = 'none';
  const gateScreen = document.getElementById('authGateScreen');
  if (gateScreen) gateScreen.style.display = 'none';
  document.documentElement.classList.remove('show-auth-gate');
  sessionStorage.setItem('ELDORADO_POST_LOGIN_DONE', 'true');
}
window.proceedToDashboard = proceedToDashboard;

async function handleGateAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('gateEmailInput').value.trim();
  const password = document.getElementById('gatePasswordInput') ? document.getElementById('gatePasswordInput').value : '';
  const errDiv = document.getElementById('gateErrorMessage');
  const btnSubmit = document.getElementById('btnSubmitGateAuth');

  if (errDiv) errDiv.style.display = 'none';
  if (btnSubmit) btnSubmit.disabled = true;

  try {
    if (!isGateRecoverMode) {
      await window.authManager.login(email, password);
      showToast('Login realizado com sucesso!', 'success');

      // Transição direta para a tela dos 3 botões (Web / Mobile / PC) sem piscar o painel
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      const postHub = document.getElementById('postLoginHubScreen');
      const gateScreen = document.getElementById('authGateScreen');

      if (!isStandalone && postHub) {
        const org = window.authManager ? (typeof window.authManager.getCurrentOrganization === 'function' ? window.authManager.getCurrentOrganization() : window.authManager.currentOrg) : null;
        const orgNameEl = document.getElementById('hubWelcomeOrgName');
        if (orgNameEl && org) {
          orgNameEl.innerHTML = `${escapeHtml(org.name || 'ELDORADO PESCA')} <span class="brand-gold-tag">PRO</span>`;
        }
        postHub.style.display = 'flex';
        document.documentElement.classList.remove('show-auth-gate');
        if (gateScreen) gateScreen.style.display = 'none';
      } else {
        document.documentElement.classList.remove('show-auth-gate');
        if (gateScreen) gateScreen.style.display = 'none';
        proceedToDashboard();
      }

      await initAppState();
      renderAll();
    } else {
      await window.authManager.recoverPassword(email);
      showToast('Link de recuperação enviado! Verifique seu e-mail.', 'info');
      toggleGateRecover();
    }
  } catch (err) {
    console.error('[Auth Error]', err);
    if (errDiv) {
      errDiv.textContent = err.message || 'Erro na autenticação. Verifique seus dados.';
      errDiv.style.display = 'block';
    }
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
}

async function handleGoogleLogin() {
  const errDiv = document.getElementById('gateErrorMessage');
  if (errDiv) errDiv.style.display = 'none';
  try {
    showToast('Redirecionando para login com o Google...', 'info');
    await window.authManager.loginWithGoogle();
  } catch (err) {
    console.error('[Google Auth Error]', err);
    if (errDiv) {
      errDiv.textContent = err.message || 'Erro ao conectar com o Google.';
      errDiv.style.display = 'block';
    }
    showToast('Falha no login com Google. Verifique a configuração.', 'error');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmailInput').value.trim();
  const password = document.getElementById('authPasswordInput').value;
  const orgName = document.getElementById('authOrgNameInput') ? document.getElementById('authOrgNameInput').value.trim() : '';
  const inviteToken = document.getElementById('authInviteTokenInput') ? document.getElementById('authInviteTokenInput').value.trim() : '';
  const errDiv = document.getElementById('authErrorMessage');
  const btnSubmit = document.getElementById('btnSubmitAuth');

  if (errDiv) errDiv.style.display = 'none';
  if (btnSubmit) btnSubmit.disabled = true;

  try {
    if (currentAuthTab === 'login') {
      await window.authManager.login(email, password);
      showToast('Login realizado com sucesso!', 'success');
      closeModal('modalAuth');
    } else if (currentAuthTab === 'register') {
      await window.authManager.register(email, password, orgName, inviteToken);
      showToast('Conta criada com sucesso!', 'success');
      closeModal('modalAuth');
    } else {
      await window.authManager.recoverPassword(email);
      showToast('Instruções de recuperação enviadas para seu e-mail!', 'info');
      closeModal('modalAuth');
    }
    await initAppState();
    renderAll();
  } catch (err) {
    console.error('[Auth Error]', err);
    if (errDiv) {
      errDiv.textContent = err.message || 'Erro na autenticação. Verifique os dados.';
      errDiv.style.display = 'block';
    }
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
}

async function handleResetPasswordSubmit(e) {
  e.preventDefault();
  const newPass = document.getElementById('inputNewPassword').value;
  const confirmPass = document.getElementById('inputConfirmNewPassword').value;
  const errDiv = document.getElementById('resetPassErrorMessage');
  const btnSubmit = document.getElementById('btnSubmitResetPass');

  if (errDiv) errDiv.style.display = 'none';

  if (newPass !== confirmPass) {
    if (errDiv) {
      errDiv.textContent = 'As senhas não coincidem. Digite novamente.';
      errDiv.style.display = 'block';
    }
    return;
  }

  if (btnSubmit) btnSubmit.disabled = true;

  try {
    await window.authManager.updatePassword(newPass);
    showToast('Senha redefinida com sucesso! Você já está conectado.', 'success');
    closeModal('modalResetPassword');
    await initAppState();
    renderAll();
  } catch (err) {
    console.error('[Reset Password Error]', err);
    if (errDiv) {
      errDiv.textContent = err.message || 'Falha ao redefinir a senha.';
      errDiv.style.display = 'block';
    }
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
}

function openInviteMemberModal() {
  document.getElementById('inviteMemberEmail').value = '';
  const resultBox = document.getElementById('inviteResultContainer');
  if (resultBox) resultBox.style.display = 'none';
  const errDiv = document.getElementById('inviteErrorMessage');
  if (errDiv) errDiv.style.display = 'none';
  openModal('modalInviteMember');
}

async function handleCreateInviteSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('inviteMemberEmail').value.trim();
  const role = document.getElementById('inviteMemberRole').value;
  const errDiv = document.getElementById('inviteErrorMessage');
  const btnSubmit = document.getElementById('btnSubmitInvite');
  const resultBox = document.getElementById('inviteResultContainer');
  const tokenDisplay = document.getElementById('inviteTokenDisplay');

  if (errDiv) errDiv.style.display = 'none';
  if (btnSubmit) btnSubmit.disabled = true;

  const orgId = window.authManager ? window.authManager.getOrganizationId() : null;
  if (!orgId) {
    if (errDiv) {
      errDiv.textContent = 'Organização não encontrada.';
      errDiv.style.display = 'block';
    }
    if (btnSubmit) btnSubmit.disabled = false;
    return;
  }

  try {
    const { data, error } = await window.supabaseClient
      .from('organization_invites')
      .insert({
        organization_id: orgId,
        email: email,
        role: role,
        created_by: window.authManager.user.id
      })
      .select('token')
      .single();

    if (error) throw error;

    if (tokenDisplay) tokenDisplay.textContent = data.token;
    if (resultBox) resultBox.style.display = 'block';
    showToast('Convite gerado com sucesso!', 'success');
  } catch (err) {
    console.error('[Invite Error]', err);
    if (errDiv) {
      errDiv.textContent = err.message || 'Erro ao gerar convite.';
      errDiv.style.display = 'block';
    }
  } finally {
    if (btnSubmit) btnSubmit.disabled = false;
  }
}

function copyInviteToClipboard() {
  const token = document.getElementById('inviteTokenDisplay').textContent.trim();
  if (!token) return;

  const inviteMsg = `Você foi convidado para a equipe ${window.authManager.getOrganizationName()} no Eldorado Pesca PRO! Use o código de convite abaixo ao criar sua conta:\n\nCódigo: ${token}\n\nAcesse: ${window.location.origin}`;
  navigator.clipboard.writeText(inviteMsg).then(() => {
    showToast('Mensagem de convite copiada!', 'success');
  });
}

async function handleUserLogout() {
  if (window.authManager) {
    document.documentElement.classList.add('show-auth-gate');
    await window.authManager.logout();
    showToast('Você saiu da sua conta.', 'info');
    updateAuthUi();
    closeModal('modalAuth');
    await initAppState();
    renderAll();
  }
}

async function onSwitchOrganization(orgId) {
  if (window.authManager) {
    const match = window.authManager.organizations.find(o => o.id === orgId);
    if (match) {
      window.authManager.currentOrg = match;
      localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', match.id);
      showToast(`Organização alterada para: ${match.name}`, 'success');
      updateAuthUi();
      await initAppState();
      renderAll();
    }
  }
}

// Central de Sincronização e Conflitos descontinuada em prol de sincronização transparente direta

function getActiveRaffle() {
  if (!appData.raffles || appData.raffles.length === 0) return null;
  let raffle = null;
  if (activeRaffleId) {
    const found = appData.raffles.find(r => String(r.id) === String(activeRaffleId));
    if (found) raffle = found;
  }
  if (!raffle) {
    const highest = getHighestRaffle(appData.raffles);
    if (highest) {
      activeRaffleId = highest.id;
      raffle = highest;
    } else {
      raffle = appData.raffles[0];
    }
  }
  if (raffle && typeof normalizeRaffle === 'function') {
    raffle = normalizeRaffle(raffle);
  }
  return raffle;
}

function onSelectActiveRaffle(raffleId) {
  if (!raffleId) return;
  userSelectedRaffleExplicitly = true;
  activeRaffleId = String(raffleId);
  renderRaffleView();
  updateGlobalStats();
}

/* ==========================================================================
   Render Orchestration
   ========================================================================== */
function renderBackupView() {
  updateAuthUi();
}
window.renderBackupView = renderBackupView;

function renderTab(tabId) {
  const target = tabId || activeTab || "tab-rifas";
  switch (target) {
    case "tab-rifas":
      renderRaffleDropdown();
      renderRaffleView();
      break;
    case "tab-vales":
      renderValesView();
      break;
    case "tab-agenda":
      renderFishingAgendaView();
      break;
    case "tab-instagram":
      renderInstagramView();
      break;
    case "tab-rancho":
      renderRanchoView();
      break;
    case "tab-boletos":
      renderBoletosView();
      break;
    case "tab-eduardo":
      renderEduardoView();
      break;
    case "tab-backup":
      renderBackupView();
      break;
    default:
      renderRaffleDropdown();
      renderRaffleView();
      break;
  }
}
window.renderTab = renderTab;

function renderAll(forceAll = false) {
  updateGlobalStats();
  if (forceAll) {
    renderRaffleDropdown();
    renderRaffleView();
    renderValesView();
    renderFishingAgendaView();
    renderInstagramView();
    renderRanchoView();
    renderBoletosView();
    renderEduardoView();
    renderBackupView();
  } else {
    renderTab(activeTab);
  }
}
window.renderAll = renderAll;

/* ==========================================================================
   Raffle Stats Bar (Exclusivo da aba de Rifas)
   ========================================================================== */
function updateGlobalStats() {
  const raffle = getActiveRaffle();
  const statRevenueEl = document.getElementById("statRaffleRevenue");
  const statPaidEl = document.getElementById("statRafflePaidCount");
  const statReservedEl = document.getElementById("statRaffleReservedCount");
  const statAvailEl = document.getElementById("statRaffleAvailableCount");
  const statPercentEl = document.getElementById("statRafflePercent");
  const statStatusTextEl = document.getElementById("statRaffleStatusText");
  
  if (raffle && Array.isArray(raffle.numbers)) {
    const paidCount = raffle.numbers.filter(n => n.status === "paid").length;
    const reservedCount = raffle.numbers.filter(n => n.status === "reserved").length;
    const availableCount = raffle.numbers.filter(n => n.status === "available").length;
    const totalRevenue = paidCount * (raffle.pricePerNumber || 0);
    const percentPaid = raffle.totalNumbers > 0 ? Math.round((paidCount / raffle.totalNumbers) * 100) : 0;

    if (statRevenueEl) statRevenueEl.textContent = formatCurrency(totalRevenue);
    if (statPaidEl) statPaidEl.textContent = `${paidCount} de ${raffle.totalNumbers} números pagos`;
    if (statReservedEl) statReservedEl.textContent = `${reservedCount} cotas`;
    if (statAvailEl) statAvailEl.textContent = `${availableCount} números livres`;
    if (statPercentEl) statPercentEl.textContent = `${percentPaid}%`;
    if (statStatusTextEl) {
      statStatusTextEl.textContent = raffle.status === 'completed' ? 'Ação Finalizada' : 'Ação Ativa';
    }
  } else {
    if (statRevenueEl) statRevenueEl.textContent = "R$ 0,00";
    if (statPaidEl) statPaidEl.textContent = "0 números pagos";
    if (statReservedEl) statReservedEl.textContent = "0 cotas";
    if (statAvailEl) statAvailEl.textContent = "0 números livres";
    if (statPercentEl) statPercentEl.textContent = "0%";
    if (statStatusTextEl) statStatusTextEl.textContent = "Sem Ação";
  }

  // Vales & Prêmios Counter Badge in Header
  const activeVales = (appData.valesAndPrizes || []).filter(v => v.type === "vale_compras" && v.status === "active");
  const pendingPrizes = (appData.valesAndPrizes || []).filter(v => v.type === "premio_fisico" && v.status === "pending_pickup");
  const badgeVales = document.getElementById("badgePendingVales");
  if (badgeVales) badgeVales.textContent = activeVales.length + pendingPrizes.length;

  // Fishing Bookings Counter Badge in Header
  const activeFishing = (appData.fishingBookings || []).filter(b => b.status === "scheduled");
  const badgeFishing = document.getElementById("badgePendingFishing");
  if (badgeFishing) badgeFishing.textContent = activeFishing.length;
}

/* ==========================================================================
   TAB 1: GESTÃO DE RIFAS / AÇÕES WHATSAPP & HISTÓRICO
   ========================================================================== */
function renderRaffleDropdown() {
  const selectEl = document.getElementById("selectActiveRaffle");
  if (!selectEl) return;

  selectEl.innerHTML = "";

  if (!appData.raffles || appData.raffles.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nenhuma ação cadastrada";
    selectEl.appendChild(opt);
    return;
  }

  (appData.raffles || []).forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    const cleanTitle = (r.title || "Ação").replace(/\s*\((?:ativa|ativas|finalizada|finalizadas)\)/gi, "").trim();
    opt.textContent = `${cleanTitle} - ${r.totalNumbers} Cotas`;
    if (String(r.id) === String(activeRaffleId)) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });

  if (activeRaffleId) {
    selectEl.value = activeRaffleId;
  }
}

function renderRaffleView() {
  const raffle = getActiveRaffle();
  const titleEl = document.getElementById("raffleDisplayTitle");
  const badgeEl = document.getElementById("raffleBadge");
  const priceEl = document.getElementById("rafflePriceDisplay");
  const rulesEl = document.getElementById("raffleRulesSummary");
  const countEl = document.getElementById("gridNumbersSummary");
  const prizesListEl = document.getElementById("rafflePrizesList");
  const gridEl = document.getElementById("raffleNumbersGrid");
  const actionsCard = document.getElementById("raffleActionsCard");

  if (!raffle) {
    if (titleEl) titleEl.textContent = "Nenhuma Ação Cadastrada";
    if (badgeEl) badgeEl.textContent = "SEM AÇÃO";
    if (priceEl) priceEl.textContent = "R$ 0,00";
    if (rulesEl) rulesEl.textContent = "Clique em '+ Nova Ação' para iniciar uma rifa.";
    if (countEl) countEl.textContent = "Total: 0 números";
    if (prizesListEl) prizesListEl.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-dim);">Nenhum prêmio cadastrado.</div>`;
    if (gridEl) gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 3rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-gold);">Nenhuma rifa disponível. Clique no botão '+ Nova Ação' para criar uma nova rifa.</div>`;
    if (actionsCard) actionsCard.style.display = "none";
    return;
  }

  // Header Details
  const cleanTitle = (raffle.title || "Ação Eldorado Pesca").replace(/\s*\((?:ativa|ativas|finalizada|finalizadas)\)/gi, "").trim();
  if (titleEl) titleEl.textContent = cleanTitle;
  if (badgeEl) badgeEl.textContent = raffle.subtitle || "AÇÃO RÁPIDA";
  if (priceEl) priceEl.textContent = formatCurrency(raffle.pricePerNumber || 25);
  if (rulesEl) rulesEl.textContent = `Frete a parte - Envio para todo o Brasil.`;
  if (countEl) countEl.textContent = `Total: ${raffle.totalNumbers} números`;

  if (actionsCard) {
    actionsCard.style.display = "block";
  }

  // Render Prizes Sidebar
  if (prizesListEl) {
    prizesListEl.innerHTML = "";
  }

  if (raffle.prizes && raffle.prizes.length > 0) {
    raffle.prizes.forEach((prize, idx) => {
      const prizeDiv = document.createElement("div");
      prizeDiv.className = "prize-item";
      
      let winnerInfo = "";
      if (prize.winnerNumber) {
        winnerInfo = `<div style="font-size: 0.75rem; color: var(--primary-gold); font-weight: 800; margin-top: 0.25rem;">
          Ganhador: #${prize.winnerNumber} - ${prize.winnerName || ''}
        </div>`;
      }

      prizeDiv.innerHTML = `
        <div class="prize-pos">${prize.position || (idx + 1)}º</div>
        <div style="flex-grow: 1;">
          <div class="prize-desc">${escapeHtml(prize.description)}</div>
          ${winnerInfo}
        </div>
      `;
      prizesListEl.appendChild(prizeDiv);
    });
  } else if (raffle._prizesLoadError) {
    prizesListEl.innerHTML = `<div style="font-size: 0.8rem; color: #f59e0b; padding: 0.5rem; background: rgba(245, 158, 11, 0.1); border-radius: 4px;">⚠️ Prêmios indisponíveis offline no momento.</div>`;
  } else {
    prizesListEl.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-dim);">Nenhum prêmio cadastrado nesta ação.</div>`;
  }

  // Render Number Grid
  renderRaffleNumbersGrid();
}

/* Global Multi-Cota State */
let isGridMultiSelectMode = false;
let gridSelectedCotas = new Set();
let modalSelectedCotas = new Set();
let modalPrimaryIndex = 0;
let isMiniGridOpen = false;

function toggleGridMultiSelectMode() {
  isGridMultiSelectMode = !isGridMultiSelectMode;
  const btn = document.getElementById("btnToggleMultiSelectGrid");
  const icon = document.getElementById("multiSelectToggleIcon");
  const label = document.getElementById("multiSelectToggleLabel");
  const bar = document.getElementById("gridMultiSelectActionBar");

  if (isGridMultiSelectMode) {
    if (btn) btn.classList.add("active");
    if (icon) icon.textContent = "✓";
    if (label) label.textContent = "Modo Seleção Ativo";
    if (bar) bar.style.display = "flex";
    updateGridMultiSelectBar();
  } else {
    if (btn) btn.classList.remove("active");
    if (icon) icon.textContent = "☑";
    if (label) label.textContent = "Seleção Múltipla";
    if (bar) bar.style.display = "none";
    gridSelectedCotas.clear();
  }
  renderRaffleNumbersGrid();
}

function updateGridMultiSelectBar() {
  const bar = document.getElementById("gridMultiSelectActionBar");
  const badge = document.getElementById("gridSelectedCountBadge");
  const text = document.getElementById("gridSelectedListText");
  const btnOpen = document.getElementById("btnOpenModalMulti");

  const count = gridSelectedCotas.size;
  if (badge) badge.textContent = `${count} ${count === 1 ? 'cota selecionada' : 'cotas selecionadas'}`;

  if (count === 0) {
    if (text) text.textContent = "Clique nos números da grade para selecionar";
    if (btnOpen) btnOpen.disabled = true;
  } else {
    const sortedNums = Array.from(gridSelectedCotas).sort((a, b) => a - b);
    if (text) text.textContent = sortedNums.map(n => `#${n}`).join(", ");
    if (btnOpen) btnOpen.disabled = false;
  }
}

function clearGridMultiSelection() {
  gridSelectedCotas.clear();
  updateGridMultiSelectBar();
  renderRaffleNumbersGrid();
}

function openModalWithGridSelection() {
  if (gridSelectedCotas.size === 0) {
    showToast("Selecione pelo menos uma cota na grade.", "warning");
    return;
  }
  const numsArray = Array.from(gridSelectedCotas).sort((a, b) => a - b);
  openEditNumberModal(numsArray);
}

function renderRaffleNumbersGrid() {
  const raffle = getActiveRaffle();
  const gridEl = document.getElementById("raffleNumbersGrid");
  if (!raffle || !gridEl) return;

  const searchTerm = (document.getElementById("inputSearchRaffle") ? document.getElementById("inputSearchRaffle").value : "").toLowerCase().trim();

  const numbersList = Array.isArray(raffle.numbers) ? raffle.numbers : [];
  if (numbersList.length === 0) {
    gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 2rem;">Nenhum número cadastrado nesta ação.</div>`;
    return;
  }

  // Mapa de prêmios para lookup O(1) imediato
  const prizeMap = new Map();
  if (Array.isArray(raffle.prizes)) {
    for (let i = 0; i < raffle.prizes.length; i++) {
      const p = raffle.prizes[i];
      if (p && p.winnerNumber != null) {
        prizeMap.set(p.winnerNumber, p);
      }
    }
  }

  let html = "";
  for (let index = 0; index < numbersList.length; index++) {
    const item = numbersList[index];

    // Search Filter
    if (searchTerm) {
      const matchNum = item.num.toString().includes(searchTerm);
      const matchName = (item.name || "").toLowerCase().includes(searchTerm);
      if (!matchNum && !matchName) continue;
    }

    const isSelected = gridSelectedCotas.has(item.num);
    const wonPrize = prizeMap.get(item.num);
    const winnerClass = wonPrize ? ` is-winner winner-pos-${wonPrize.position || 1}` : "";
    const selectedClass = isSelected ? " multi-selected" : "";

    let statusTag = "";
    if (item.status === "paid") {
      statusTag = `<span class="num-status-tag" title="Pago" style="color: var(--status-paid-text);">Pago</span>`;
    } else if (item.status === "reserved") {
      statusTag = `<span class="num-status-tag tag-reserved" title="Reservado" style="color: var(--primary-gold);"><span class="status-text-full">Reservado</span><span class="status-text-short">Res.</span></span>`;
    }

    const tileTitle = wonPrize ? ` title="${wonPrize.position || 1}º Lugar: ${escapeHtml(item.name || 'Ganhador')}"` : "";
    const nameTitle = item.name ? escapeHtml(item.name) : 'Livre';
    const nameDisplay = item.name ? escapeHtml(item.name) : '—';

    html += `
      <div class="num-tile ${item.status}${winnerClass}${selectedClass}" data-index="${index}" data-num="${item.num}"${tileTitle}>
        <div class="num-tile-top">
          <span class="num-badge">#${item.num}</span>
          ${statusTag}
        </div>
        <div class="num-name" title="${nameTitle}">
          ${nameDisplay}
        </div>
      </div>
    `;
  }

  gridEl.innerHTML = html;
}

/* Modal: Editar Número Individual ou Múltiplas Cotas & Definir Ganhador Físico */
function openEditNumberModal(target) {
  const raffle = getActiveRaffle();
  if (!raffle || !Array.isArray(raffle.numbers)) return;

  modalSelectedCotas.clear();

  let firstIndex = 0;
  if (Array.isArray(target)) {
    // Array of numbers or indices
    target.forEach(val => {
      const numVal = parseInt(val, 10);
      const matchItem = raffle.numbers.find(n => n.num === numVal);
      if (matchItem) {
        modalSelectedCotas.add(matchItem.num);
      }
    });
    if (modalSelectedCotas.size > 0) {
      const firstNum = Array.from(modalSelectedCotas)[0];
      firstIndex = raffle.numbers.findIndex(n => n.num === firstNum);
    }
  } else {
    // Single index or number
    const idx = parseInt(target, 10);
    if (!isNaN(idx) && raffle.numbers[idx]) {
      firstIndex = idx;
      modalSelectedCotas.add(raffle.numbers[idx].num);
    } else {
      const matchItem = raffle.numbers.find(n => n.num === idx);
      if (matchItem) {
        firstIndex = raffle.numbers.findIndex(n => n.num === matchItem.num);
        modalSelectedCotas.add(matchItem.num);
      }
    }
  }

  if (modalSelectedCotas.size === 0 && raffle.numbers.length > 0) {
    modalSelectedCotas.add(raffle.numbers[0].num);
    firstIndex = 0;
  }

  modalPrimaryIndex = firstIndex >= 0 ? firstIndex : 0;
  const primaryItem = raffle.numbers[modalPrimaryIndex] || raffle.numbers[0];

  document.getElementById("editNumIndex").value = modalPrimaryIndex;
  document.getElementById("editNumName").value = primaryItem.name || "";
  const inputExtra = document.getElementById("inputAddExtraCota");
  if (inputExtra) inputExtra.value = "";

  selectEditStatus(primaryItem.status || "available");

  // Populate dynamic prize dropdown
  const selectPrizeEl = document.getElementById("selectAssignPrize");
  if (selectPrizeEl) {
    selectPrizeEl.innerHTML = "";
    if (raffle.prizes && raffle.prizes.length > 0) {
      raffle.prizes.forEach((p, idx) => {
        const pos = p.position || (idx + 1);
        const opt = document.createElement("option");
        opt.value = pos;
        opt.textContent = `${pos}º Prêmio: ${p.description}`;
        selectPrizeEl.appendChild(opt);
      });
    } else {
      const opt = document.createElement("option");
      opt.value = 1;
      opt.textContent = `1º Prêmio`;
      selectPrizeEl.appendChild(opt);
    }
  }

  // Ensure mini-grid drawer starts in remembered state
  const miniGridContainer = document.getElementById("modalCotasMiniGridContainer");
  const toggleText = document.getElementById("miniGridToggleText");
  if (miniGridContainer) {
    miniGridContainer.style.display = isMiniGridOpen ? "block" : "none";
  }
  if (toggleText) {
    toggleText.textContent = isMiniGridOpen ? "Ocultar Grade ▴" : "Ver Grade de Cotas ▾";
  }

  renderModalSelectedCotas();
  openModal("modalEditNumber");
}

let currentEditStatus = "available";
function selectEditStatus(status) {
  currentEditStatus = status;
  
  const btnAvail = document.getElementById("btnStatusAvailable");
  const btnRes = document.getElementById("btnStatusReserved");
  const btnPaid = document.getElementById("btnStatusPaid");

  if (btnAvail) btnAvail.className = "status-toggle-btn" + (status === "available" ? " selected-available" : "");
  if (btnRes) btnRes.className = "status-toggle-btn" + (status === "reserved" ? " selected-reserved" : "");
  if (btnPaid) btnPaid.className = "status-toggle-btn" + (status === "paid" ? " selected-paid" : "");

  renderModalSelectedCotas();
}

function renderModalSelectedCotas() {
  const raffle = getActiveRaffle();
  if (!raffle) return;

  const chipsContainer = document.getElementById("cotaChipsContainer");
  const countBadge = document.getElementById("modalNumCountBadge");
  const summaryCount = document.getElementById("modalSummaryCountText");
  const summaryAmount = document.getElementById("modalSummaryAmountText");
  const btnSaveText = document.getElementById("btnSaveNumberModalText");
  const selectAssignWinnerCota = document.getElementById("selectAssignWinnerCota");

  const count = modalSelectedCotas.size;
  const sortedNums = Array.from(modalSelectedCotas).sort((a, b) => a - b);

  // Update header count badge
  if (countBadge) {
    countBadge.textContent = `${count} ${count === 1 ? 'cota' : 'cotas'}`;
  }

  // Render chips
  if (chipsContainer) {
    chipsContainer.innerHTML = "";
    sortedNums.forEach(num => {
      const chip = document.createElement("span");
      chip.className = "cota-chip";
      chip.innerHTML = `
        <span class="cota-chip-num">#${num}</span>
        ${count > 1 ? `<button type="button" class="cota-chip-remove" onclick="removeCotaFromModalSelection(${num})" title="Remover cota #${num} deste cadastro">✕</button>` : ''}
      `;
      chipsContainer.appendChild(chip);
    });
  }

  // Financial summary
  const pricePer = raffle.pricePerNumber || 0;
  const totalAmount = count * pricePer;
  
  if (summaryCount) {
    summaryCount.textContent = `${count} ${count === 1 ? 'cota selecionada' : 'cotas selecionadas'}`;
  }
  if (summaryAmount) {
    if (currentEditStatus === "available") {
      summaryAmount.textContent = `Status: Livre (R$ 0,00)`;
    } else {
      summaryAmount.textContent = `Total: ${formatCurrency(totalAmount)} (${formatCurrency(pricePer)} cada)`;
    }
  }

  // Save button dynamic text
  if (btnSaveText) {
    if (count === 1) {
      btnSaveText.textContent = "Salvar Dados da Cota";
    } else {
      const amountStr = currentEditStatus === "available" ? "" : ` (${formatCurrency(totalAmount)})`;
      btnSaveText.textContent = `Salvar ${count} Cotas${amountStr}`;
    }
  }

  // Populate Cota Sorteada dropdown
  if (selectAssignWinnerCota) {
    const currentVal = selectAssignWinnerCota.value;
    selectAssignWinnerCota.innerHTML = "";
    sortedNums.forEach(num => {
      const opt = document.createElement("option");
      opt.value = num;
      opt.textContent = `Cota #${num}`;
      selectAssignWinnerCota.appendChild(opt);
    });
    if (currentVal && modalSelectedCotas.has(parseInt(currentVal, 10))) {
      selectAssignWinnerCota.value = currentVal;
    }
  }

  // Detecta se há outras cotas disponíveis e oculta a adição rápida se não houver mais cotas livres
  const availCount = (raffle.numbers || []).filter(n => n.status === "available" && !modalSelectedCotas.has(n.num)).length;
  const addExtraSection = document.getElementById("groupAddExtraCotaSection");
  if (addExtraSection) {
    addExtraSection.style.display = availCount > 0 ? "block" : "none";
  }

  // Also update mini-grid if visible
  if (isMiniGridOpen) {
    renderModalMiniGrid();
  }
}

function addExtraCotasFromInput() {
  const input = document.getElementById("inputAddExtraCota");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const raffle = getActiveRaffle();
  if (!raffle || !Array.isArray(raffle.numbers)) return;

  // Split by comma, space, semicolon, dash
  const rawParts = text.split(/[\s,;]+/);
  let addedCount = 0;

  rawParts.forEach(part => {
    const cleanStr = part.replace(/[^\d]/g, '');
    const num = parseInt(cleanStr, 10);
    if (!isNaN(num) && num > 0) {
      const exists = raffle.numbers.find(n => n.num === num);
      if (exists) {
        if (!modalSelectedCotas.has(num)) {
          modalSelectedCotas.add(num);
          addedCount++;
        }
      }
    }
  });

  input.value = "";
  if (addedCount > 0) {
    renderModalSelectedCotas();
    showToast(`${addedCount} ${addedCount === 1 ? 'cota adicionada' : 'cotas adicionadas'} à seleção!`, "success");
  } else {
    showToast("Nenhuma nova cota válida encontrada para adicionar.", "warning");
  }
}

function addNextAvailableCotas(qty) {
  const raffle = getActiveRaffle();
  if (!raffle || !Array.isArray(raffle.numbers)) return;

  let added = 0;
  for (let i = 0; i < raffle.numbers.length && added < qty; i++) {
    const item = raffle.numbers[i];
    if (item.status === "available" && !modalSelectedCotas.has(item.num)) {
      modalSelectedCotas.add(item.num);
      added++;
    }
  }

  if (added > 0) {
    renderModalSelectedCotas();
    showToast(`+${added} ${added === 1 ? 'cota livre adicionada' : 'cotas livres adicionadas'}!`, "success");
  } else {
    showToast("Não há mais cotas livres disponíveis nesta ação.", "warning");
  }
}

function removeCotaFromModalSelection(num) {
  if (modalSelectedCotas.size <= 1) {
    showToast("Pelo menos uma cota deve permanecer selecionada.", "warning");
    return;
  }
  modalSelectedCotas.delete(num);
  renderModalSelectedCotas();
}

function resetModalSelectionToPrimary() {
  const raffle = getActiveRaffle();
  if (!raffle || !Array.isArray(raffle.numbers)) return;
  const primaryItem = raffle.numbers[modalPrimaryIndex] || raffle.numbers[0];
  modalSelectedCotas.clear();
  if (primaryItem) {
    modalSelectedCotas.add(primaryItem.num);
  }
  renderModalSelectedCotas();
  showToast("Seleção redefinida para a cota principal.", "info");
}

function toggleModalMiniGrid() {
  isMiniGridOpen = !isMiniGridOpen;
  const container = document.getElementById("modalCotasMiniGridContainer");
  const toggleText = document.getElementById("miniGridToggleText");
  if (container) {
    container.style.display = isMiniGridOpen ? "block" : "none";
  }
  if (toggleText) {
    toggleText.textContent = isMiniGridOpen ? "Ocultar Grade ▴" : "Ver Grade de Cotas ▾";
  }
  if (isMiniGridOpen) {
    renderModalMiniGrid();
  }
}

function renderModalMiniGrid() {
  const container = document.getElementById("modalCotasMiniGrid");
  if (!container || !isMiniGridOpen) return;

  const raffle = getActiveRaffle();
  if (!raffle || !Array.isArray(raffle.numbers)) return;

  container.innerHTML = "";
  raffle.numbers.forEach(item => {
    const isSelected = modalSelectedCotas.has(item.num);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mini-cota-item ${item.status}` + (isSelected ? " selected" : "");
    btn.textContent = `#${item.num}`;
    btn.title = `Cota #${item.num} (${item.status === 'available' ? 'Livre' : item.name || item.status})`;
    btn.onclick = () => toggleMiniGridNumber(item.num);
    container.appendChild(btn);
  });
}

function toggleMiniGridNumber(num) {
  if (modalSelectedCotas.has(num)) {
    if (modalSelectedCotas.size <= 1) {
      showToast("Pelo menos uma cota deve permanecer selecionada.", "warning");
      return;
    }
    modalSelectedCotas.delete(num);
  } else {
    modalSelectedCotas.add(num);
  }
  renderModalSelectedCotas();
}

async function saveNumberModal() {
  const raffle = getActiveRaffle();
  if (!raffle || !Array.isArray(raffle.numbers)) return;

  const name = document.getElementById("editNumName").value.trim().toUpperCase();
  const selectedNums = Array.from(modalSelectedCotas);

  if (selectedNums.length === 0) {
    showToast("Nenhuma cota selecionada.", "warning");
    return;
  }

  const nowIso = new Date().toISOString();
  let updatedItems = [];

  selectedNums.forEach(num => {
    const item = raffle.numbers.find(n => n.num === num);
    if (item) {
      item.status = currentEditStatus;
      item.name = (currentEditStatus === "available") ? "" : name;
      item.reservedAt = (currentEditStatus === "reserved") ? (item.reservedAt || nowIso) : null;
      item.paidAt = (currentEditStatus === "paid") ? (item.paidAt || nowIso) : null;
      updatedItems.push(item);
    }
  });

  // Salva no IndexedDB e enfileira na Outbox Sync Queue com RPC atômica (com allowOverride: true para edições administrativas)
  await saveState({
    type: "SELL_NUMBERS",
    tableName: "raffle_numbers",
    recordId: raffle.id,
    payload: {
      raffleId: raffle.id,
      numbers: selectedNums,
      status: currentEditStatus,
      buyerName: (currentEditStatus === "available") ? "" : name,
      reservedAt: (currentEditStatus === "reserved") ? (nowIso) : null,
      paidAt: (currentEditStatus === "paid") ? (nowIso) : null,
      allowOverride: true
    }
  });

  renderRaffleNumbersGrid();
  updateGlobalStats();
  closeModal("modalEditNumber");

  // Clear grid multi-select if it was active
  if (gridSelectedCotas.size > 0) {
    gridSelectedCotas.clear();
    updateGridMultiSelectBar();
  }

  const numsLabel = selectedNums.sort((a, b) => a - b).map(n => `#${n}`).join(", ");
  if (selectedNums.length === 1) {
    showToast(`Cota ${numsLabel} atualizada com sucesso!`, "success");
  } else {
    showToast(`${selectedNums.length} cotas (${numsLabel}) salvas com sucesso!`, "success");
  }
}

/* Sorteio Físico na Loja: Definir Cota como Ganhadora e Sincronizar com Vales & Prêmios */
async function assignPrizeWinner() {
  const raffle = getActiveRaffle();
  if (!raffle || !Array.isArray(raffle.numbers)) return;

  const winnerCotaEl = document.getElementById("selectAssignWinnerCota");
  const selectedCotaNum = winnerCotaEl ? parseInt(winnerCotaEl.value, 10) : null;
  const targetNum = !isNaN(selectedCotaNum) && selectedCotaNum > 0 ? selectedCotaNum : Array.from(modalSelectedCotas)[0];
  const item = raffle.numbers.find(n => n.num === targetNum) || raffle.numbers[modalPrimaryIndex];

  if (!item) {
    showToast("Cota não encontrada para sortear.", "error");
    return;
  }

  const winnerNameInput = document.getElementById("editNumName").value.trim();
  const winnerName = winnerNameInput || item.name || `Ganhador da Cota #${item.num}`;
  const position = parseInt(document.getElementById("selectAssignPrize").value, 10) || 1;

  // Find prize description
  const prizeObj = (raffle.prizes || []).find(p => p.position === position) || { position: position, description: `${position}º Prêmio` };
  const prizeDesc = (prizeObj.description || `${position}º Prêmio`).trim();
  const descUpper = prizeDesc.toUpperCase();

  // Mark in local state
  prizeObj.winnerNumber = item.num;
  prizeObj.winnerName = winnerName;
  item.status = "paid";
  item.name = winnerName;
  item.paidAt = item.paidAt || new Date().toISOString();

  // Extração inteligente e universal de tipo de prêmio e valor de vale (baseado em R$ e palavras-chave)
  const hasOu = /\bOU\b/i.test(descUpper);
  const hasVale = /VALE|VALE-COMPRAS|VALE COMPRAS|HAVER|CRÉDITO|CREDITO/i.test(descUpper);
  const hasPesca = /DIARIA|DIÁRIA|PESCA|LAGO|RANCHO|POUSADA/i.test(descUpper);

  let initialAmount = 0;
  
  // Padrão A: "R$ [valor] ... VALE" ou "R$ [valor] EM VALE"
  const matchRsBeforeVale = descUpper.match(/R\$\s*([\d\.\,]+)\s*(?:REAIS)?\s*(?:EM|NO|DE)?\s*VALE/i);
  if (matchRsBeforeVale) {
    const cleanNum = parseFloat(matchRsBeforeVale[1].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
  }

  // Padrão B: "VALE ... R$ [valor]"
  if (initialAmount === 0) {
    const matchRsAfterVale = descUpper.match(/VALE(?:\s*COMPRAS)?(?:\s*DE)?\s*R\$\s*([\d\.\,]+)/i);
    if (matchRsAfterVale) {
      const cleanNum = parseFloat(matchRsAfterVale[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
    }
  }

  // Padrão C: "OU R$ [valor]"
  if (initialAmount === 0 && hasOu) {
    const matchRsAfterOu = descUpper.match(/OU\s*R\$\s*([\d\.\,]+)/i);
    if (matchRsAfterOu) {
      const cleanNum = parseFloat(matchRsAfterOu[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
    }
  }

  // Padrão D: Sem R$, mas com "1000,00 EM VALE" ou "VALE 500"
  if (initialAmount === 0 && hasVale) {
    const matchNumBeforeVale = descUpper.match(/([\d\.\,]+)\s*(?:REAIS)?\s*EM\s*VALE/i);
    if (matchNumBeforeVale) {
      const cleanNum = parseFloat(matchNumBeforeVale[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
    }
  }

  if (initialAmount === 0 && hasVale) {
    const matchNumAfterVale = descUpper.match(/VALE(?:\s*COMPRAS)?(?:\s*DE)?\s*([\d\.\,]+)/i);
    if (matchNumAfterVale) {
      const cleanNum = parseFloat(matchNumAfterVale[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
    }
  }

  // Padrão E: Qualquer "R$ [valor]" presente se for identificado como opção de Vale
  if (initialAmount === 0 && (hasVale || hasOu)) {
    const allRsMatches = [...descUpper.matchAll(/R\$\s*([\d\.\,]+)/gi)];
    if (allRsMatches.length > 0) {
      const lastMatch = allRsMatches[allRsMatches.length - 1];
      const cleanNum = parseFloat(lastMatch[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
    }
  }

  if (initialAmount === 0 && hasPesca && hasVale) {
    initialAmount = 450.00;
  }

  let entryType = "premio_fisico";
  let entryStatus = "pending_pickup";
  let entryNotes = "Ganhador sorteado na loja";

  if (hasOu && (hasVale || initialAmount > 0)) {
    entryType = "dual_choice";
    entryStatus = "pending_choice";
    entryNotes = hasPesca 
      ? "Ganhador pendente de escolha (Diária de Pesca ou Vale-Compras)"
      : `Ganhador pendente de escolha (Prêmio Físico ou Vale-Compras de ${formatCurrency(initialAmount)})`;
  } else if (hasVale && !hasOu) {
    entryType = "vale_compras";
    entryStatus = "active";
    entryNotes = `Vale-Compras ativo de ${formatCurrency(initialAmount)}`;
  } else {
    entryType = "premio_fisico";
    entryStatus = "pending_pickup";
    entryNotes = "Aguardando retirada do prêmio físico na loja";
  }

  const newValeEntry = {
    id: "vp-" + Date.now(),
    customerName: winnerName,
    customerPhone: "",
    type: entryType,
    raffleRef: raffle.title,
    dateWon: getLocalDateStr(),
    initialAmount: initialAmount,
    currentBalance: initialAmount,
    description: `${position}º Lugar - ${prizeDesc} (Cota #${item.num})`,
    status: entryStatus,
    deliveredAt: null,
    transactions: [],
    notes: entryNotes
  };

  appData.valesAndPrizes.unshift(newValeEntry);
  
  // 1. Persiste o novo vale / prêmio na aba de Vales & Prêmios
  await saveState({
    type: "UPDATE_VALE",
    tableName: "vales_prizes",
    recordId: newValeEntry.id,
    payload: newValeEntry
  });

  // 2. Persiste a cota premiada como Paga com o nome do ganhador
  await saveState({
    type: "SELL_NUMBERS",
    tableName: "raffle_numbers",
    recordId: raffle.id,
    payload: {
      raffleId: raffle.id,
      numbers: [item.num],
      status: "paid",
      buyerName: winnerName,
      paidAt: item.paidAt,
      allowOverride: true
    }
  });

  // 3. Persiste a estrutura da rifa com o ganhador vinculado ao prêmio
  await saveState({
    type: "UPDATE_RAFFLE",
    tableName: "raffles",
    recordId: raffle.id,
    payload: raffle
  });

  renderRaffleView();
  renderValesView();
  renderFishingAgendaView();
  closeModal("modalEditNumber");
  
  if (entryType === "dual_choice") {
    const choiceText = hasPesca ? "Diária ou Vale" : "Prêmio Físico ou Vale";
    showToast(`Cota #${item.num} (${winnerName}) ganhou ${position}º Lugar! Pendente de escolha (${choiceText}) em Vales & Prêmios.`, "success");
  } else if (hasPesca) {
    showToast(`Cota #${item.num} (${winnerName}) ganhou ${position}º Lugar (${prizeDesc})! Disponível para agendamento na aba Agenda de Pesca!`, "success");
  } else {
    showToast(`Cota #${item.num} (${winnerName}) confirmada como ${position}º Lugar e enviada para a aba Vales e Prêmios!`, "success");
  }
}

/* Smart WhatsApp Importer */
function openImportWhatsAppModal() {
  document.getElementById("textareaWhatsAppImport").value = "";
  openModal("modalImportWhatsApp");
}

async function processWhatsAppImport() {
  const text = document.getElementById("textareaWhatsAppImport").value;
  if (!text.trim()) {
    showToast("Por favor, cole a mensagem do WhatsApp.", "warning");
    return;
  }

  const raffle = getActiveRaffle();
  const lines = text.split("\n");
  let updatedList = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const match = trimmed.match(/^(\d{1,4})\s*[-–—:]\s*(.*)$/) || trimmed.match(/^(\d{1,4})\s+(.*)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      let rawName = match[2].trim();

      if (num >= 1 && num <= raffle.numbers.length) {
        const item = raffle.numbers[num - 1];
        
        if (!rawName) {
          item.name = "";
          item.status = "available";
          item.reservedAt = null;
          item.paidAt = null;
        } else {
          const isPaid = rawName.includes("✅") || rawName.includes("✔") || rawName.includes("[PAGO]") || rawName.includes("(PAGO)");
          const cleanName = rawName.replace(/[✅✔]/g, "").replace(/\[PAGO\]|\(PAGO\)/gi, "").trim().toUpperCase();
          
          item.name = cleanName;
          item.status = isPaid ? "paid" : "reserved";
          if (isPaid) {
            item.paidAt = new Date().toISOString();
          } else {
            item.reservedAt = new Date().toISOString();
          }
        }
        updatedList.push(item);
      }
    }
  });

  await saveState({
    type: "BATCH_SET_NUMBERS",
    tableName: "raffle_numbers",
    recordId: raffle.id,
    payload: {
      raffleId: raffle.id,
      numbersList: updatedList
    }
  });
  renderRaffleNumbersGrid();
  closeModal("modalImportWhatsApp");
  showToast(`Importação concluída! ${updatedList.length} números atualizados no banco de dados.`, "success");
}

/* WhatsApp Formatted Exporter com Texto Padrão Completo do Grupo */
function openExportWhatsAppModal() {
  const raffle = getActiveRaffle();
  const text = generateWhatsAppText(raffle);
  
  document.getElementById("textareaWhatsAppExport").value = text;
  openModal("modalExportWhatsApp");
}

function generateWhatsAppText(raffle) {
  if (!raffle) return "";
  const r = (typeof normalizeRaffle === 'function') ? normalizeRaffle(raffle) : raffle;
  let output = `*${r.title || '107° AÇÃO ELDORADO PESCA'}*\n\n`;
  output += `*${r.subtitle || 'AÇÃO RÁPIDA '}*\n\n`;
  output += `LEIAM COM ATENÇÃO, MUITA ATENÇÃO!\n\n`;
  output += `OS NUMEROS SÓ FICARÃO DISPONIVEIS ATÉ 2️⃣ HORAS ⏰ APÓS O FECHAMENTO DA AÇÃO, SE NÃO OUVER PAGAMENTO VAMOS DISPONIBILIZAR NOVAMENTE PARA OS DEMAIS. \n\n`;
  output += `*NAO COPIAR E COLAR, APENAS FALAR O NÚMERO.*\n\n`;

  // Prizes
  if (r.prizes && r.prizes.length > 0) {
    r.prizes.forEach((p, i) => {
      output += `💥*${p.position || (i + 1)}°* ${p.description}\n\n`;
    });
  }

  output += `‼️*R$ ${r.pricePerNumber ? r.pricePerNumber.toFixed(2).replace('.', ',') : '25,00'} cada número*‼️\n\n`;
  output += `*Pix 42999162340* \n`;
  output += `ELDORADO PESCA LTDA\n\n`;
  output += `Frete a parte - Envio para todo o Brasil.\n\n`;
  output += ` Sorteio ao vivo no Instagram @lojaeldoradopesca\n\n`;
  output += `Mandar os números no grupo, mas o comprovante no privado 42 9 99162340 \n\n`;
  output += `Sorteio será quando o último número for pago, avisarei aqui no grupo.\n\n`;

  // Numbers list 1 to N
  (r.numbers || []).forEach(item => {
    if (item.status === "paid") {
      output += `${item.num}-${item.name}✅\n`;
    } else if (item.status === "reserved" && item.name) {
      output += `${item.num}-${item.name}\n`;
    } else {
      output += `${item.num}-\n`;
    }
  });

  return output;
}

function doCopyExportWhatsApp() {
  const textarea = document.getElementById("textareaWhatsAppExport");
  textarea.select();
  navigator.clipboard.writeText(textarea.value).then(() => {
    showToast("Lista copiada para a área de transferência!", "success");
  }).catch(() => {
    document.execCommand("copy");
    showToast("Texto copiado!", "success");
  });
}

/* ==========================================================================
   WhatsApp Cotas Livres / Disponíveis Exporter
   ========================================================================== */
let currentAvailableExportFormat = 'full';

function getAvailableRaffleNumbers(raffle) {
  if (!raffle || !Array.isArray(raffle.numbers)) return [];
  // Cotas que NÃO estão reservadas nem pagas
  return raffle.numbers.filter(item => item.status !== "paid" && item.status !== "reserved");
}

function generateAvailableWhatsAppText(raffle, format = 'full') {
  if (!raffle) return "Nenhuma ação selecionada.";
  
  const availableItems = getAvailableRaffleNumbers(raffle);
  const totalNumbers = raffle.totalNumbers || (raffle.numbers ? raffle.numbers.length : 0);
  const availCount = availableItems.length;

  if (availCount === 0) {
    return `*NÚMEROS LIVRES:*\nNenhum número livre no momento.`;
  }

  // Padronização com zeros à esquerda (ex: 01, 07, 09...)
  const padLength = totalNumbers >= 100 ? 3 : 2;
  const formatNum = (n) => String(n).padStart(padLength, '0');
  const numsFormatted = availableItems.map(item => formatNum(item.num)).join(', ');

  if (format === 'compact') {
    // Apenas a lista de números disponíveis sem cabeçalho
    return numsFormatted;
  }

  if (format === 'lines') {
    // Estilo linha por linha
    let output = `*NÚMEROS LIVRES:*\n`;
    availableItems.forEach(item => {
      output += `${formatNum(item.num)} -\n`;
    });
    return output;
  }

  // Padrão solicitado: SOMENTE *NÚMEROS LIVRES:* e os números
  return `*NÚMEROS LIVRES:*\n${numsFormatted}`;
}

function openExportAvailableWhatsAppModal(format) {
  const raffle = getActiveRaffle();
  if (!raffle) {
    showToast("Selecione uma ação ativa primeiro.", "warning");
    return;
  }

  if (format) {
    currentAvailableExportFormat = format;
  }

  const availableItems = getAvailableRaffleNumbers(raffle);
  const badge = document.getElementById("badgeAvailableModalCount");
  if (badge) {
    badge.textContent = `${availableItems.length} livres`;
  }

  // Sincroniza pills de formato e atualiza texto
  switchAvailableExportFormat(currentAvailableExportFormat);
  openModal("modalExportAvailableWhatsApp");

  // Auto-cópia para a área de transferência com toast de confirmação
  const textarea = document.getElementById("textareaAvailableExport");
  if (textarea && textarea.value) {
    textarea.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textarea.value).then(() => {
        showToast("Cotas livres copiadas!", "success");
      }).catch(() => {});
    }
  }
}

function switchAvailableExportFormat(format) {
  currentAvailableExportFormat = format;

  const pills = {
    full: document.getElementById("btnFormatFull"),
    compact: document.getElementById("btnFormatCompact"),
    lines: document.getElementById("btnFormatLines")
  };
  Object.keys(pills).forEach(key => {
    if (pills[key]) {
      if (key === format) pills[key].classList.add("active");
      else pills[key].classList.remove("active");
    }
  });

  const raffle = getActiveRaffle();
  const textarea = document.getElementById("textareaAvailableExport");
  if (textarea && raffle) {
    textarea.value = generateAvailableWhatsAppText(raffle, currentAvailableExportFormat);
  }
}

function doCopyAvailableWhatsApp() {
  const textarea = document.getElementById("textareaAvailableExport");
  if (!textarea) return;

  const text = textarea.value;
  if (!text) {
    showToast("Nenhum texto disponível para cópia.", "warning");
    return;
  }

  textarea.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("Cotas livres copiadas para o WhatsApp!", "success");
    }).catch(() => {
      document.execCommand("copy");
      showToast("Cotas livres copiadas!", "success");
    });
  } else {
    document.execCommand("copy");
    showToast("Cotas livres copiadas!", "success");
  }
}

function doSendAvailableWhatsApp() {
  const textarea = document.getElementById("textareaAvailableExport");
  if (!textarea) return;

  const text = textarea.value;
  if (!text) {
    showToast("Nenhum texto para enviar.", "warning");
    return;
  }

  const encoded = encodeURIComponent(text);
  const url = `https://api.whatsapp.com/send?text=${encoded}`;
  window.open(url, "_blank");
}

window.getAvailableRaffleNumbers = getAvailableRaffleNumbers;
window.generateAvailableWhatsAppText = generateAvailableWhatsAppText;
window.openExportAvailableWhatsAppModal = openExportAvailableWhatsAppModal;
window.switchAvailableExportFormat = switchAvailableExportFormat;
window.doCopyAvailableWhatsApp = doCopyAvailableWhatsApp;
window.doSendAvailableWhatsApp = doSendAvailableWhatsApp;

/* ==========================================================================
   TAB 2: VALES-COMPRAS & PRÊMIOS PENDENTES
   ========================================================================== */

/* Função Auxiliar: Remove agendamento vinculado da Agenda de Pesca caso o ganhador mude de ideia ou altere a opção */
async function removeLinkedFishingBookings(prizeId, customerName = null) {
  if (!prizeId && !customerName) return;
  const targetName = customerName ? customerName.trim().toUpperCase() : null;
  const toDelete = (appData.fishingBookings || []).filter(b => {
    if (prizeId && b.prizeId === prizeId) return true;
    if (targetName && b.bookingType === "raffle_prize" && (b.clientName || "").trim().toUpperCase() === targetName) return true;
    return false;
  });

  if (toDelete.length > 0) {
    appData.fishingBookings = (appData.fishingBookings || []).filter(b => !toDelete.some(del => del.id === b.id));
    for (const b of toDelete) {
      if (window.localDB && typeof window.localDB.deleteRecord === 'function') {
        await window.localDB.deleteRecord('fishing_bookings', b.id);
      }
      await saveState({
        type: "DELETE_FISHING_BOOKING",
        tableName: "fishing_bookings",
        recordId: b.id,
        payload: { id: b.id }
      });
    }
  }
}

function renderValesView() {
  const container = document.getElementById("valesCardsContainer");
  const searchTerm = (document.getElementById("inputSearchVales").value || "").toLowerCase().trim();
  
  container.innerHTML = "";

  const activeVales = appData.valesAndPrizes.filter(v => v.type === "vale_compras" && v.status === "active");
  const totalValesBalance = activeVales.reduce((acc, v) => acc + (parseFloat(v.currentBalance) || 0), 0);
  const pendingChoice = appData.valesAndPrizes.filter(v => v.type === "dual_choice" && v.status === "pending_choice");
  const pendingPrizes = appData.valesAndPrizes.filter(v => (v.type === "premio_fisico" && v.status === "pending_pickup") || (v.type === "dual_choice" && v.status === "pending_schedule"));

  // Specific Vales Stats
  const statValesEl = document.getElementById("statValesBalance");
  if (statValesEl) statValesEl.textContent = formatCurrency(totalValesBalance);

  const statActiveValesCountEl = document.getElementById("statActiveValesCount");
  if (statActiveValesCountEl) statActiveValesCountEl.textContent = `${activeVales.length} vales com crédito ativo`;

  const statChoiceEl = document.getElementById("statPendingChoiceCount");
  if (statChoiceEl) statChoiceEl.textContent = `${pendingChoice.length} a decidir`;

  const statPrizesEl = document.getElementById("statPendingPrizesCount");
  if (statPrizesEl) statPrizesEl.textContent = `${pendingPrizes.length} prêmios`;

  const filtered = appData.valesAndPrizes.filter(item => {
    if (searchTerm) {
      const matchName = (item.customerName || "").toLowerCase().includes(searchTerm);
      const matchPhone = (item.customerPhone || "").toLowerCase().includes(searchTerm);
      const matchDesc = (item.description || "").toLowerCase().includes(searchTerm);
      const matchRaffle = (item.raffleRef || "").toLowerCase().includes(searchTerm);
      const matchExchanged = (item.exchangedItem || "").toLowerCase().includes(searchTerm);
      if (!matchName && !matchPhone && !matchDesc && !matchRaffle && !matchExchanged) return false;
    }

    if (currentValesFilter === "pending_choice") {
      return item.type === "dual_choice" && item.status === "pending_choice";
    } else if (currentValesFilter === "active_vales") {
      return item.type === "vale_compras" && item.status === "active" && item.currentBalance > 0;
    } else if (currentValesFilter === "pending_prizes") {
      return (item.type === "premio_fisico" && item.status === "pending_pickup") || (item.type === "dual_choice" && item.status === "pending_schedule");
    } else if (currentValesFilter === "delivered") {
      return item.status === "delivered" || item.status === "scheduled" || (item.type === "vale_compras" && item.currentBalance <= 0);
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-gold); color: var(--text-muted);">
        <div style="font-size: 1.1rem; font-weight: 700; color: #ffffff;">Nenhum registro encontrado</div>
        <div style="font-size: 0.85rem; margin-top: 0.25rem;">Nenhum vale-compras ou prêmio corresponde ao filtro selecionado.</div>
      </div>
    `;
    return;
  }

  filtered.forEach(item => {
    const card = document.createElement("div");

    const isVale = item.type === "vale_compras";
    const isDualPending = item.type === "dual_choice" && item.status === "pending_choice";
    const isDualSchedule = item.type === "dual_choice" && item.status === "pending_schedule";
    const isScheduled = item.status === "scheduled";
    const isPendingPrize = item.type === "premio_fisico" && item.status === "pending_pickup";
    const isExchanged = !!item.exchangedItem;
    const isDelivered = item.status === "delivered" || (isVale && item.currentBalance <= 0);

    // Identificar a classe de cor correspondente a cada situação
    let cardModifierClass = "vale-card-delivered";
    if (isDualPending) {
      cardModifierClass = "vale-card-choice";
    } else if (isDualSchedule) {
      cardModifierClass = "vale-card-schedule";
    } else if (isScheduled) {
      cardModifierClass = "vale-card-scheduled";
    } else if (isPendingPrize) {
      cardModifierClass = "vale-card-pending-pickup";
    } else if (isExchanged) {
      cardModifierClass = "vale-card-exchanged";
    } else if (isVale && item.currentBalance > 0) {
      cardModifierClass = "vale-card-active-credit";
    }

    card.className = `vale-card ${cardModifierClass}`;
    
    // Type Badge com estilo visual distinto
    let typeBadge = "";
    const isFishingPrize = /diaria|diária|pesca|lago|rancho/i.test(item.description || '');

    if (isDualPending) {
      typeBadge = isFishingPrize
        ? `<span class="badge-pill badge-choice">A Decidir (Diária ou Vale)</span>`
        : `<span class="badge-pill badge-choice" style="background: rgba(99, 102, 241, 0.2); border-color: #818cf8; color: #c7d2fe;">A Decidir (Prêmio ou Vale)</span>`;
    } else if (isDualSchedule) {
      typeBadge = `<span class="badge-pill badge-schedule">Escolhendo o Dia</span>`;
    } else if (isScheduled) {
      typeBadge = `<span class="badge-pill badge-delivered" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.5);">Pescaria Agendada</span>`;
    } else if (isExchanged) {
      typeBadge = `<span class="badge-pill badge-vale" style="background: rgba(168, 85, 247, 0.2); border-color: #a855f7; color: #e9d5ff;">Produto Trocado</span>`;
    } else if (isPendingPrize) {
      typeBadge = `<span class="badge-pill badge-premio" style="background: rgba(229, 193, 88, 0.2); border-color: var(--primary-gold); color: #ffd700; font-weight: 800;">Aguardando Retirada</span>`;
    } else if (isVale && item.currentBalance > 0) {
      typeBadge = `<span class="badge-pill badge-vale" style="background: rgba(99, 102, 241, 0.2); border-color: rgba(99, 102, 241, 0.5); color: #a5b4fc;">Saldo de Haver (${formatCurrency(item.currentBalance)})</span>`;
    } else if (isDelivered) {
      typeBadge = `<span class="badge-pill badge-delivered" style="background: rgba(100, 116, 139, 0.2); border-color: rgba(100, 116, 139, 0.4); color: #cbd5e1;">Entregue / Concluído</span>`;
    }

    // Phone Link
    let phoneLinkHtml = "";
    if (item.customerPhone) {
      const cleanPhone = item.customerPhone.replace(/\D/g, "");
      phoneLinkHtml = `<a href="https://wa.me/55${cleanPhone}" target="_blank" class="customer-phone">● ${escapeHtml(item.customerPhone)}</a>`;
    }

    // Specific Content
    let middleContent = "";
    if (isDualPending) {
      middleContent = `
        <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: var(--radius-sm); padding: 0.55rem 0.75rem; margin: 0.45rem 0;">
          <div style="font-size: 0.7rem; color: #38bdf8; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">Opções de Prêmio da Ação:</div>
          <div style="font-size: 0.88rem; font-weight: 800; color: #ffffff; margin-top: 0.15rem; line-height: 1.3;">${escapeHtml(item.description)}</div>
          <div style="font-size: 0.74rem; color: #cbd5e1; margin-top: 0.3rem; background: rgba(0, 0, 0, 0.35); padding: 0.4rem 0.55rem; border-radius: 4px; line-height: 1.35;">
            Ganhador ainda <strong>não decidiu</strong>. Escolha ${isFishingPrize ? 'Diária ou Vale' : 'Prêmio Físico ou Vale'} abaixo:
          </div>
        </div>
      `;
    } else if (isDualSchedule) {
      middleContent = `
        <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: var(--radius-sm); padding: 0.55rem 0.75rem; margin: 0.45rem 0;">
          <div style="font-size: 0.7rem; color: #fbbf24; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">Opção Escolhida: Diária de Pesca</div>
          <div style="font-size: 0.88rem; font-weight: 800; color: #ffffff; margin-top: 0.15rem; line-height: 1.3;">${escapeHtml(item.description)}</div>
          <div style="font-size: 0.74rem; color: #cbd5e1; margin-top: 0.3rem; background: rgba(0, 0, 0, 0.35); padding: 0.4rem 0.55rem; border-radius: 4px; line-height: 1.35;">
            Pescador escolheu a <strong>Diária de Pesca</strong>. Clique em "Agendar" para marcar o dia:
          </div>
        </div>
      `;
    } else if (isScheduled) {
      const linkedBooking = (appData.fishingBookings || []).find(b => b.prizeId === item.id || ((b.clientName || '').trim().toUpperCase() === (item.customerName || '').trim().toUpperCase() && b.bookingType === 'raffle_prize'));
      let bookingDateText = "Data confirmada no calendário de pesca";
      if (linkedBooking) {
        if (linkedBooking.dates && linkedBooking.dates.length > 1) {
          bookingDateText = linkedBooking.dates.map(formatDate).join(", ");
        } else if (linkedBooking.startDate) {
          bookingDateText = formatDate(linkedBooking.startDate);
        }
      }
      middleContent = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: var(--radius-sm); padding: 0.55rem 0.75rem; margin: 0.45rem 0;">
          <div style="font-size: 0.7rem; color: #34d399; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px;">Agendado no Calendário:</div>
          <div style="font-size: 0.92rem; font-weight: 800; color: #ffffff; margin-top: 0.15rem; line-height: 1.3;">${bookingDateText}</div>
          <div style="font-size: 0.74rem; color: #a7f3d0; margin-top: 0.25rem;">
            ${linkedBooking ? (linkedBooking.packageName || 'Dupla (2 Pescadores)') + ' • Guia: ' + (linkedBooking.guideName || 'Thiago Witeck') : escapeHtml(item.description)}
          </div>
        </div>
      `;
    } else if (isVale) {
      let txListHtml = "";
      if (item.transactions && item.transactions.length > 0) {
        item.transactions.forEach(tx => {
          txListHtml += `
            <div class="tx-item-row">
              <span class="tx-name" title="${escapeHtml(tx.item)}">
                <small style="color: var(--text-dim);">${formatDate(tx.date)}</small> • ${escapeHtml(tx.item)}
              </span>
              <span class="tx-cost">- ${formatCurrency(tx.amount)}</span>
            </div>
          `;
        });
      } else {
        txListHtml = `<div style="font-size: 0.74rem; color: var(--text-dim); text-align: center; padding: 0.3rem;">Nenhum produto retirado ainda. Saldo intacto.</div>`;
      }

      middleContent = `
        <div class="balance-container">
          <div>
            <div class="balance-label">Saldo Atual de Haver</div>
            <div class="balance-amount" style="color: #818cf8;">${formatCurrency(item.currentBalance)}</div>
          </div>
          <div style="text-align: right;">
            <div class="balance-label">Valor Original</div>
            <div class="balance-amount original">${formatCurrency(item.initialAmount)}</div>
          </div>
        </div>

        <div class="tx-history-box">
          <div class="tx-history-title">
            <span>Histórico de Baixas:</span>
            <span>${item.transactions ? item.transactions.length : 0} retiradas</span>
          </div>
          ${txListHtml}
        </div>
      `;
    } else {
      let exchangeDetailsHtml = "";
      if (isExchanged) {
        exchangeDetailsHtml = `
          <div style="background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 4px; padding: 0.45rem 0.6rem; margin-top: 0.35rem;">
            <div style="font-size: 0.72rem; color: #e9d5ff; font-weight: 700;">TROCA REALIZADA:</div>
            <div style="font-size: 0.85rem; font-weight: 800; color: #ffffff;">Levou: ${escapeHtml(item.exchangedItem)}</div>
            <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.15rem;">
              Diferença: <strong style="color: var(--primary-gold);">${formatCurrency(item.differencePaid)}</strong> • Data: ${formatDate(item.exchangedAt || item.deliveredAt)}
            </div>
            ${item.exchangeNotes ? `<div style="font-size: 0.72rem; color: var(--text-dim); font-style: italic; margin-top: 0.15rem;">Obs: ${escapeHtml(item.exchangeNotes)}</div>` : ''}
          </div>
        `;
      }

      middleContent = `
        <div style="background: rgba(6, 10, 19, 0.6); border-radius: var(--radius-sm); padding: 0.55rem 0.75rem; margin: 0.45rem 0; border: 1px solid var(--border-gold);">
          <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Prêmio Ganho na Ação:</div>
          <div style="font-size: 0.88rem; font-weight: 800; color: #ffffff; margin-top: 0.15rem; line-height: 1.3;">${escapeHtml(item.description)}</div>
          ${exchangeDetailsHtml}
          ${item.notes && !isExchanged ? `<div style="font-size: 0.74rem; color: var(--text-dim); margin-top: 0.25rem; font-style: italic;">Obs: ${escapeHtml(item.notes)}</div>` : ''}
          ${item.deliveredAt && !isExchanged ? `<div style="font-size: 0.74rem; color: var(--status-paid-text); margin-top: 0.25rem;">Entregue em: ${formatDate(item.deliveredAt)}</div>` : ''}
        </div>
      `;
    }

    // Action Buttons
    let actionsHtml = "";
    if (isDualPending) {
      const valeAmount = item.initialAmount || item.currentBalance || (isFishingPrize ? 450 : 100);

      if (isFishingPrize) {
        actionsHtml = `
          <button class="btn btn-gold btn-sm" onclick="openNewFishingBookingFromPrize('${item.id}')" title="Escolheu Diária e vai agendar datas">
            Diária (Agendar)
          </button>
          <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" style="border-color: var(--primary-gold); color: var(--primary-gold);" title="Escolheu Vale-Compras de ${formatCurrency(valeAmount)}">
            Vale (${formatCurrency(valeAmount)})
          </button>
          <button class="btn btn-whatsapp btn-sm" onclick="generatePrizeWhatsAppMessage('${item.id}', 'choice')" title="Enviar mensagem de parabéns e perguntar se prefere Diária ou Vale">
            WhatsApp
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações / Valor do Vale">
            Editar
          </button>
          <button class="btn-delete-vale" onclick="deleteValeItem('${item.id}')" title="Excluir Registro">
            Excluir
          </button>
        `;
      } else {
        actionsHtml = `
          <button class="btn btn-gold btn-sm" onclick="choosePrizeOption('${item.id}', 'premio_fisico')" title="Ganhador optou pelo Prêmio Físico (ficará como Aguardando Retirada)">
            Prêmio Físico
          </button>
          <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" style="border-color: #818cf8; color: #a5b4fc;" title="Escolheu ficar com o Vale-Compras de ${formatCurrency(valeAmount)}">
            Vale (${formatCurrency(valeAmount)})
          </button>
          <button class="btn btn-whatsapp btn-sm" onclick="generatePrizeWhatsAppMessage('${item.id}', 'choice')" title="Enviar mensagem de parabéns e perguntar se prefere o Prêmio Físico ou Vale">
            WhatsApp
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openExchangePrizeModal('${item.id}')" style="border-color: #8b5cf6; color: #c4b5fd;" title="Ganhador quer trocar por outro produto na loja">
            Troca
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações">
            Editar
          </button>
          <button class="btn-delete-vale" onclick="deleteValeItem('${item.id}')" title="Excluir Registro">
            Excluir
          </button>
        `;
      }
    } else if (isDualSchedule) {
      const valeAmount = item.initialAmount || 450;
      actionsHtml = `
        <button class="btn btn-gold btn-sm" onclick="openNewFishingBookingFromPrize('${item.id}')" title="Agendar datas no calendário">
          Agendar Datas
        </button>
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" title="Trocar por vale-compras de ${formatCurrency(valeAmount)}">
          Trocar p/ Vale (${formatCurrency(valeAmount)})
        </button>
        <button class="btn btn-whatsapp btn-sm" onclick="generatePrizeWhatsAppMessage('${item.id}', 'schedule')" title="Enviar mensagem para agendar a pescaria no WhatsApp">
          WhatsApp
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações / Valor do Vale">
          Editar
        </button>
        <button class="btn-delete-vale" onclick="deleteValeItem('${item.id}')" title="Excluir Registro">
          Excluir
        </button>
      `;
    } else if (isScheduled) {
      const valeAmount = item.initialAmount || 450;
      actionsHtml = `
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('tabBtnAgenda').click()" style="border-color: #10b981; color: #34d399;" title="Ver na Agenda de Pesca">
          Ver na Agenda
        </button>
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" title="Cancelar agendamento e trocar por vale-compras de ${formatCurrency(valeAmount)}">
          Trocar p/ Vale (${formatCurrency(valeAmount)})
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações / Valor do Vale">
          Editar
        </button>
        <button class="btn-delete-vale" onclick="deleteValeItem('${item.id}')" title="Excluir Registro">
          Excluir
        </button>
      `;
    } else if (isVale) {
      if (item.currentBalance > 0) {
        actionsHtml = `
          <button class="btn btn-gold btn-sm" onclick="openAbaterModal('${item.id}')">
            Abater Produto
          </button>
        `;
      }
      actionsHtml += `
        <button class="btn btn-whatsapp btn-sm" onclick="generateValeWhatsAppReceipt('${item.id}')" title="Enviar extrato de saldo pelo WhatsApp">
          WhatsApp
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações e Saldo">
          Editar
        </button>
        <button class="btn-delete-vale" onclick="deleteValeItem('${item.id}')" title="Excluir Registro">
          Excluir
        </button>
      `;
    } else {
      if (isExchanged) {
        actionsHtml = `
          <button class="btn btn-secondary btn-sm" onclick="openExchangePrizeModal('${item.id}')" style="border-color: #a855f7; color: #e9d5ff;" title="Editar informações da troca">
            Editar Troca
          </button>
          <button class="btn btn-danger btn-sm" onclick="undoCurrentExchangePrizeDirect('${item.id}')" title="Desfazer troca caso o cliente tenha se arrependido e retornar prêmio para Aguardando Retirada">
            Desfazer Troca
          </button>
        `;
      } else if (item.status === "pending_pickup") {
        actionsHtml = `
          <button class="btn btn-gold btn-sm" onclick="markPrizeDelivered('${item.id}')" title="Confirmar que o cliente retirou o prêmio">
            Entregue
          </button>
          <button class="btn btn-whatsapp btn-sm" onclick="generatePrizeWhatsAppMessage('${item.id}', 'pickup')" title="Enviar aviso para o ganhador vir retirar o prêmio físico na loja">
            WhatsApp
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openExchangePrizeModal('${item.id}')" style="border-color: #8b5cf6; color: #c4b5fd;">
            Troca
          </button>
        `;
      }
      if (/diaria|diária|pesca|lago|rancho/i.test(item.description || '')) {
        actionsHtml += `
          <button class="btn btn-secondary btn-sm" onclick="openNewFishingBookingFromPrize('${item.id}')" style="border-color: #38bdf8; color: #38bdf8;">
            Agendar Pesca
          </button>
        `;
      }
      actionsHtml += `
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações">
          Editar
        </button>
        <button class="btn-delete-vale" onclick="deleteValeItem('${item.id}')" title="Excluir Registro">
          Excluir
        </button>
      `;
    }

    card.innerHTML = `
      <div>
        <div class="vale-header">
          <div>
            <div class="customer-name">
              ${escapeHtml(item.customerName)}
            </div>
            ${phoneLinkHtml}
            <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.15rem;">
              Origem: <strong>${escapeHtml(item.raffleRef || 'Ação Eldorado')}</strong> • Ganho em: ${formatDate(item.dateWon)}
            </div>
          </div>
          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem;">
            ${typeBadge}
          </div>
        </div>

        ${middleContent}
      </div>

      <div class="vale-actions-bar">
        ${actionsHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function openEditPrizeModal(id) {
  const item = (appData.valesAndPrizes || []).find(v => v.id === id);
  if (!item) return;

  document.getElementById("editValeId").value = item.id;
  document.getElementById("editValeCustomerName").value = item.customerName || "";
  document.getElementById("editValeCustomerPhone").value = item.customerPhone || "";
  document.getElementById("editValeDescription").value = item.description || "";
  document.getElementById("editValeNotes").value = item.notes || "";

  const choiceSelect = document.getElementById("editValeChoiceSelect");
  if (item.type === "dual_choice" && item.status === "pending_choice") {
    choiceSelect.value = "pending_choice";
  } else if (item.type === "dual_choice" && item.status === "pending_schedule") {
    choiceSelect.value = "diaria";
  } else if (item.status === "scheduled") {
    choiceSelect.value = "scheduled";
  } else if (item.type === "vale_compras") {
    choiceSelect.value = "vale";
  } else if (item.type === "premio_fisico" && item.status === "pending_pickup") {
    choiceSelect.value = "pending_pickup";
  } else if (item.status === "delivered") {
    choiceSelect.value = "delivered";
  } else {
    choiceSelect.value = "pending_choice";
  }

  // Preenche o campo de valor customizado para vale-compras
  const amountInput = document.getElementById("editValeAmount");
  if (amountInput) {
    const val = (item.currentBalance !== undefined && item.currentBalance !== null && item.currentBalance > 0)
      ? item.currentBalance
      : (item.initialAmount || "");
    amountInput.value = val;
  }

  toggleEditValeChoiceFields();
  openModal("modalEditValePrize");
}

function toggleEditValeChoiceFields() {
  const choice = document.getElementById("editValeChoiceSelect").value;
  const amountGroup = document.getElementById("editValeAmountGroup");
  if (!amountGroup) return;

  if (choice === "vale") {
    amountGroup.style.display = "block";
    const amountInput = document.getElementById("editValeAmount");
    if (!amountInput.value) {
      const id = document.getElementById("editValeId").value;
      const item = (appData.valesAndPrizes || []).find(v => v.id === id);
      if (item) {
        amountInput.value = item.initialAmount || item.currentBalance || 450;
      } else {
        amountInput.value = 450;
      }
    }
  } else {
    amountGroup.style.display = "none";
  }
}

async function saveEditedValePrize() {
  const id = document.getElementById("editValeId").value;
  const item = (appData.valesAndPrizes || []).find(v => v.id === id);
  if (!item) return;

  const newName = document.getElementById("editValeCustomerName").value.trim().toUpperCase();
  const newPhone = document.getElementById("editValeCustomerPhone").value.trim();
  const newDesc = document.getElementById("editValeDescription").value.trim();
  const newNotes = document.getElementById("editValeNotes").value.trim();
  const newChoice = document.getElementById("editValeChoiceSelect").value;
  const customAmount = parseFloat(document.getElementById("editValeAmount").value) || item.initialAmount || 450.00;

  if (!newName) {
    showToast("Informe o nome do ganhador / cliente.", "warning");
    return;
  }

  const oldName = item.customerName;
  const oldStatus = item.status;

  item.customerName = newName;
  item.customerPhone = newPhone;
  item.description = newDesc || item.description;
  item.notes = newNotes;

  if (newChoice === "pending_choice") {
    item.type = "dual_choice";
    item.status = "pending_choice";
    await removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "diaria") {
    item.type = "dual_choice";
    item.status = "pending_schedule";
    await removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "scheduled") {
    item.type = "dual_choice";
    item.status = "scheduled";
    const linked = (appData.fishingBookings || []).find(b => b.prizeId === item.id || ((b.clientName || '').trim().toUpperCase() === oldName.trim().toUpperCase() && b.bookingType === 'raffle_prize'));
    if (linked) {
      linked.clientName = newName;
      linked.clientPhone = newPhone;
    }
  } else if (newChoice === "vale") {
    item.type = "vale_compras";
    item.status = "active";
    item.initialAmount = customAmount;
    item.currentBalance = customAmount;
    await removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "pending_pickup") {
    item.type = "premio_fisico";
    item.status = "pending_pickup";
    item.deliveredAt = null;
    item.exchangedItem = null;
    item.differencePaid = 0;
    item.exchangeNotes = null;
    item.exchangedAt = null;
    await removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "delivered") {
    item.status = "delivered";
    item.deliveredAt = item.deliveredAt || new Date().toISOString();
    if (oldStatus !== "scheduled") {
      await removeLinkedFishingBookings(item.id, oldName);
    }
  }

  await saveState({
    type: "UPDATE_VALE",
    tableName: "vales_prizes",
    recordId: item.id,
    payload: item
  });
  renderValesView();
  renderFishingAgendaView();
  updateGlobalStats();
  closeModal("modalEditValePrize");
  showToast(`Registro de ${item.customerName} atualizado com sucesso!`, "success");
}

async function choosePrizeOption(valeId, choice) {
  const item = appData.valesAndPrizes.find(v => v.id === valeId);
  if (!item) return;
  const oldName = item.customerName;

  if (choice === "vale") {
    const amount = item.initialAmount || item.currentBalance || 450.00;
    item.type = "vale_compras";
    item.status = "active";
    item.initialAmount = amount;
    item.currentBalance = amount;
    item.notes = `Ganhador optou pelo Vale-Compras (${formatCurrency(amount)})`;

    // Remove automaticamente qualquer agendamento vinculado do calendário de pesca
    await removeLinkedFishingBookings(valeId, oldName);

    await saveState({
      type: "UPDATE_VALE",
      tableName: "vales_prizes",
      recordId: item.id,
      payload: item
    });
    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast(`Opção de Vale-Compras confirmada para ${item.customerName}! Saldo de ${formatCurrency(amount)} liberado.`, "success");
  } else if (choice === "diaria") {
    item.type = "dual_choice";
    item.status = "pending_schedule";
    item.notes = "Ganhador optou pela Diária de Pesca (Aguardando Agendamento)";

    // Remove agendamento anterior para escolha limpa de novas datas
    await removeLinkedFishingBookings(valeId, oldName);

    await saveState({
      type: "UPDATE_VALE",
      tableName: "vales_prizes",
      recordId: item.id,
      payload: item
    });
    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast(`Opção de Diária de Pesca confirmada para ${item.customerName}! Status atualizado para "Escolhendo o Dia".`, "success");
  } else if (choice === "premio_entregue" || choice === "delivered") {
    item.type = "premio_fisico";
    item.status = "delivered";
    item.deliveredAt = getLocalDateStr();
    item.notes = "Ganhador retirou o prêmio físico na loja (Entregue)";
    await removeLinkedFishingBookings(valeId, oldName);

    await saveState({
      type: "UPDATE_VALE",
      tableName: "vales_prizes",
      recordId: item.id,
      payload: item
    });
    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast(`Prêmio físico entregue com sucesso para ${item.customerName}!`, "success");
  } else if (choice === "premio_fisico") {
    item.type = "premio_fisico";
    item.status = "pending_pickup";
    item.notes = "Ganhador optou pelo Prêmio Físico (Aguardando Retirada)";
    await removeLinkedFishingBookings(valeId, oldName);

    await saveState({
      type: "UPDATE_VALE",
      tableName: "vales_prizes",
      recordId: item.id,
      payload: item
    });
    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast(`Opção de Prêmio Físico confirmada para ${item.customerName}! Aguardando retirada na loja.`, "success");
  } else if (choice === "pending_choice") {
    item.type = "dual_choice";
    item.status = "pending_choice";
    item.notes = "Ganhador pendente de escolha";

    // Remove agendamento anterior para sair do calendário
    await removeLinkedFishingBookings(valeId, oldName);

    await saveState({
      type: "UPDATE_VALE",
      tableName: "vales_prizes",
      recordId: item.id,
      payload: item
    });
    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast(`Status de ${item.customerName} atualizado para "A Decidir".`, "success");
  }
}

function setValesFilter(filter) {
  currentValesFilter = filter;
  document.querySelectorAll("#filterValesAll, #filterValesChoice, #filterValesActive, #filterValesPrizes, #filterValesDone").forEach(btn => btn.classList.remove("active"));
  
  if (filter === "all" && document.getElementById("filterValesAll")) document.getElementById("filterValesAll").classList.add("active");
  if (filter === "pending_choice" && document.getElementById("filterValesChoice")) document.getElementById("filterValesChoice").classList.add("active");
  if (filter === "active_vales" && document.getElementById("filterValesActive")) document.getElementById("filterValesActive").classList.add("active");
  if (filter === "pending_prizes" && document.getElementById("filterValesPrizes")) document.getElementById("filterValesPrizes").classList.add("active");
  if (filter === "delivered" && document.getElementById("filterValesDone")) document.getElementById("filterValesDone").classList.add("active");

  renderValesView();
}

/* Modal: Novo Vale / Prêmio Manual */
function openNewValeModal() {
  document.getElementById("nvType").value = "vale_compras";
  document.getElementById("nvCustomerName").value = "";
  document.getElementById("nvCustomerPhone").value = "";
  document.getElementById("nvRaffleRef").value = getActiveRaffle() ? getActiveRaffle().title : "";
  document.getElementById("nvInitialAmount").value = "";
  document.getElementById("nvDescription").value = "";
  toggleValeTypeFields();
  openModal("modalNewVale");
}

function toggleValeTypeFields() {
  const type = document.getElementById("nvType").value;
  const groupAmount = document.getElementById("nvGroupAmount");
  groupAmount.style.display = type === "vale_compras" ? "block" : "none";
}

async function saveNewVale() {
  const type = document.getElementById("nvType").value;
  const name = document.getElementById("nvCustomerName").value.trim();
  const phone = document.getElementById("nvCustomerPhone").value.trim();
  const raffleRef = document.getElementById("nvRaffleRef").value.trim();
  const amount = parseFloat(document.getElementById("nvInitialAmount").value) || 0;
  const desc = document.getElementById("nvDescription").value.trim();

  if (!name) {
    showToast("Digite o nome do cliente.", "warning");
    return;
  }

  const newEntry = {
    id: "vp-" + Date.now(),
    customerName: name,
    customerPhone: phone,
    type: type,
    raffleRef: raffleRef || "Eldorado Pesca",
    dateWon: getLocalDateStr(),
    initialAmount: type === "vale_compras" ? amount : 0,
    currentBalance: type === "vale_compras" ? amount : 0,
    description: desc || (type === "vale_compras" ? `Vale Compras ${formatCurrency(amount)}` : "Prêmio"),
    status: type === "vale_compras" ? "active" : "pending_pickup",
    deliveredAt: null,
    transactions: [],
    notes: ""
  };

  appData.valesAndPrizes.unshift(newEntry);
  await saveState({
    type: "UPDATE_VALE",
    tableName: "vales_prizes",
    recordId: newEntry.id,
    payload: newEntry
  });
  renderValesView();
  closeModal("modalNewVale");
  showToast("Cadastro salvo no banco de dados!", "success");
}

/* Modal: Abater Produto do Vale-Compras / Diminuir Saldo (PRODUTO OPCIONAL) */
function openAbaterModal(valeId) {
  const item = appData.valesAndPrizes.find(v => v.id === valeId);
  if (!item) return;

  document.getElementById("abaterValeId").value = valeId;
  document.getElementById("abaterClientName").textContent = item.customerName;
  document.getElementById("abaterCurrentBalance").textContent = formatCurrency(item.currentBalance);
  document.getElementById("abaterDate").value = getLocalDateStr();
  document.getElementById("abaterItemName").value = "";
  document.getElementById("abaterAmount").value = "";
  document.getElementById("abaterNewBalanceDisplay").textContent = formatCurrency(item.currentBalance);

  openModal("modalAbaterProduto");
}

function calculateNewRemainingBalance() {
  const valeId = document.getElementById("abaterValeId").value;
  const item = appData.valesAndPrizes.find(v => v.id === valeId);
  if (!item) return;

  const abaterVal = parseFloat(document.getElementById("abaterAmount").value) || 0;
  const newBal = Math.max(0, item.currentBalance - abaterVal);
  document.getElementById("abaterNewBalanceDisplay").textContent = formatCurrency(newBal);
}

async function confirmAbaterProduto() {
  const valeId = document.getElementById("abaterValeId").value;
  const item = appData.valesAndPrizes.find(v => v.id === valeId);
  if (!item) return;

  const dateVal = document.getElementById("abaterDate").value || getLocalDateStr();
  let itemName = document.getElementById("abaterItemName").value.trim();
  const abaterVal = parseFloat(document.getElementById("abaterAmount").value) || 0;

  if (abaterVal <= 0) {
    showToast("Informe o valor a abater do saldo.", "warning");
    return;
  }

  // Produto é opcional - se vazio, coloca descrição padrão
  if (!itemName) {
    itemName = "Baixa de saldo";
  }

  const newBalance = Math.max(0, item.currentBalance - abaterVal);
  item.currentBalance = newBalance;
  if (newBalance === 0) {
    item.status = "completed";
  }

  const txEntry = {
    id: "tx-" + Date.now(),
    date: dateVal,
    item: itemName,
    amount: abaterVal,
    remainingBalance: newBalance,
    registeredBy: "Loja"
  };

  if (!item.transactions) item.transactions = [];
  item.transactions.unshift(txEntry);

  await saveState({
    type: "ADD_VALE_TRANSACTION",
    tableName: "vale_transactions",
    recordId: txEntry.id,
    payload: {
      id: txEntry.id,
      valeId: valeId,
      date: dateVal,
      item: itemName,
      amount: abaterVal,
      remainingBalance: newBalance,
      registeredBy: "Loja"
    }
  });

  // Atualiza também o saldo do vale pai
  await saveState({
    type: "UPDATE_VALE",
    tableName: "vales_prizes",
    recordId: item.id,
    payload: item
  });

  renderValesView();
  closeModal("modalAbaterProduto");
  showToast(`Baixa realizada! Novo saldo de ${item.customerName}: ${formatCurrency(newBalance)}`, "success");
}

/* Modal: REGISTRAR / EDITAR TROCA DE PRÊMIO POR OUTRO PRODUTO */
function openExchangePrizeModal(prizeId) {
  const item = appData.valesAndPrizes.find(v => v.id === prizeId);
  if (!item) return;

  document.getElementById("exchangePrizeId").value = prizeId;
  document.getElementById("exchangeClientName").textContent = item.customerName;
  document.getElementById("exchangeOriginalItem").textContent = item.description;

  const isAlreadyExchanged = !!item.exchangedItem;
  const titleEl = document.getElementById("modalExchangePrizeTitle");
  if (titleEl) {
    titleEl.textContent = isAlreadyExchanged ? "Editar / Ajustar Troca de Produto" : "Registrar Troca de Produto Ganho";
  }

  document.getElementById("exchangeNewItemName").value = item.exchangedItem || "";
  document.getElementById("exchangeDifferencePaid").value = item.differencePaid !== undefined ? item.differencePaid : "0.00";
  document.getElementById("exchangeDate").value = item.exchangedAt || item.deliveredAt || getLocalDateStr();
  document.getElementById("exchangeNotes").value = item.exchangeNotes || "";

  const btnUndo = document.getElementById("btnUndoExchange");
  if (btnUndo) {
    btnUndo.style.display = isAlreadyExchanged ? "inline-flex" : "none";
  }

  const btnConfirm = document.getElementById("btnConfirmExchangePrize");
  if (btnConfirm) {
    btnConfirm.textContent = isAlreadyExchanged ? "Salvar Alterações da Troca" : "Confirmar Troca e Entrega";
  }

  openModal("modalExchangePrize");
}

async function confirmExchangePrize() {
  const prizeId = document.getElementById("exchangePrizeId").value;
  const item = appData.valesAndPrizes.find(v => v.id === prizeId);
  if (!item) return;

  const newItem = document.getElementById("exchangeNewItemName").value.trim();
  const diffPaid = parseFloat(document.getElementById("exchangeDifferencePaid").value) || 0;
  const exDate = document.getElementById("exchangeDate").value || getLocalDateStr();
  const notes = document.getElementById("exchangeNotes").value.trim();

  if (!newItem) {
    showToast("Por favor, informe o novo produto que o cliente levou.", "warning");
    return;
  }

  item.status = "delivered";
  item.deliveredAt = exDate;
  item.exchangedItem = newItem;
  item.differencePaid = diffPaid;
  item.exchangeNotes = notes;
  item.exchangedAt = exDate;

  await saveState({
    type: "UPDATE_VALE",
    tableName: "vales_prizes",
    recordId: prizeId,
    payload: item
  });
  renderValesView();
  closeModal("modalExchangePrize");
  showToast(`Troca salva com sucesso! ${item.customerName} levou: ${newItem}`, "success");
}

async function undoCurrentExchangePrize() {
  const prizeId = document.getElementById("exchangePrizeId").value;
  await executeUndoExchange(prizeId);
  closeModal("modalExchangePrize");
}

async function undoCurrentExchangePrizeDirect(prizeId) {
  await executeUndoExchange(prizeId);
}

async function executeUndoExchange(prizeId) {
  const item = appData.valesAndPrizes.find(v => v.id === prizeId);
  if (!item) return;

  if (!confirm(`Deseja realmente desfazer a troca de ${item.customerName} e retornar o prêmio original ("${item.description}") para "Aguardando Retirada"?`)) {
    return;
  }

  item.status = "pending_pickup";
  item.deliveredAt = null;
  item.exchangedItem = null;
  item.differencePaid = 0;
  item.exchangeNotes = null;
  item.exchangedAt = null;

  await saveState({
    type: "UPDATE_VALE",
    tableName: "vales_prizes",
    recordId: prizeId,
    payload: item
  });
  renderValesView();
  updateGlobalStats();
  showToast(`Troca desfeita! O prêmio de ${item.customerName} voltou para Aguardando Retirada.`, "success");
}

function generatePrizeWhatsAppMessage(itemId, msgType) {
  const item = (appData.valesAndPrizes || []).find(v => v.id === itemId);
  if (!item) return;

  const winnerName = (item.customerName || "Ganhador(a)").trim();
  const prizeDesc = item.description || "Prêmio da Ação";
  const raffleTitle = item.raffleRef || "Ação Eldorado";
  const valeAmount = item.initialAmount || item.currentBalance || 450.00;
  const isFishingPrize = /diaria|diária|pesca|lago|rancho/i.test(prizeDesc);

  let msg = "";

  if (msgType === "choice") {
    if (isFishingPrize) {
      msg = `🎉 *PARABÉNS DA ELDORADO PESCA!* 🎣🏆\n\n` +
        `Olá, *${winnerName}*! Tudo bem?\n\n` +
        `Passando para te dar os parabéns! Você foi o ganhador na *${raffleTitle}*!\n` +
        `🎁 *Sua premiação:* ${prizeDesc}\n\n` +
        `Nesta ação você pode escolher entre:\n` +
        `1️⃣ *Diária de Pesca Esportiva* no lago com guia profissional;\n` +
        `OU\n` +
        `2️⃣ *Vale-Compras de ${formatCurrency(valeAmount)}* em produtos na nossa loja!\n\n` +
        `Por favor, nos responda aqui informando qual opção você prefere para agendarmos ou liberarmos seu crédito! 🤝\n\n` +
        `📍 *Eldorado Pesca & Lake*\n` +
        `📱 WhatsApp: 42 9 9916-2340`;
    } else {
      msg = `🎉 *PARABÉNS DA ELDORADO PESCA!* 🎣🏆\n\n` +
        `Olá, *${winnerName}*! Tudo bem?\n\n` +
        `Passando para te dar os parabéns! Você foi o ganhador na *${raffleTitle}*!\n` +
        `🎁 *Sua premiação:* ${prizeDesc}\n\n` +
        `Nesta ação você pode escolher entre:\n` +
        `1️⃣ Retirar o *Prêmio Físico* aqui na nossa loja;\n` +
        `OU\n` +
        `2️⃣ Ficar com um *Vale-Compras de ${formatCurrency(valeAmount)}* para escolher produtos na Eldorado Pesca!\n\n` +
        `Por favor, nos avise qual das opções você prefere para prepararmos tudo para você! 🤝\n\n` +
        `📍 *Eldorado Pesca & Lake*\n` +
        `📱 WhatsApp: 42 9 9916-2340`;
    }
  } else if (msgType === "pickup") {
    msg = `🎣 *ELDORADO PESCA - SEU PRÊMIO ESTÁ PRONTO!* 📦🏆\n\n` +
      `Olá, *${winnerName}*! Tudo bem?\n\n` +
      `Confirmamos sua opção pelo prêmio físico da ação *${raffleTitle}*:\n` +
      `🎁 *Produto:* ${prizeDesc}\n\n` +
      `O seu produto já está separado e prontinho para retirada aqui na nossa loja! Pode vir buscar quando for melhor para você.\n\n` +
      `📍 *Local:* Loja Eldorado Pesca & Lake\n` +
      `🕒 *Horário:* Seg a Sex das 08h às 18h | Sáb das 08h às 12h\n` +
      `📱 Dúvidas: 42 9 9916-2340\n\n` +
      `Aguardamos você para te entregar em mãos! 🤝📸`;
  } else if (msgType === "schedule") {
    msg = `🎣 *ELDORADO LAKE - VAMOS AGENDAR SUA PESCARIA!* 🏆\n\n` +
      `Olá, *${winnerName}*! Tudo bem?\n\n` +
      `Vimos que você optou pela *Diária de Pesca* da ação *${raffleTitle}*!\n` +
      `🎁 *Premiação:* ${prizeDesc}\n\n` +
      `Vamos marcar o dia da sua pescaria? Nos informe quais datas ficam melhores para você, para consultarmos a agenda do guia e reservarmos o seu dia no lago!\n\n` +
      `📍 *Eldorado Lake*\n` +
      `📱 WhatsApp: 42 9 9916-2340`;
  }

  // Copia sempre para o clipboard
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).catch(() => {});
  }

  // Se tiver telefone do cliente, abre o WhatsApp diretamente
  const rawPhone = (item.customerPhone || "").replace(/\D/g, "");
  if (rawPhone) {
    const fullPhone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    showToast("Mensagem aberta no WhatsApp e copiada!", "success");
  } else {
    showToast("Texto da mensagem copiado para a área de transferência!", "success");
  }
}

function generateValeWhatsAppReceipt(valeId) {
  const item = appData.valesAndPrizes.find(v => v.id === valeId);
  if (!item) return;

  let msg = `*ELDORADO PESCA LTDA - EXTRATO DE VALE-COMPRAS*\n\n`;
  msg += `*Cliente:* ${item.customerName}\n`;
  msg += `*Origem:* ${item.raffleRef || 'Ação Eldorado'}\n`;
  msg += `*Valor Original:* ${formatCurrency(item.initialAmount)}\n`;
  msg += `*Saldo Atual de Haver:* *${formatCurrency(item.currentBalance)}*\n\n`;

  if (item.transactions && item.transactions.length > 0) {
    msg += `*Histórico de Retiradas:*\n`;
    item.transactions.forEach(tx => {
      msg += `• ${formatDate(tx.date)}: ${tx.item} (- ${formatCurrency(tx.amount)})\n`;
    });
    msg += `\n`;
  }

  msg += `Qualquer dúvida estamos à disposição no WhatsApp 42 9 9916-2340!`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).catch(() => {});
  }

  const rawPhone = (item.customerPhone || "").replace(/\D/g, "");
  if (rawPhone) {
    const fullPhone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    showToast("Extrato aberto no WhatsApp e copiado!", "success");
  } else {
    showToast("Extrato copiado para o WhatsApp!", "success");
  }
}

async function markPrizeDelivered(prizeId) {
  const item = appData.valesAndPrizes.find(v => v.id === prizeId);
  if (!item) return;

  if (confirm(`Confirmar entrega do produto "${item.description}" para ${item.customerName}?`)) {
    item.status = "delivered";
    item.deliveredAt = getLocalDateStr();

    await saveState({
      type: "UPDATE_VALE",
      tableName: "vales_prizes",
      recordId: prizeId,
      payload: item
    });

    renderValesView();
    showToast("Prêmio marcado como entregue com sucesso!", "success");
  }
}

async function deleteValeItem(id) {
  const item = (appData.valesAndPrizes || []).find(v => v.id === id);
  const name = item ? item.customerName : "este registro";

  if (confirm(`Deseja realmente excluir o registro de ${name}?`)) {
    // Remove qualquer agendamento vinculado da Agenda de Pesca
    await removeLinkedFishingBookings(id, name);

    appData.valesAndPrizes = appData.valesAndPrizes.filter(v => v.id !== id);

    if (window.localDB && typeof window.localDB.deleteRecord === 'function') {
      await window.localDB.deleteRecord('vales_prizes', id);
    }

    await saveState({
      type: "DELETE_VALE",
      tableName: "vales_prizes",
      recordId: id,
      payload: { id }
    });

    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast("Registro excluído e sincronizado com o calendário.", "success");
  }
}

function schedulePrizeInFishingCalendar(prizeId) {
  const item = (appData.valesAndPrizes || []).find(v => v.id === prizeId);
  if (!item) return;
  const tabBtn = document.getElementById("tabBtnAgenda");
  if (tabBtn) tabBtn.click();
  openNewFishingBookingModal(
    null,
    item.customerName,
    item.customerPhone || '42 9 9933-4455',
    item.raffleRef || '105° AÇÃO ELDORADO PESCA',
    prizeId,
    item.description || '1 Diária para 2 Pessoas + Combustível'
  );
}

/* ==========================================================================
   TAB 3: AGENDA & CALENDÁRIO DE PESCA (ELDORADO LAKE)
   ========================================================================== */

function renderFishingAgendaView() {
  renderPendingWinnersBanner();
  updateFishingStats();
  renderFishingCalendar();
  renderUpcomingFishingSidebar();
  renderFishingBookingsList();
}

function renderPendingWinnersBanner() {
  const bannerSection = document.getElementById("fishPendingWinnersSection");
  const bannerList = document.getElementById("fishPendingWinnersList");
  const countBadge = document.getElementById("badgeFishPendingWinnersCount");
  if (!bannerSection || !bannerList) return;

  bannerList.innerHTML = "";

  // Verifica ganhadores pendentes de valesAndPrizes (que não estejam agendados, entregues ou com vale-compras ativo)
  const pendingFromVales = (appData.valesAndPrizes || []).filter(v => {
    if (v.status === "delivered" || v.status === "scheduled") return false;
    if (v.type === "vale_compras") return false;
    if (v.type === "dual_choice") return true;
    return /diaria|diária|pesca|lago|rancho/i.test(v.description || '');
  });

  const bookedPrizeIds = new Set((appData.fishingBookings || []).map(b => b.prizeId).filter(Boolean));

  const pendingWinners = pendingFromVales.filter(v => {
    if (v.id && bookedPrizeIds.has(v.id)) return false;
    return true;
  });

  if (pendingWinners.length === 0) {
    bannerSection.style.display = "none";
    return;
  }

  bannerSection.style.display = "block";
  if (countBadge) {
    countBadge.textContent = `${pendingWinners.length} ${pendingWinners.length === 1 ? 'pendente' : 'pendentes'}`;
  }

  pendingWinners.forEach(item => {
    const card = document.createElement("div");
    card.className = "pending-winner-card";

    let statusLabel = "A Decidir (Diária ou Vale)";
    let statusClass = "badge-choice";
    if (item.status === "pending_schedule") {
      statusLabel = "Escolheu Diária (Aguardando Datas)";
      statusClass = "badge-schedule";
    }

    let phoneHtml = "";
    if (item.customerPhone) {
      const clean = item.customerPhone.replace(/\D/g, "");
      phoneHtml = `<a href="https://wa.me/55${clean}" target="_blank" style="color: #22c55e; font-size: 0.78rem; text-decoration: none; margin-left: 0.35rem;">● ${escapeHtml(item.customerPhone)}</a>`;
    }

    const prizeValeAmount = item.initialAmount || item.currentBalance || 450;
    let actionButtonsHtml = "";
    if (item.status === "pending_choice" || item.type === "dual_choice") {
      actionButtonsHtml = `
        <button class="btn btn-gold btn-sm" onclick="openNewFishingBookingFromPrize('${item.id}')" title="Escolheu a diária de pesca e vai definir as datas">
          Diária de Pesca
        </button>
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" title="Escolheu o vale-compras na loja de ${formatCurrency(prizeValeAmount)}">
          Vale-Compras (${formatCurrency(prizeValeAmount)})
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar dados do prêmio">
          Editar
        </button>
      `;
    } else {
      actionButtonsHtml = `
        <button class="btn btn-gold btn-sm" onclick="openNewFishingBookingFromPrize('${item.id}')" title="Definir as datas da pescaria">
          Definir Datas da Pescaria
        </button>
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" title="Trocar por vale-compras de ${formatCurrency(prizeValeAmount)}">
          Trocar p/ Vale (${formatCurrency(prizeValeAmount)})
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar dados">
          Editar
        </button>
      `;
    }

    card.innerHTML = `
      <div style="flex: 1; min-width: 220px;">
        <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
          <strong style="color: #ffffff; font-size: 0.95rem;">${escapeHtml(item.customerName)}</strong>
          ${phoneHtml}
          <span class="badge-pill ${statusClass}" style="font-size: 0.68rem;">${statusLabel}</span>
        </div>
        <div style="font-size: 0.78rem; color: #38bdf8; font-weight: 700; margin-top: 0.2rem;">
          ${escapeHtml(item.raffleRef || '105° Ação Eldorado')}
        </div>
        <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 0.1rem;">
          ${escapeHtml(item.description)}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
        ${actionButtonsHtml}
      </div>
    `;

    bannerList.appendChild(card);
  });
}

function updateFishingStats() {
  const allBookings = appData.fishingBookings || [];
  
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const monthName = monthNames[fishCalSelectedMonth];
  const monthYearLabel = `${monthName} de ${fishCalSelectedYear}`;

  const monthStr = String(fishCalSelectedMonth + 1).padStart(2, "0");
  const yearMonthPrefix = `${fishCalSelectedYear}-${monthStr}`;

  // Filter bookings overlapping the selected month
  const monthBookings = allBookings.filter(b => {
    if (!b.startDate || b.status === "cancelled") return false;
    const startYm = b.startDate.slice(0, 7);
    const endYm = (b.endDate || b.startDate).slice(0, 7);
    return startYm === yearMonthPrefix || endYm === yearMonthPrefix || (startYm <= yearMonthPrefix && yearMonthPrefix <= endYm);
  });

  let totalMonthDays = 0;
  let totalDirectRevenue = 0;
  let totalDepositsReceived = 0;
  let totalRemainingBalance = 0;
  let pendingBalanceBookingsCount = 0;
  let raffleDaysCount = 0;

  monthBookings.forEach(b => {
    const days = parseInt(b.totalDays) || 1;
    totalMonthDays += days;

    if (b.bookingType === "raffle_prize") {
      raffleDaysCount += (parseInt(b.raffleDays) || 1);
      const extraDays = parseInt(b.extraDays) || 0;
      if (extraDays > 0) {
        totalDirectRevenue += (parseFloat(b.totalAmount) || 0);
        totalDepositsReceived += (parseFloat(b.depositAmount) || 0);
        const rem = (parseFloat(b.remainingAmount) || 0);
        if (rem > 0) {
          totalRemainingBalance += rem;
          pendingBalanceBookingsCount++;
        }
      }
    } else {
      totalDirectRevenue += (parseFloat(b.totalAmount) || 0);
      totalDepositsReceived += (parseFloat(b.depositAmount) || 0);
      const rem = (parseFloat(b.remainingAmount) || 0);
      if (rem > 0) {
        totalRemainingBalance += rem;
        pendingBalanceBookingsCount++;
      }
    }
  });

  const statDaysEl = document.getElementById("statFishTotalDays");
  if (statDaysEl) statDaysEl.textContent = `${totalMonthDays} ${totalMonthDays === 1 ? 'diária' : 'diárias'}`;

  const statMonthNameEl = document.getElementById("statFishMonthName");
  if (statMonthNameEl) statMonthNameEl.textContent = monthYearLabel;

  const statRemEl = document.getElementById("statFishRemainingAmount");
  if (statRemEl) statRemEl.textContent = formatCurrency(totalRemainingBalance);

  const statPendingCountEl = document.getElementById("statFishPendingCount");
  if (statPendingCountEl) {
    statPendingCountEl.textContent = `${pendingBalanceBookingsCount} ${pendingBalanceBookingsCount === 1 ? 'reserva com saldo pendente' : 'reservas com saldo pendente'}`;
  }

  const statTotalRevenueEl = document.getElementById("statFishTotalAmount");
  if (statTotalRevenueEl) statTotalRevenueEl.textContent = formatCurrency(totalDirectRevenue);

  const statDepositTotalEl = document.getElementById("statFishDepositTotal");
  if (statDepositTotalEl) statDepositTotalEl.textContent = `${formatCurrency(totalDepositsReceived)} já pagos em sinais`;

  const statRaffleEl = document.getElementById("statFishRaffleCount");
  if (statRaffleEl) statRaffleEl.textContent = `${raffleDaysCount} ${raffleDaysCount === 1 ? 'diária' : 'diárias'}`;
}

function renderFishingCalendar() {
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const labelEl = document.getElementById("fishCalMonthLabel");
  if (labelEl) labelEl.textContent = `${monthNames[fishCalSelectedMonth]} de ${fishCalSelectedYear}`;

  const gridEl = document.getElementById("fishingCalendarGrid");
  if (!gridEl) return;
  gridEl.innerHTML = "";

  // Day Headers
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  dayNames.forEach(d => {
    const head = document.createElement("div");
    head.className = "cal-day-header";
    head.textContent = d;
    gridEl.appendChild(head);
  });

  const firstDayIndex = new Date(fishCalSelectedYear, fishCalSelectedMonth, 1).getDay();
  const totalDaysInMonth = new Date(fishCalSelectedYear, fishCalSelectedMonth + 1, 0).getDate();
  const totalDaysInPrevMonth = new Date(fishCalSelectedYear, fishCalSelectedMonth + 0).getDate();

  // Previous Month Padding Days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const cell = document.createElement("div");
    cell.className = "cal-day-cell other-month";
    const num = document.createElement("div");
    num.className = "cal-day-num";
    num.textContent = totalDaysInPrevMonth - i;
    cell.appendChild(num);
    gridEl.appendChild(cell);
  }

  const todayStr = getLocalDateStr();
  const allBookings = appData.fishingBookings || [];

  // Current Month Days
  for (let day = 1; day <= totalDaysInMonth; day++) {
    const dayStr = String(day).padStart(2, "0");
    const monthStr = String(fishCalSelectedMonth + 1).padStart(2, "0");
    const currentDateStr = `${fishCalSelectedYear}-${monthStr}-${dayStr}`;

    const cell = document.createElement("div");
    cell.className = "cal-day-cell";
    if (currentDateStr === todayStr) {
      cell.classList.add("today");
    }

    const numEl = document.createElement("div");
    numEl.className = "cal-day-num";
    numEl.textContent = day;
    cell.appendChild(numEl);

    // Find overlapping bookings for this date (supports both array of dates and start/end range)
    const dayBookings = allBookings.filter(b => {
      if (b.status === "cancelled") return false;
      if (b.dates && Array.isArray(b.dates) && b.dates.length > 0) {
        return b.dates.includes(currentDateStr);
      }
      const start = b.startDate;
      const end = b.endDate || b.startDate;
      return start <= currentDateStr && currentDateStr <= end;
    });

    if (dayBookings.length > 0) {
      // Predominant status class
      const primaryBooking = dayBookings[0];
      if (primaryBooking.bookingType === "raffle_prize") {
        cell.classList.add("fishing-day-raffle");
      } else if (primaryBooking.paymentStatus === "paid" || primaryBooking.remainingAmount === 0) {
        cell.classList.add("fishing-day-paid");
      } else if (primaryBooking.paymentStatus === "deposit_paid" || primaryBooking.depositAmount > 0) {
        cell.classList.add("fishing-day-deposit");
      } else {
        cell.classList.add("fishing-day-pending");
      }

      // Add pill badge(s)
      dayBookings.forEach(bk => {
        const tag = document.createElement("div");
        let tagClass = "pending";
        if (bk.bookingType === "raffle_prize") {
          tagClass = "raffle";
        } else if (bk.paymentStatus === "paid" || bk.remainingAmount === 0) {
          tagClass = "paid";
        } else if (bk.depositAmount > 0) {
          tagClass = "deposit";
        }

        tag.className = `fishing-day-booking-tag ${tagClass}`;
        const daysLabel = (bk.totalDays > 1) ? ` (${bk.totalDays}d)` : '';
        tag.textContent = `${bk.clientName}${daysLabel}`;
        tag.title = `${bk.clientName} - ${bk.packageName || 'Diária de Pesca'}\nStatus: ${bk.paymentStatus === 'paid' ? 'Totalmente Pago' : (bk.depositAmount > 0 ? 'Sinal Pago (Restante: ' + formatCurrency(bk.remainingAmount) + ')' : 'Pendente')}`;
        cell.appendChild(tag);
      });

      // Click to view/edit existing booking
      cell.addEventListener("click", () => {
        openEditFishingBookingModal(primaryBooking.id);
      });
    } else {
      // Free day - Click to schedule new booking on this date
      cell.title = `Clique para agendar pescaria no dia ${formatDate(currentDateStr)}`;
      cell.addEventListener("click", () => {
        openNewFishingBookingModal(currentDateStr);
      });
    }

    gridEl.appendChild(cell);
  }

  // Next Month Padding Days
  const totalCells = firstDayIndex + totalDaysInMonth;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-day-cell other-month";
    const num = document.createElement("div");
    num.className = "cal-day-num";
    num.textContent = i;
    cell.appendChild(num);
    gridEl.appendChild(cell);
  }
}

function renderUpcomingFishingSidebar() {
  const container = document.getElementById("sideUpcomingBookingsList");
  if (!container) return;
  container.innerHTML = "";

  const allBookings = appData.fishingBookings || [];
  const todayStr = getLocalDateStr();

  const upcoming = allBookings
    .filter(b => b.status === "scheduled" && (b.endDate || b.startDate) >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const countBadge = document.getElementById("sideUpcomingCount");
  if (countBadge) countBadge.textContent = `${upcoming.length} ${upcoming.length === 1 ? 'agendada' : 'agendadas'}`;

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; font-size: 0.8rem; color: var(--text-dim); padding: 1.5rem 0;">
        Nenhuma pescaria agendada para os próximos dias.<br>
        <button class="btn btn-gold btn-sm" onclick="openNewFishingBookingModal()" style="margin-top: 0.75rem;">
          + Agendar Agora
        </button>
      </div>
    `;
    return;
  }

  upcoming.slice(0, 8).forEach(b => {
    const item = document.createElement("div");
    item.className = "upcoming-trip-item";

    let dateDisplay = formatDate(b.startDate);
    if (b.endDate && b.endDate !== b.startDate) {
      dateDisplay = `${formatDate(b.startDate)} a ${formatDate(b.endDate)}`;
    }

    let statusTag = "";
    if (b.bookingType === "raffle_prize") {
      const extraDays = parseInt(b.extraDays) || 0;
      if (extraDays > 0) {
        statusTag = `<span class="badge-fish-raffle">Prêmio + ${extraDays}d Extra</span>`;
      } else {
        statusTag = `<span class="badge-fish-raffle">Prêmio de Rifa</span>`;
      }
    } else if (b.paymentStatus === "paid" || b.remainingAmount === 0) {
      statusTag = `<span class="badge-fish-paid">Total Pago</span>`;
    } else if (b.depositAmount > 0) {
      statusTag = `<span class="badge-fish-deposit">Sinal Pago</span>`;
    } else {
      statusTag = `<span class="badge-fish-pending">Pendente</span>`;
    }

    let finInfo = "";
    if (b.bookingType === "raffle_prize") {
      if (b.remainingAmount > 0) {
        finInfo = `<span style="color: var(--primary-gold); font-weight: 700;">Restante: ${formatCurrency(b.remainingAmount)}</span>`;
      } else {
        finInfo = `<span style="color: #38bdf8;">100% Coberto pela Ação</span>`;
      }
    } else if (b.remainingAmount > 0) {
      finInfo = `<span style="color: var(--primary-gold); font-weight: 700;">Restante: ${formatCurrency(b.remainingAmount)}</span>`;
    } else {
      finInfo = `<span style="color: var(--status-paid-text); font-weight: 700;">Quitado: ${formatCurrency(b.totalAmount)}</span>`;
    }

    let structureLabel = b.packageName || "Dupla (2 Pessoas)";
    if (b.structureType === "custom") {
      structureLabel = `Personalizado (${b.boatsCount || 1} barco${(b.boatsCount || 1) > 1 ? 's' : ''}${b.kayaksCount > 0 ? ', ' + b.kayaksCount + ' caiaque(s)' : ''})`;
    }

    item.innerHTML = `
      <div class="upcoming-trip-header">
        <div class="upcoming-trip-date">${dateDisplay} (${b.totalDays || 1}d)</div>
        ${statusTag}
      </div>
      <div class="upcoming-trip-name">${escapeHtml(b.clientName)}</div>
      <div class="upcoming-trip-package">${escapeHtml(structureLabel)} • ${b.fishermenCount || 2} pescadores</div>
      <div class="upcoming-trip-footer">
        <span>Guia: <strong>${escapeHtml(b.guideName || 'Thiago Witeck')}</strong></span>
        ${finInfo}
      </div>
    `;

    item.addEventListener("click", (e) => {
      if (e.target && e.target.closest && e.target.closest("button, a, input, select")) return;
      openEditFishingBookingModal(b.id);
    });

    container.appendChild(item);
  });
}

function renderFishingBookingsList() {
  const container = document.getElementById("fishingBookingsContainer");
  if (!container) return;
  container.innerHTML = "";

  const allBookings = appData.fishingBookings || [];
  const searchTerm = (document.getElementById("inputSearchFishing") ? document.getElementById("inputSearchFishing").value : "").trim().toLowerCase();
  const todayStr = getLocalDateStr();

  const filtered = allBookings.filter(b => {
    // Search query match
    if (searchTerm) {
      const matchName = (b.clientName || "").toLowerCase().includes(searchTerm);
      const matchPhone = (b.clientPhone || "").toLowerCase().includes(searchTerm);
      const matchPkg = (b.packageName || "").toLowerCase().includes(searchTerm);
      const matchRaffle = (b.raffleRef || "").toLowerCase().includes(searchTerm);
      const matchNotes = (b.notes || "").toLowerCase().includes(searchTerm);
      if (!matchName && !matchPhone && !matchPkg && !matchRaffle && !matchNotes) return false;
    }

    // Tab Filter
    if (currentFishingFilter === "all") return true;
    if (currentFishingFilter === "upcoming") {
      return b.status === "scheduled" && (b.endDate || b.startDate) >= todayStr;
    }
    if (currentFishingFilter === "with_balance") {
      return b.remainingAmount > 0;
    }
    if (currentFishingFilter === "raffle") {
      return b.bookingType === "raffle_prize";
    }
    if (currentFishingFilter === "completed") {
      return b.status === "completed" || (b.status === "scheduled" && (b.endDate || b.startDate) < todayStr);
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-dim); background: var(--bg-card-glass); border-radius: var(--radius-md); border: 1px dashed var(--border-gold);">
        <h4 style="color: var(--text-light); font-size: 1.1rem; margin-bottom: 0.35rem;">Nenhuma reserva encontrada</h4>
        <p style="font-size: 0.85rem; max-width: 420px; margin: 0 auto 1.25rem;">Não há diárias ou pescarias registradas com os filtros selecionados.</p>
        <button class="btn btn-gold" onclick="openNewFishingBookingModal()">+ Agendar Nova Pescaria</button>
      </div>
    `;
    return;
  }

  // Sort: Upcoming first, then by date descending
  filtered.sort((a, b) => b.startDate.localeCompare(a.startDate));

  filtered.forEach(b => {
    const card = document.createElement("div");
    card.className = "fishing-card";

    let dateDisplay = formatDate(b.startDate);
    if (b.endDate && b.endDate !== b.startDate) {
      dateDisplay = `${formatDate(b.startDate)} a ${formatDate(b.endDate)}`;
    }

    let statusBadge = "";
    if (b.status === "cancelled") {
      statusBadge = `<span class="badge-danger">Cancelada</span>`;
    } else if (b.bookingType === "raffle_prize") {
      const extraDays = parseInt(b.extraDays) || 0;
      if (extraDays > 0 && b.remainingAmount > 0) {
        statusBadge = `<span class="badge-fish-deposit">Prêmio + ${extraDays}d Extra (R$ ${b.remainingAmount} rest.)</span>`;
      } else if (extraDays > 0) {
        statusBadge = `<span class="badge-fish-paid">Prêmio + ${extraDays}d Extra (Quitado)</span>`;
      } else {
        statusBadge = `<span class="badge-fish-raffle">Prêmio de Rifa</span>`;
      }
    } else if (b.paymentStatus === "paid" || b.remainingAmount === 0) {
      statusBadge = `<span class="badge-fish-paid">Totalmente Pago</span>`;
    } else if (b.depositAmount > 0) {
      statusBadge = `<span class="badge-fish-deposit">Sinal Pago (R$ ${b.remainingAmount} rest.)</span>`;
    } else {
      statusBadge = `<span class="badge-fish-pending">Pendente</span>`;
    }

    // Phone link with WhatsApp icon
    let phoneHtml = "";
    if (b.clientPhone) {
      const cleanPhone = b.clientPhone.replace(/\D/g, "");
      phoneHtml = `
        <a href="https://wa.me/55${cleanPhone}" target="_blank" class="fishing-client-phone" title="Abrir conversa no WhatsApp">
          <span style="color: #22c55e;">●</span> ${escapeHtml(b.clientPhone)}
        </a>
      `;
    }

    // Financial Box
    let financialHtml = "";
    if (b.bookingType === "raffle_prize") {
      const extraDays = parseInt(b.extraDays) || 0;
      const raffleDays = parseInt(b.raffleDays) || 1;

      if (extraDays > 0) {
        financialHtml = `
          <div class="fishing-financial-box" style="border-color: rgba(14, 165, 233, 0.5);">
            <div style="font-size: 0.78rem; font-weight: 700; color: #38bdf8; margin-bottom: 0.2rem;">
              PREMIAÇÃO: ${escapeHtml(b.raffleRef || 'Ação Eldorado')} (${raffleDays} diária${raffleDays > 1 ? 's' : ''} coberta${raffleDays > 1 ? 's' : ''})
            </div>
            <div class="fishing-fin-row" style="font-size: 0.78rem;">
              <span>Diárias Extras Adicionais (+${extraDays} dia${extraDays > 1 ? 's' : ''}):</span>
              <strong>${formatCurrency(b.totalAmount)}</strong>
            </div>
            <div class="fishing-fin-row" style="font-size: 0.78rem;">
              <span>Sinal Já Pago dos Dias Extras:</span>
              <strong style="color: var(--status-paid-text);">${formatCurrency(b.depositAmount)}</strong>
            </div>
            <div class="fishing-fin-row remaining">
              <span style="color: var(--primary-gold);">Saldo Restante a Pagar no Rancho:</span>
              <strong style="color: ${b.remainingAmount > 0 ? 'var(--primary-gold)' : 'var(--status-paid-text)'}; font-size: 1.05rem;">
                ${b.remainingAmount > 0 ? formatCurrency(b.remainingAmount) : 'QUITADO (R$ 0,00)'}
              </strong>
            </div>
          </div>
        `;
      } else {
        financialHtml = `
          <div class="fishing-financial-box" style="border-color: rgba(14, 165, 233, 0.4); background: rgba(14, 165, 233, 0.08);">
            <div style="font-size: 0.78rem; font-weight: 700; color: #38bdf8;">PREMIAÇÃO DA AÇÃO / RIFA:</div>
            <div style="font-size: 0.95rem; font-weight: 800; color: #ffffff; margin-top: 0.2rem;">${escapeHtml(b.raffleRef || 'Ação Eldorado Pesca')}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.25rem;">
              Diária 100% coberta pelo prêmio ganho • Quitado (R$ 0,00 a pagar)
            </div>
          </div>
        `;
      }
    } else {
      financialHtml = `
        <div class="fishing-financial-box">
          <div class="fishing-fin-row">
            <span>Valor Total do Pacote:</span>
            <strong style="color: var(--text-light);">${formatCurrency(b.totalAmount)}</strong>
          </div>
          <div class="fishing-fin-row">
            <span>Sinal / Entrada Já Pago:</span>
            <strong style="color: var(--status-paid-text);">${formatCurrency(b.depositAmount)}</strong>
          </div>
          <div class="fishing-fin-row remaining">
            <span style="color: var(--primary-gold);">Saldo Restante a Pagar no Rancho:</span>
            <strong style="color: ${b.remainingAmount > 0 ? 'var(--primary-gold)' : 'var(--status-paid-text)'}; font-size: 1.05rem;">
              ${b.remainingAmount > 0 ? formatCurrency(b.remainingAmount) : 'QUITADO (R$ 0,00)'}
            </strong>
          </div>
        </div>
      `;
    }

    // Structure display label
    let structureTitle = "Dupla (2 Pescadores)";
    if (b.structureType === "trio") {
      structureTitle = "Trio (3 Pescadores)";
    } else if (b.structureType === "custom") {
      structureTitle = `Personalizado (${b.boatsCount || 1} Barco${(b.boatsCount || 1) > 1 ? 's' : ''}${b.kayaksCount > 0 ? ' • ' + b.kayaksCount + ' Caiaque(s)' : ''})`;
    }

    // Action buttons
    let actionsHtml = "";
    if (b.remainingAmount > 0) {
      actionsHtml += `
        <button class="btn btn-gold btn-sm" onclick="openFishingPaymentModal('${b.id}')">
          Quitar Saldo Restante
        </button>
      `;
    }
    actionsHtml += `
      <button class="btn btn-whatsapp btn-sm" onclick="openFishingWhatsAppModal('${b.id}')">
        WhatsApp
      </button>
      <button class="btn btn-secondary btn-sm" onclick="openEditFishingBookingModal('${b.id}')" title="Editar">
        Editar
      </button>
      <button class="btn-delete-vale" onclick="deleteFishingBooking('${b.id}')" title="Excluir Reserva">
        Excluir
      </button>
    `;

    card.innerHTML = `
      <div>
        <div class="fishing-card-header">
          <div>
            <div class="fishing-client-title">${escapeHtml(b.clientName)}</div>
            ${phoneHtml}
          </div>
          <div>${statusBadge}</div>
        </div>

        <div class="fishing-dates-banner">
          <div>
            <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Data da Pescaria:</div>
            <div class="fishing-dates-val">${dateDisplay}</div>
          </div>
          <div class="fishing-days-count-badge">${b.totalDays || 1} ${(b.totalDays || 1) === 1 ? 'Diária' : 'Diárias'}</div>
        </div>

        <div class="fishing-details-grid">
          <div class="fishing-detail-box">
            <div class="fishing-detail-label">Pacote / Estrutura</div>
            <div class="fishing-detail-value" title="${escapeHtml(structureTitle)}">${escapeHtml(structureTitle)}</div>
          </div>
          <div class="fishing-detail-box">
            <div class="fishing-detail-label">Pescadores / Guia</div>
            <div class="fishing-detail-value">${b.fishermenCount || 2} pescadores • ${escapeHtml(b.guideName || 'Thiago Witeck')}</div>
          </div>
        </div>

        ${b.customStructure ? `
          <div style="font-size: 0.75rem; color: var(--text-light); background: rgba(229, 193, 88, 0.08); padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid rgba(229, 193, 88, 0.2); margin-bottom: 0.75rem;">
            <strong>Estrutura:</strong> ${escapeHtml(b.customStructure)}
          </div>
        ` : ''}

        ${financialHtml}

        ${b.notes ? `
          <div style="font-size: 0.78rem; color: var(--text-dim); background: var(--bg-input); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light); margin-bottom: 0.85rem; font-style: italic;">
            Obs: ${escapeHtml(b.notes)}
          </div>
        ` : ''}
      </div>

      <div class="vale-actions-bar">
        ${actionsHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function setFishingFilter(filter) {
  currentFishingFilter = filter;
  document.querySelectorAll("#filterFishAll, #filterFishUpcoming, #filterFishWithBalance, #filterFishRaffle, #filterFishCompleted").forEach(btn => btn.classList.remove("active"));
  
  if (filter === "all") document.getElementById("filterFishAll").classList.add("active");
  if (filter === "upcoming") document.getElementById("filterFishUpcoming").classList.add("active");
  if (filter === "with_balance") document.getElementById("filterFishWithBalance").classList.add("active");
  if (filter === "raffle") document.getElementById("filterFishRaffle").classList.add("active");
  if (filter === "completed") document.getElementById("filterFishCompleted").classList.add("active");

  renderFishingBookingsList();
}

function toggleFishingStructureFields() {
  const type = document.getElementById("fishStructureType").value;
  const customPanel = document.getElementById("groupFishCustomStructure");
  if (type === "custom") {
    customPanel.style.display = "block";
    renderBoatsDistributionInputs();
  } else {
    customPanel.style.display = "none";
  }
}

function extractDaysFromDescription(desc) {
  if (!desc) return 1;
  const matchNum = desc.match(/(\d+)\s*di[aá]ria/i);
  if (matchNum) return Math.max(1, parseInt(matchNum[1], 10));
  if (/duas\s*di[aá]rias/i.test(desc)) return 2;
  if (/tr[eê]s\s*di[aá]rias/i.test(desc)) return 3;
  if (/uma\s*di[aá]ria/i.test(desc)) return 1;
  return 1;
}

function renderBoatsDistributionInputs(savedDistribution = '') {
  const boatsInput = document.getElementById("fishBoatsCount");
  const boatsCount = Math.max(1, parseInt(boatsInput ? boatsInput.value : "1", 10) || 1);
  const list = document.getElementById("fishBoatsRowsList");
  if (!list) return;
  list.innerHTML = "";

  for (let i = 1; i <= boatsCount; i++) {
    const row = document.createElement("div");
    row.className = "boat-row-item";
    row.innerHTML = `
      <div style="font-size: 0.72rem; font-weight: 700; color: var(--primary-gold);">Barco ${i}:</div>
      <input type="number" class="form-input boat-capacity-input" data-boat="${i}" min="1" value="2" oninput="updateCustomTotalFishermen()" style="padding: 0.3rem 0.5rem; font-size: 0.82rem;">
    `;
    list.appendChild(row);
  }

  updateCustomTotalFishermen();
}

function updateCustomTotalFishermen() {
  const boatInputs = document.querySelectorAll(".boat-capacity-input, .boat-capacity-select");
  let totalPeopleInBoats = 0;
  const parts = [];

  boatInputs.forEach((inp, idx) => {
    const count = Math.max(1, parseInt(inp.value, 10) || 1);
    totalPeopleInBoats += count;
    parts.push(`Barco ${idx + 1}: ${count} pessoa${count > 1 ? 's' : ''}`);
  });

  const kayaksInput = document.getElementById("fishKayaksCount");
  const kayaksCount = Math.max(0, parseInt(kayaksInput ? kayaksInput.value : "0", 10) || 0);
  const grandTotal = totalPeopleInBoats + kayaksCount;

  const fishermenInput = document.getElementById("fishCustomFishermenCount");
  if (fishermenInput) fishermenInput.value = grandTotal;

  let summary = `${boatInputs.length} Barco${boatInputs.length > 1 ? 's' : ''} (${parts.join(" | ")})`;
  if (kayaksCount > 0) {
    summary += ` + ${kayaksCount} Caiaque${kayaksCount > 1 ? 's' : ''}`;
  }
  const summaryEl = document.getElementById("fishBoatsSummaryText");
  if (summaryEl) summaryEl.textContent = summary;
}

function renderFishingDaysInputs(savedDates = null) {
  const countInput = document.getElementById("fishTotalDaysCount");
  const count = Math.max(1, parseInt(countInput ? countInput.value : "1", 10) || 1);
  const listEl = document.getElementById("fishDaysInputsList");
  if (!listEl) return;

  let existingVals = [];
  if (savedDates && Array.isArray(savedDates) && savedDates.length > 0) {
    existingVals = savedDates.map(d => getLocalDateStr(d));
  } else {
    document.querySelectorAll(".fishing-day-input").forEach(inp => {
      if (inp.value) existingVals.push(inp.value);
    });
  }

  const baseDateStr = existingVals[0] || getLocalDateStr();
  const baseParts = baseDateStr.split("-");
  const baseYear = parseInt(baseParts[0], 10) || new Date().getFullYear();
  const baseMonth = (parseInt(baseParts[1], 10) || 1) - 1;
  const baseDay = parseInt(baseParts[2], 10) || 1;

  listEl.innerHTML = "";

  for (let i = 1; i <= count; i++) {
    let dayVal = existingVals[i - 1];
    if (!dayVal) {
      const nextDate = new Date(baseYear, baseMonth, baseDay + (i - 1));
      dayVal = getLocalDateStr(nextDate);
    }

    const row = document.createElement("div");
    row.className = "fishing-dates-row-item";
    row.style.cssText = "display: flex; flex-direction: column; gap: 0.25rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border-light); border-radius: 4px; padding: 0.45rem 0.65rem;";
    row.innerHTML = `
      <label style="font-size: 0.72rem; font-weight: 700; color: var(--primary-gold);">Data Diária ${i} *</label>
      <input type="date" class="form-input fishing-day-input" data-day="${i}" value="${dayVal}" onchange="onFishingDateInputChange(${i})" style="padding: 0.35rem 0.5rem; font-size: 0.82rem;">
    `;
    listEl.appendChild(row);
  }

  updateFishingDaysSummary();

  const isDirect = document.getElementById("fishBookingType").value === "direct";
  if (isDirect) {
    const currentTotal = parseFloat(document.getElementById("fishTotalAmount").value) || 0;
    if (currentTotal === 0 || currentTotal === 2500 || currentTotal % 2500 === 0) {
      document.getElementById("fishTotalAmount").value = (count * 2500).toFixed(2);
      document.getElementById("fishDepositAmount").value = (count * 1000).toFixed(2);
    }
  }

  recalculateFishingRemaining();
}

function onFishingDateInputChange(changedDayIndex) {
  const inputs = Array.from(document.querySelectorAll(".fishing-day-input"));
  if (changedDayIndex === 1 && inputs.length > 1) {
    const firstVal = inputs[0].value;
    if (firstVal) {
      const parts = firstVal.split("-");
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      for (let i = 1; i < inputs.length; i++) {
        if (!inputs[i].value || inputs[i].value <= firstVal) {
          const nextD = new Date(y, m, d + i);
          inputs[i].value = getLocalDateStr(nextD);
        }
      }
    }
  }
  updateFishingDaysSummary();
}

function updateFishingDaysSummary() {
  const inputs = Array.from(document.querySelectorAll(".fishing-day-input"));
  const dates = inputs.map(i => i.value).filter(Boolean);
  const summaryEl = document.getElementById("fishDaysSummaryText");
  if (!summaryEl) return;

  if (dates.length === 0) {
    summaryEl.textContent = "Nenhuma data definida";
  } else if (dates.length === 1) {
    summaryEl.textContent = `1 diária: ${formatDate(dates[0])}`;
  } else {
    const formatted = dates.map(formatDate);
    const last = formatted.pop();
    summaryEl.textContent = `${dates.length} diárias: ${formatted.join(", ")} e ${last}`;
  }
}

function openNewFishingBookingFromPrize(prizeId) {
  const p = (appData.valesAndPrizes || []).find(v => v.id === prizeId);
  if (!p) return;

  document.getElementById("fishBookingId").value = "";
  document.getElementById("modalFishingBookingTitle").textContent = `Agendar Diária Ganha em Ação: ${p.customerName}`;
  document.getElementById("btnDeleteFishingBooking").style.display = "none";

  document.getElementById("fishBookingType").value = "raffle_prize";
  document.getElementById("fishPrizeId").value = p.id;
  document.getElementById("fishRaffleRef").value = p.raffleRef || p.description || "105° AÇÃO ELDORADO PESCA";

  const banner = document.getElementById("groupFishRaffleBanner");
  if (banner) {
    banner.style.display = "block";
    document.getElementById("fishRaffleBannerTitle").textContent = `${p.customerName} — ${p.raffleRef || p.description}`;
    const covered = extractDaysFromDescription(p.description);
    document.getElementById("fishRaffleBannerDaysBadge").textContent = `${covered} ${covered === 1 ? 'Diária Coberta' : 'Diárias Cobertas'}`;
  }

  const nameInput = document.getElementById("fishClientName");
  nameInput.value = p.customerName || "";
  nameInput.readOnly = false;
  nameInput.disabled = false;

  const phoneInput = document.getElementById("fishClientPhone");
  phoneInput.value = p.customerPhone || "";
  phoneInput.readOnly = false;
  phoneInput.disabled = false;

  const coveredDays = extractDaysFromDescription(p.description);
  document.getElementById("fishRaffleCoveredDays").value = String(coveredDays);
  document.getElementById("fishRaffleExtraDays").value = "0";
  document.getElementById("fishTotalDaysCount").value = String(coveredDays);

  document.getElementById("fishStructureType").value = "dupla";
  document.getElementById("groupFishCustomStructure").style.display = "none";
  document.getElementById("fishCustomGuide").value = "Thiago Witeck (Titular)";
  document.getElementById("fishBoatsCount").value = "1";
  document.getElementById("fishKayaksCount").value = "0";
  document.getElementById("fishCustomFishermenCount").value = "2";
  document.getElementById("fishCustomDetails").value = "";

  document.getElementById("groupFishFinancial").style.display = "none";
  document.getElementById("fishTotalAmount").value = "0.00";
  document.getElementById("fishDepositAmount").value = "0.00";
  document.getElementById("fishNotes").value = `Prêmio Ganho na Ação: ${p.description}`;

  // Cleanly initialize with local today date
  renderFishingDaysInputs([getLocalDateStr()]);
  recalculateFishingRemaining();
  openModal("modalFishingBooking");
}

function openNewFishingBookingModal(preselectedDate = null) {
  document.getElementById("fishBookingId").value = "";
  document.getElementById("modalFishingBookingTitle").textContent = "Agendar Nova Pescaria (Reserva Direta)";
  document.getElementById("btnDeleteFishingBooking").style.display = "none";

  document.getElementById("fishBookingType").value = "direct";
  document.getElementById("fishPrizeId").value = "";
  document.getElementById("fishRaffleRef").value = "";
  document.getElementById("fishRaffleCoveredDays").value = "1";
  document.getElementById("fishRaffleExtraDays").value = "0";

  const banner = document.getElementById("groupFishRaffleBanner");
  if (banner) banner.style.display = "none";

  const nameInput = document.getElementById("fishClientName");
  nameInput.value = "";
  nameInput.readOnly = false;
  nameInput.disabled = false;

  const phoneInput = document.getElementById("fishClientPhone");
  phoneInput.value = "";
  phoneInput.readOnly = false;
  phoneInput.disabled = false;

  document.getElementById("fishTotalDaysCount").value = "1";

  document.getElementById("fishStructureType").value = "dupla";
  document.getElementById("groupFishCustomStructure").style.display = "none";
  document.getElementById("fishCustomGuide").value = "Thiago Witeck (Titular)";
  document.getElementById("fishBoatsCount").value = "1";
  document.getElementById("fishKayaksCount").value = "0";
  document.getElementById("fishCustomFishermenCount").value = "2";
  document.getElementById("fishCustomDetails").value = "";

  document.getElementById("groupFishFinancial").style.display = "block";
  document.getElementById("labelFishFinancialTitle").textContent = "Controle de Pagamento (Sinal / Entrada e Restante)";
  document.getElementById("labelFishTotalAmount").textContent = "Valor Total do Pacote (R$)";
  document.getElementById("labelFishDepositAmount").textContent = "Sinal / Entrada Já Pago (R$)";
  document.getElementById("labelFishRemainingTitle").textContent = "Saldo Restante a Pagar no Rancho:";

  document.getElementById("fishTotalAmount").value = "2500.00";
  document.getElementById("fishDepositAmount").value = "1000.00";
  document.getElementById("fishNotes").value = "";

  const targetDate = preselectedDate ? getLocalDateStr(preselectedDate) : getLocalDateStr();
  renderFishingDaysInputs([targetDate]);

  recalculateFishingRemaining();
  openModal("modalFishingBooking");

  setTimeout(() => {
    nameInput.focus();
  }, 100);
}

function openEditFishingBookingModal(bookingId) {
  const b = (appData.fishingBookings || []).find(item => item.id === bookingId);
  if (!b) return;

  document.getElementById("fishBookingId").value = b.id;
  document.getElementById("modalFishingBookingTitle").textContent = `Editar Reserva: ${b.clientName}`;
  document.getElementById("btnDeleteFishingBooking").style.display = "block";

  document.getElementById("fishBookingType").value = b.bookingType || "direct";
  document.getElementById("fishPrizeId").value = b.prizeId || "";
  document.getElementById("fishRaffleRef").value = b.raffleRef || "";
  document.getElementById("fishRaffleCoveredDays").value = String(b.raffleDays || 1);
  document.getElementById("fishRaffleExtraDays").value = String(b.extraDays || 0);

  const banner = document.getElementById("groupFishRaffleBanner");
  if (banner) {
    if (b.bookingType === "raffle_prize") {
      banner.style.display = "block";
      document.getElementById("fishRaffleBannerTitle").textContent = `${b.clientName} — ${b.raffleRef || 'Prêmio de Rifa'}`;
      document.getElementById("fishRaffleBannerDaysBadge").textContent = `${b.raffleDays || 1} Diária(s) Coberta(s)`;
    } else {
      banner.style.display = "none";
    }
  }

  const nameInput = document.getElementById("fishClientName");
  nameInput.value = b.clientName || "";
  nameInput.readOnly = false;
  nameInput.disabled = false;

  const phoneInput = document.getElementById("fishClientPhone");
  phoneInput.value = b.clientPhone || "";
  phoneInput.readOnly = false;
  phoneInput.disabled = false;

  const totalDays = parseInt(b.totalDays) || (b.dates ? b.dates.length : 1);
  document.getElementById("fishTotalDaysCount").value = String(totalDays);

  const datesToLoad = (b.dates && Array.isArray(b.dates) && b.dates.length > 0) ? b.dates : [b.startDate];
  renderFishingDaysInputs(datesToLoad);

  // Structure fields
  const structureType = b.structureType || (b.fishermenCount === 3 ? "trio" : "dupla");
  document.getElementById("fishStructureType").value = structureType;
  if (structureType === "custom") {
    document.getElementById("groupFishCustomStructure").style.display = "block";
    document.getElementById("fishCustomGuide").value = b.guideName || "Thiago Witeck (Titular)";
    document.getElementById("fishBoatsCount").value = String(b.boatsCount || 1);
    document.getElementById("fishKayaksCount").value = String(b.kayaksCount || 0);
    renderBoatsDistributionInputs();
    document.getElementById("fishCustomFishermenCount").value = String(b.fishermenCount || 2);
    document.getElementById("fishCustomDetails").value = b.customStructure || "";
  } else {
    document.getElementById("groupFishCustomStructure").style.display = "none";
  }

  if (b.bookingType === "raffle_prize" && (b.extraDays || 0) === 0) {
    document.getElementById("groupFishFinancial").style.display = "none";
  } else {
    document.getElementById("groupFishFinancial").style.display = "block";
  }

  document.getElementById("fishTotalAmount").value = (parseFloat(b.totalAmount) || 0).toFixed(2);
  document.getElementById("fishDepositAmount").value = (parseFloat(b.depositAmount) || 0).toFixed(2);
  document.getElementById("fishNotes").value = b.notes || "";

  recalculateFishingRemaining();
  openModal("modalFishingBooking");
}

function recalculateFishingRemaining() {
  const total = parseFloat(document.getElementById("fishTotalAmount").value) || 0;
  const deposit = parseFloat(document.getElementById("fishDepositAmount").value) || 0;
  const remaining = Math.max(0, total - deposit);
  
  const displayEl = document.getElementById("fishRemainingDisplay");
  if (displayEl) {
    displayEl.textContent = formatCurrency(remaining);
    displayEl.style.color = remaining > 0 ? "var(--primary-gold)" : "var(--status-paid-text)";
  }
}

let isSavingFishingBooking = false;

async function saveFishingBooking() {
  if (isSavingFishingBooking) return;
  isSavingFishingBooking = true;

  const saveBtn = document.getElementById("btnSaveFishingBooking");
  if (saveBtn) saveBtn.disabled = true;

  try {
    const id = document.getElementById("fishBookingId").value.trim();
    const clientName = document.getElementById("fishClientName").value.trim().toUpperCase();
    const clientPhone = document.getElementById("fishClientPhone").value.trim();
    const bookingType = document.getElementById("fishBookingType").value || "direct";
    const prizeId = document.getElementById("fishPrizeId").value || null;
    const raffleRef = document.getElementById("fishRaffleRef").value.trim();

    if (!clientName) {
      showToast("Por favor, informe o nome do pescador / cliente.", "warning");
      return;
    }

    const dayInputs = Array.from(document.querySelectorAll(".fishing-day-input"));
    const dates = dayInputs.map(i => i.value).filter(Boolean);

    if (dates.length === 0) {
      showToast("Por favor, defina ao menos 1 data para a pescaria.", "warning");
      return;
    }

    dates.sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const totalDays = dates.length;

    const isRaffle = bookingType === "raffle_prize";
    let raffleDays = isRaffle ? totalDays : 1;
    let extraDays = 0;

    // Structure
    const structureType = document.getElementById("fishStructureType").value;
    let packageName = "Dupla (2 Pescadores)";
    let fishermenCount = 2;
    let boatsCount = 1;
    let kayaksCount = 0;
    let customStructure = "";
    let guideName = "Thiago Witeck";

    if (structureType === "dupla") {
      packageName = "Dupla (2 Pescadores)";
      fishermenCount = 2;
      boatsCount = 1;
    } else if (structureType === "trio") {
      packageName = "Trio (3 Pescadores)";
      fishermenCount = 3;
      boatsCount = 1;
    } else if (structureType === "custom") {
      packageName = "Personalizado";
      guideName = document.getElementById("fishCustomGuide").value;
      fishermenCount = parseInt(document.getElementById("fishCustomFishermenCount").value, 10) || 2;
      boatsCount = parseInt(document.getElementById("fishBoatsCount").value, 10) || 1;
      kayaksCount = parseInt(document.getElementById("fishKayaksCount").value, 10) || 0;
      customStructure = document.getElementById("fishCustomDetails").value.trim();
    }

    const totalAmount = isRaffle ? 0 : (parseFloat(document.getElementById("fishTotalAmount").value) || 0);
    const depositAmount = isRaffle ? 0 : (parseFloat(document.getElementById("fishDepositAmount").value) || 0);
    const remainingAmount = Math.max(0, totalAmount - depositAmount);

    let paymentStatus = "pending";
    if (isRaffle) {
      paymentStatus = "raffle_covered";
    } else if (remainingAmount === 0 && totalAmount > 0) {
      paymentStatus = "paid";
    } else if (depositAmount > 0) {
      paymentStatus = "deposit_paid";
    }

    const notes = document.getElementById("fishNotes").value.trim();

    // Deduplication check: check if an existing booking already exists by ID or prizeId
    let targetBookingId = id;
    if (!targetBookingId && prizeId) {
      const existingPrizeBooking = (appData.fishingBookings || []).find(b => b.prizeId === prizeId);
      if (existingPrizeBooking) targetBookingId = existingPrizeBooking.id;
    }

    const bookingData = {
      id: targetBookingId || ("fb-" + Date.now()),
      clientName: clientName,
      clientPhone: clientPhone,
      bookingType: bookingType,
      raffleRef: raffleRef,
      prizeId: prizeId,
      startDate: startDate,
      endDate: endDate,
      dates: dates,
      totalDays: totalDays,
      raffleDays: raffleDays,
      extraDays: extraDays,
      packageName: packageName,
      structureType: structureType,
      fishermenCount: fishermenCount,
      boatsCount: boatsCount,
      kayaksCount: kayaksCount,
      customStructure: customStructure,
      totalAmount: totalAmount,
      depositAmount: depositAmount,
      remainingAmount: remainingAmount,
      paymentStatus: paymentStatus,
      paymentMethod: "Pix",
      notes: notes,
      guideName: guideName,
      status: "scheduled",
      createdAt: getLocalDateStr()
    };

    // If this booking came from a raffle prize in valesAndPrizes, sync its status to 'scheduled'
    if (prizeId) {
      const p = (appData.valesAndPrizes || []).find(v => v.id === prizeId);
      if (p) {
        p.status = "scheduled";
        p.notes = `Diária de Pesca confirmada para ${dates.map(formatDate).join(", ")}`;
      }
    } else if (isRaffle) {
      const p = (appData.valesAndPrizes || []).find(v => (v.customerName || '').trim().toUpperCase() === clientName);
      if (p) {
        p.status = "scheduled";
        p.notes = `Diária de Pesca confirmada para ${dates.map(formatDate).join(", ")}`;
      }
    }

    if (!appData.fishingBookings) appData.fishingBookings = [];
    const existingIdx = appData.fishingBookings.findIndex(b => b.id === bookingData.id || (prizeId && b.prizeId === prizeId));
    if (existingIdx >= 0) {
      appData.fishingBookings[existingIdx] = bookingData;
    } else {
      appData.fishingBookings.push(bookingData);
    }

    await saveState({
      type: "BOOK_FISHING",
      tableName: "fishing_bookings",
      recordId: bookingData.id,
      payload: bookingData
    });
    renderFishingAgendaView();
    renderValesView();
    updateGlobalStats();
    closeModal("modalFishingBooking");
    showToast(`Pescaria de ${clientName} salva com sucesso!`, "success");
  } finally {
    isSavingFishingBooking = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function deleteActiveFishingBooking() {
  const id = document.getElementById("fishBookingId").value;
  if (!id) return;
  await deleteFishingBooking(id);
  closeModal("modalFishingBooking");
}

async function deleteFishingBooking(bookingId) {
  const b = (appData.fishingBookings || []).find(item => item.id === bookingId);
  const name = b ? b.clientName : "esta reserva";

  if (confirm(`Deseja realmente cancelar/excluir o agendamento de ${name}?`)) {
    if (b && b.prizeId) {
      const prizeItem = (appData.valesAndPrizes || []).find(v => v.id === b.prizeId);
      if (prizeItem) {
        prizeItem.status = prizeItem.type === "dual_choice" ? "pending_choice" : "pending_pickup";
        prizeItem.notes = "Agendamento cancelado - Aguardando definição de nova data";
      }
    }

    appData.fishingBookings = (appData.fishingBookings || []).filter(item => item.id !== bookingId);

    if (window.localDB && typeof window.localDB.deleteRecord === 'function') {
      await window.localDB.deleteRecord('fishing_bookings', bookingId);
    }

    await saveState({
      type: "DELETE_FISHING_BOOKING",
      tableName: "fishing_bookings",
      recordId: bookingId,
      payload: { id: bookingId }
    });

    renderFishingAgendaView();
    renderValesView();
    showToast("Reserva excluída do calendário.", "success");
  }
}

/* Modal: Quitar Saldo Restante / Pagamento */
function openFishingPaymentModal(bookingId) {
  const b = (appData.fishingBookings || []).find(item => item.id === bookingId);
  if (!b) return;

  document.getElementById("payFishBookingId").value = b.id;
  document.getElementById("payFishClientName").textContent = b.clientName;
  
  let dateDisplay = formatDate(b.startDate);
    if (b.endDate && b.endDate !== b.startDate) {
    dateDisplay = `${formatDate(b.startDate)} a ${formatDate(b.endDate)}`;
  }
  document.getElementById("payFishDates").textContent = `${dateDisplay} (${b.totalDays || 1} Diária(s) • ${b.packageName || 'Eldorado Lake'})`;
  document.getElementById("payFishTotal").textContent = formatCurrency(b.totalAmount);
  document.getElementById("payFishDeposit").textContent = formatCurrency(b.depositAmount);
  document.getElementById("payFishRemaining").textContent = formatCurrency(b.remainingAmount);

  document.getElementById("payFishAmount").value = (parseFloat(b.remainingAmount) || 0).toFixed(2);
  document.getElementById("payFishNotes").value = "";

  openModal("modalFishingPayment");
}

let isConfirmingFishingPayment = false;

async function confirmFishingPayment() {
  if (isConfirmingFishingPayment) return;
  isConfirmingFishingPayment = true;

  const payBtn = document.getElementById("btnConfirmFishingPayment");
  if (payBtn) payBtn.disabled = true;

  try {
    const id = document.getElementById("payFishBookingId").value;
    const b = (appData.fishingBookings || []).find(item => item.id === id);
    if (!b) return;

    const payVal = parseFloat(document.getElementById("payFishAmount").value) || 0;
    const notes = document.getElementById("payFishNotes").value.trim();

    if (payVal <= 0) {
      showToast("Informe o valor a quitar.", "warning");
      return;
    }

    const newDeposit = (b.depositAmount || 0) + payVal;
    const newRemaining = Math.max(0, (b.totalAmount || 0) - newDeposit);
    b.depositAmount = newDeposit;
    b.remainingAmount = newRemaining;
    b.paymentStatus = newRemaining === 0 ? "paid" : "deposit_paid";
    if (notes) {
      b.notes = (b.notes ? b.notes + " | " : "") + `Quitação ${formatCurrency(payVal)}: ${notes}`;
    }

    await saveState({
      type: "BOOK_FISHING",
      tableName: "fishing_bookings",
      recordId: b.id,
      payload: b
    });
    renderFishingAgendaView();
    updateGlobalStats();
    closeModal("modalFishingPayment");
    showToast(`Pagamento de ${formatCurrency(payVal)} registrado para ${b.clientName}! Saldo restante: ${formatCurrency(newRemaining)}`, "success");
  } finally {
    isConfirmingFishingPayment = false;
    if (payBtn) payBtn.disabled = false;
  }
}

/* Modal: Mensagem Formatada de Confirmação para WhatsApp */
function openFishingWhatsAppModal(bookingId) {
  const b = (appData.fishingBookings || []).find(item => item.id === bookingId);
  if (!b) return;

  let dateDisplay = "";
  if (b.dates && Array.isArray(b.dates) && b.dates.length > 1) {
    const formatted = b.dates.map(formatDate);
    const last = formatted.pop();
    dateDisplay = `${formatted.join(", ")} e ${last}`;
  } else if (b.endDate && b.endDate !== b.startDate) {
    dateDisplay = `${formatDate(b.startDate)} até ${formatDate(b.endDate)}`;
  } else {
    dateDisplay = formatDate(b.startDate);
  }

  let structureText = b.packageName || "Dupla (2 Pessoas)";
  if (b.structureType === "custom") {
    structureText = `Personalizado (${b.boatsCount || 1} barco(s)${b.kayaksCount > 0 ? ', ' + b.kayaksCount + ' caiaque(s)' : ''})`;
  }

  let msg = `*CONFIRMAÇÃO DE PESCARIA - ELDORADO LAKE*\n`;
  msg += `Lago Foz do Areia - Pinhão/PR\n\n`;
  msg += `Olá, *${b.clientName}*! Sua pescaria está confirmada na agenda:\n\n`;
  msg += `• Data(s): *${dateDisplay}* (${b.totalDays || 1} ${(b.totalDays || 1) === 1 ? 'Diária' : 'Diárias'})\n`;
  msg += `• Pacote: *${structureText}*\n`;
  msg += `• Pescadores: *${b.fishermenCount || 2} pessoas*\n`;
  msg += `• Guia: *${b.guideName || 'Thiago Witeck (Titular)'}*\n\n`;

  if (b.bookingType === "raffle_prize") {
    const extraDays = parseInt(b.extraDays) || 0;
    msg += `• Origem: *Prêmio da Ação Eldorado Pesca (${b.raffleRef || 'Prêmio Oficial'})*\n`;
    if (extraDays > 0) {
      msg += `• Diárias Cobertas pela Rifa: *${b.raffleDays || 1} diária(s)*\n`;
      msg += `• Diárias Extras Adicionais: *+${extraDays} diária(s)*\n`;
      msg += `• Valor dos Dias Extras: *${formatCurrency(b.totalAmount)}*\n`;
      msg += `• Sinal Já Pago dos Dias Extras: *${formatCurrency(b.depositAmount)}*\n`;
      if (b.remainingAmount > 0) {
        msg += `• Saldo Restante a Pagar no Rancho: *${formatCurrency(b.remainingAmount)}*\n\n`;
      } else {
        msg += `• Saldo Restante: *QUITADO (R$ 0,00)*\n\n`;
      }
    } else {
      msg += `• Status: *100% Coberto pelo Prêmio (R$ 0,00 a pagar)*\n\n`;
    }
  } else {
    msg += `• Resumo Financeiro:\n`;
    msg += `  - Valor Total do Pacote: *${formatCurrency(b.totalAmount)}*\n`;
    msg += `  - Sinal Já Confirmado: *${formatCurrency(b.depositAmount)}*\n`;
    if (b.remainingAmount > 0) {
      msg += `  - Saldo Restante a Pagar no Rancho: *${formatCurrency(b.remainingAmount)}*\n\n`;
    } else {
      msg += `  - Saldo Restante: *QUITADO (R$ 0,00)*\n\n`;
    }
  }

  msg += `Localização do Rancho & Embarque:\n`;
  msg += `Lago Foz do Areia, Pinhão - PR\n`;
  msg += `Google Maps: https://maps.app.goo.gl/ggCzNRzaTgsAnpXD6\n\n`;
  msg += `Praticamos 100% Pesque & Solte ao Dourado.\n`;
  msg += `Qualquer dúvida só chamar aqui no WhatsApp: (42) 9 9916-2340`;

  document.getElementById("textareaFishingWhatsApp").value = msg;
  openModal("modalFishingWhatsApp");
}

function doCopyFishingWhatsApp() {
  const text = document.getElementById("textareaFishingWhatsApp").value;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Mensagem copiada com sucesso para o WhatsApp!", "success");
  });
}

/* ==========================================================================
   TAB 4: LOCAÇÃO & HOSPEDAGEM DO RANCHO (ELDORADO LAKE)
   ========================================================================== */
function renderRanchoView() {
  updateRanchoStats();
  renderRanchoCalendar();
  renderUpcomingRanchoSidebar();
  renderRanchoBookingsList();
}

function updateRanchoStats() {
  const allBookings = appData.ranchoBookings || [];

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const monthName = monthNames[ranchoCalSelectedMonth];
  const monthYearLabel = `${monthName} de ${ranchoCalSelectedYear}`;

  const monthStr = String(ranchoCalSelectedMonth + 1).padStart(2, "0");
  const yearMonthPrefix = `${ranchoCalSelectedYear}-${monthStr}`;

  const monthBookings = allBookings.filter(b => {
    if (!b.checkInDate || b.status === "cancelled") return false;
    const startYm = b.checkInDate.slice(0, 7);
    const endYm = (b.checkOutDate || b.checkInDate).slice(0, 7);
    return startYm === yearMonthPrefix || endYm === yearMonthPrefix || (startYm <= yearMonthPrefix && yearMonthPrefix <= endYm);
  });

  let totalDays = 0;
  let totalRevenue = 0;
  let totalDeposit = 0;
  let totalRemaining = 0;
  let pendingCount = 0;

  monthBookings.forEach(b => {
    totalDays += parseInt(b.totalDays, 10) || 1;
    totalRevenue += parseFloat(b.totalAmount) || 0;
    totalDeposit += parseFloat(b.depositAmount) || 0;
    const rem = parseFloat(b.remainingAmount) || 0;
    totalRemaining += rem;
    if (rem > 0) pendingCount++;
  });

  const statDaysEl = document.getElementById("statRanchoTotalDays");
  if (statDaysEl) statDaysEl.textContent = `${totalDays} ${totalDays === 1 ? 'diária' : 'diárias'}`;

  const statMonthEl = document.getElementById("statRanchoMonthName");
  if (statMonthEl) statMonthEl.textContent = monthYearLabel;

  const statRevEl = document.getElementById("statRanchoTotalAmount");
  if (statRevEl) statRevEl.textContent = formatCurrency(totalRevenue);

  const statDepEl = document.getElementById("statRanchoDepositTotal");
  if (statDepEl) statDepEl.textContent = `${formatCurrency(totalDeposit)} em sinais recebidos`;

  const statRemEl = document.getElementById("statRanchoRemainingAmount");
  if (statRemEl) statRemEl.textContent = formatCurrency(totalRemaining);

  const statPendEl = document.getElementById("statRanchoPendingCount");
  if (statPendEl) statPendEl.textContent = `${pendingCount} ${pendingCount === 1 ? 'locação com saldo a quitar' : 'locações com saldo a quitar'}`;

  // Counter in nav badge
  const badgeRancho = document.getElementById("badgePendingRancho");
  if (badgeRancho) {
    const totalWithBalance = allBookings.filter(b => (b.remainingAmount || 0) > 0 && b.status !== 'cancelled').length;
    badgeRancho.textContent = totalWithBalance;
    badgeRancho.style.display = totalWithBalance > 0 ? "inline-block" : "none";
  }
}

function renderRanchoCalendar() {
  const calGrid = document.getElementById("ranchoCalendarGrid");
  if (!calGrid) return;

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const labelEl = document.getElementById("ranchoCalMonthLabel");
  if (labelEl) {
    labelEl.textContent = `${monthNames[ranchoCalSelectedMonth]} de ${ranchoCalSelectedYear}`;
  }

  calGrid.innerHTML = "";

  dayNames.forEach(d => {
    const dh = document.createElement("div");
    dh.className = "cal-day-header";
    dh.textContent = d;
    calGrid.appendChild(dh);
  });

  const firstDayIndex = new Date(ranchoCalSelectedYear, ranchoCalSelectedMonth, 1).getDay();
  const daysInMonth = new Date(ranchoCalSelectedYear, ranchoCalSelectedMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(ranchoCalSelectedYear, ranchoCalSelectedMonth, 0).getDate();

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const prevCell = document.createElement("div");
    prevCell.className = "cal-day-cell other-month";
    prevCell.innerHTML = `<span class="cal-day-num">${daysInPrevMonth - i}</span>`;
    calGrid.appendChild(prevCell);
  }

  const todayStr = getLocalDateStr();
  const bookings = (appData.ranchoBookings || []).filter(b => b.status !== "cancelled");

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${ranchoCalSelectedYear}-${String(ranchoCalSelectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    
    // Find booking active on this day
    const activeBooking = bookings.find(b => {
      const start = b.checkInDate;
      const end = b.checkOutDate || b.checkInDate;
      return start <= dayStr && dayStr <= end;
    });

    const cell = document.createElement("div");
    const isToday = dayStr === todayStr;

    let cellClass = "cal-day-cell";
    let tagHtml = "";

    if (activeBooking) {
      const isPaid = activeBooking.paymentStatus === "paid" || activeBooking.remainingAmount === 0;
      const isDeposit = activeBooking.paymentStatus === "deposit_paid" || (activeBooking.depositAmount > 0 && activeBooking.remainingAmount > 0);

      if (isPaid) {
        cellClass += " full";
        tagHtml = `<span class="cal-status-tag full" style="font-size: 0.65rem;" title="${escapeHtml(activeBooking.clientName)}">${escapeHtml(activeBooking.clientName.split(' ')[0])}</span>`;
      } else if (isDeposit) {
        cellClass += " half";
        tagHtml = `<span class="cal-status-tag half" style="font-size: 0.65rem;" title="${escapeHtml(activeBooking.clientName)}">${escapeHtml(activeBooking.clientName.split(' ')[0])} (Sinal)</span>`;
      } else {
        tagHtml = `<span class="cal-status-tag" style="background: #475569; color: #ffffff; font-size: 0.65rem;" title="${escapeHtml(activeBooking.clientName)}">${escapeHtml(activeBooking.clientName.split(' ')[0])}</span>`;
      }
    }

    if (isToday) cellClass += " today";

    cell.className = cellClass;
    cell.dataset.date = dayStr;
    cell.innerHTML = `
      <span class="cal-day-num">${day}</span>
      ${tagHtml}
    `;

    cell.addEventListener("click", () => {
      if (activeBooking) {
        openEditRanchoBookingModal(activeBooking.id);
      } else {
        openNewRanchoBookingModal(dayStr);
      }
    });

    calGrid.appendChild(cell);
  }
}

function changeRanchoCalendarMonth(delta) {
  ranchoCalSelectedMonth += delta;
  if (ranchoCalSelectedMonth < 0) {
    ranchoCalSelectedMonth = 11;
    ranchoCalSelectedYear--;
  } else if (ranchoCalSelectedMonth > 11) {
    ranchoCalSelectedMonth = 0;
    ranchoCalSelectedYear++;
  }
  renderRanchoView();
}

function goToRanchoToday() {
  const now = new Date();
  ranchoCalSelectedYear = now.getFullYear();
  ranchoCalSelectedMonth = now.getMonth();
  renderRanchoView();
}

function renderUpcomingRanchoSidebar() {
  const container = document.getElementById("sideUpcomingRanchoList");
  const countBadge = document.getElementById("sideUpcomingRanchoCount");
  if (!container) return;

  container.innerHTML = "";
  const todayStr = getLocalDateStr();

  const upcoming = (appData.ranchoBookings || [])
    .filter(b => b.status !== "cancelled" && (b.checkOutDate || b.checkInDate) >= todayStr)
    .sort((a, b) => (a.checkInDate || "").localeCompare(b.checkInDate || ""));

  if (countBadge) countBadge.textContent = `${upcoming.length} ${upcoming.length === 1 ? 'agendada' : 'agendadas'}`;

  if (upcoming.length === 0) {
    container.innerHTML = `
      <div style="font-size: 0.82rem; color: var(--text-dim); text-align: center; padding: 1.5rem 0.5rem;">
        Nenhuma locação agendada para os próximos dias.<br>
        <button class="btn btn-gold btn-sm" style="margin-top: 0.75rem;" onclick="openNewRanchoBookingModal()">+ Agendar Locação</button>
      </div>
    `;
    return;
  }

  upcoming.slice(0, 8).forEach(b => {
    const isPaid = b.paymentStatus === "paid" || (b.remainingAmount || 0) === 0;
    const isDeposit = b.paymentStatus === "deposit_paid" || (b.depositAmount > 0 && b.remainingAmount > 0);

    let statusTag = `<span class="badge-pill badge-delivered" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.5); font-size: 0.65rem;">Total Quitado</span>`;
    if (isDeposit) {
      statusTag = `<span class="badge-pill badge-schedule" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border-color: rgba(245, 158, 11, 0.5); font-size: 0.65rem;">Sinal Pago</span>`;
    } else if (!isPaid) {
      statusTag = `<span class="badge-pill badge-choice" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.4); font-size: 0.65rem;">Pendente</span>`;
    }

    let dateDisplay = formatDate(b.checkInDate);
    if (b.checkOutDate && b.checkOutDate !== b.checkInDate) {
      dateDisplay = `${formatDate(b.checkInDate)} até ${formatDate(b.checkOutDate)}`;
    }

    const item = document.createElement("div");
    item.className = "upcoming-rancho-item";
    item.innerHTML = `
      <div class="upcoming-rancho-header">
        <div>
          <div class="upcoming-rancho-name">${escapeHtml(b.clientName)}</div>
          <div class="upcoming-rancho-date">
            ${dateDisplay} <small style="color: var(--text-dim); font-weight: 600;">(${b.totalDays || 1} ${(b.totalDays || 1) === 1 ? 'diária' : 'diárias'})</small>
          </div>
        </div>
        <div>${statusTag}</div>
      </div>
      <div class="upcoming-rancho-details">
        <span>${b.guestsCount || 2} hóspedes • Rancho Eldorado</span>
        <strong style="color: ${b.remainingAmount > 0 ? 'var(--primary-gold)' : 'var(--status-paid-text)'}; font-weight: 800;">
          ${b.remainingAmount > 0 ? 'Falta: ' + formatCurrency(b.remainingAmount) : '100% Quitado'}
        </strong>
      </div>
    `;

    item.addEventListener("click", (e) => {
      if (e.target && e.target.closest && e.target.closest("button, a, input, select")) return;
      openEditRanchoBookingModal(b.id);
    });
    container.appendChild(item);
  });
}

function renderRanchoBookingsList() {
  const container = document.getElementById("ranchoBookingsContainer");
  if (!container) return;

  container.innerHTML = "";
  const search = (document.getElementById("inputSearchRancho")?.value || "").toLowerCase().trim();
  const todayStr = getLocalDateStr();

  let list = (appData.ranchoBookings || []).filter(b => {
    if (currentRanchoFilter === "upcoming") {
      if ((b.checkOutDate || b.checkInDate) < todayStr || b.status === "cancelled") return false;
    } else if (currentRanchoFilter === "with_balance") {
      if ((b.remainingAmount || 0) <= 0 || b.status === "cancelled") return false;
    } else if (currentRanchoFilter === "completed") {
      if ((b.checkOutDate || b.checkInDate) >= todayStr || b.status === "cancelled") return false;
    }

    if (search) {
      const matchName = (b.clientName || "").toLowerCase().includes(search);
      const matchPhone = (b.clientPhone || "").toLowerCase().includes(search);
      const matchNotes = (b.notes || "").toLowerCase().includes(search);
      return matchName || matchPhone || matchNotes;
    }

    return true;
  });

  list.sort((a, b) => (b.checkInDate || "").localeCompare(a.checkInDate || ""));

  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem 1rem; color: var(--text-dim); background: var(--bg-card-glass); border-radius: var(--radius-sm); border: 1px dashed var(--border-gold);">
        <div style="font-size: 1.1rem; font-weight: 700; color: #ffffff;">Nenhuma locação encontrada</div>
        <div style="font-size: 0.85rem; margin-top: 0.25rem;">Nenhuma reserva de locação do rancho corresponde aos filtros.</div>
        <button class="btn btn-gold btn-sm" style="margin-top: 1rem;" onclick="openNewRanchoBookingModal()">+ Agendar Nova Locação</button>
      </div>
    `;
    return;
  }

  list.forEach(b => {
    const card = document.createElement("div");
    card.className = "fishing-card";

    let statusBadge = `<span class="badge-fish-paid">Total Quitado</span>`;
    if (b.status === "cancelled") {
      statusBadge = `<span class="badge-pill badge-choice" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border-color: rgba(239, 68, 68, 0.4);">Cancelada</span>`;
    } else if (b.remainingAmount > 0 && b.depositAmount > 0) {
      statusBadge = `<span class="badge-fish-deposit">Sinal Pago (Falta Quitar)</span>`;
    } else if (b.remainingAmount > 0 && (!b.depositAmount || b.depositAmount === 0)) {
      statusBadge = `<span class="badge-fish-pending">Pendente</span>`;
    }

    let phoneDetailHtml = `<span style="color: var(--text-dim); font-style: italic; font-weight: normal;">Não informado</span>`;
    if (b.clientPhone) {
      const cleanPhone = b.clientPhone.replace(/\D/g, "");
      phoneDetailHtml = `
        <a href="https://wa.me/55${cleanPhone}" target="_blank" style="color: #22c55e; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 700;" title="Abrir conversa no WhatsApp">
          <span>●</span> ${escapeHtml(b.clientPhone)}
        </a>
      `;
    }

    let dateDisplay = formatDate(b.checkInDate);
    if (b.checkOutDate && b.checkOutDate !== b.checkInDate) {
      dateDisplay = `${formatDate(b.checkInDate)} até ${formatDate(b.checkOutDate)}`;
    }

    let actionsHtml = "";
    if (b.remainingAmount > 0) {
      actionsHtml += `
        <button class="btn btn-gold btn-sm" onclick="openRanchoPaymentModal('${b.id}')">
          Quitar Saldo Restante
        </button>
      `;
    }
    actionsHtml += `
      <button class="btn btn-secondary btn-sm" onclick="openEditRanchoBookingModal('${b.id}')" title="Editar">
        Editar
      </button>
      <button class="btn-delete-vale" onclick="deleteRanchoBooking('${b.id}')" title="Excluir Locação">
        Excluir
      </button>
    `;

    card.innerHTML = `
      <div>
        <div class="fishing-card-header">
          <div>
            <div class="fishing-client-title">${escapeHtml(b.clientName)}</div>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div class="fishing-dates-banner">
          <div>
            <div style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Período da Hospedagem:</div>
            <div class="fishing-dates-val">${dateDisplay}</div>
          </div>
          <div class="fishing-days-count-badge">${b.totalDays || 1} ${(b.totalDays || 1) === 1 ? 'Diária' : 'Diárias'}</div>
        </div>

        <div class="fishing-details-grid">
          <div class="fishing-detail-box">
            <div class="fishing-detail-label">WhatsApp / Contato</div>
            <div class="fishing-detail-value">${phoneDetailHtml}</div>
          </div>
          <div class="fishing-detail-box">
            <div class="fishing-detail-label">Capacidade / Hóspedes</div>
            <div class="fishing-detail-value">${b.guestsCount || 2} pessoas hospedadas</div>
          </div>
        </div>

        <div class="fishing-financial-box">
          <div class="fishing-fin-row">
            <span>Valor Total da Locação:</span>
            <strong style="color: var(--text-light);">${formatCurrency(b.totalAmount)}</strong>
          </div>
          <div class="fishing-fin-row">
            <span>Sinal / Reserva Já Pago:</span>
            <strong style="color: var(--status-paid-text);">${formatCurrency(b.depositAmount)}</strong>
          </div>
          <div class="fishing-fin-row remaining">
            <span style="color: var(--primary-gold);">Saldo Restante na Entrada:</span>
            <strong style="color: ${b.remainingAmount > 0 ? 'var(--primary-gold)' : 'var(--status-paid-text)'}; font-size: 1.05rem;">
              ${b.remainingAmount > 0 ? formatCurrency(b.remainingAmount) : 'QUITADO (R$ 0,00)'}
            </strong>
          </div>
        </div>

        ${b.notes ? `
          <div style="font-size: 0.78rem; color: var(--text-dim); background: var(--bg-input); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light); margin-bottom: 0.85rem; font-style: italic;">
            Obs: ${escapeHtml(b.notes)}
          </div>
        ` : ''}
      </div>

      <div class="vale-actions-bar">
        ${actionsHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function setRanchoFilter(filter) {
  currentRanchoFilter = filter;
  document.querySelectorAll("#filterRanchoAll, #filterRanchoUpcoming, #filterRanchoWithBalance, #filterRanchoCompleted").forEach(btn => btn.classList.remove("active"));
  
  if (filter === "all" && document.getElementById("filterRanchoAll")) document.getElementById("filterRanchoAll").classList.add("active");
  if (filter === "upcoming" && document.getElementById("filterRanchoUpcoming")) document.getElementById("filterRanchoUpcoming").classList.add("active");
  if (filter === "with_balance" && document.getElementById("filterRanchoWithBalance")) document.getElementById("filterRanchoWithBalance").classList.add("active");
  if (filter === "completed" && document.getElementById("filterRanchoCompleted")) document.getElementById("filterRanchoCompleted").classList.add("active");

  renderRanchoBookingsList();
}

function openNewRanchoBookingModal(preselectedDate = null) {
  document.getElementById("ranchoBookingId").value = "";
  document.getElementById("modalRanchoBookingTitle").textContent = "Nova Locação do Rancho (Eldorado Lake)";
  document.getElementById("btnDeleteRanchoBooking").style.display = "none";

  document.getElementById("ranchoClientName").value = "";
  document.getElementById("ranchoClientPhone").value = "";

  const targetDate = preselectedDate ? getLocalDateStr(preselectedDate) : getLocalDateStr();
  document.getElementById("ranchoCheckInDate").value = targetDate;
  document.getElementById("ranchoCheckOutDate").value = targetDate;
  document.getElementById("ranchoTotalDays").value = "1";
  document.getElementById("ranchoGuestsCount").value = "4";
  document.getElementById("ranchoTotalAmount").value = "800.00";
  document.getElementById("ranchoDepositAmount").value = "400.00";
  document.getElementById("ranchoNotes").value = "";

  recalculateRanchoAmounts();
  openModal("modalRanchoBooking");
}

function openEditRanchoBookingModal(id) {
  const b = (appData.ranchoBookings || []).find(item => item.id === id);
  if (!b) return;

  document.getElementById("ranchoBookingId").value = b.id;
  document.getElementById("modalRanchoBookingTitle").textContent = `Editar Locação: ${b.clientName}`;
  document.getElementById("btnDeleteRanchoBooking").style.display = "block";

  document.getElementById("ranchoClientName").value = b.clientName || "";
  document.getElementById("ranchoClientPhone").value = b.clientPhone || "";
  document.getElementById("ranchoCheckInDate").value = b.checkInDate || "";
  document.getElementById("ranchoCheckOutDate").value = b.checkOutDate || b.checkInDate || "";
  document.getElementById("ranchoTotalDays").value = String(b.totalDays || 1);
  document.getElementById("ranchoGuestsCount").value = String(b.guestsCount || 4);
  document.getElementById("ranchoTotalAmount").value = (parseFloat(b.totalAmount) || 0).toFixed(2);
  document.getElementById("ranchoDepositAmount").value = (parseFloat(b.depositAmount) || 0).toFixed(2);
  document.getElementById("ranchoNotes").value = b.notes || "";

  recalculateRanchoAmounts();
  openModal("modalRanchoBooking");
}

function calculateRanchoDates() {
  const inStr = document.getElementById("ranchoCheckInDate").value;
  const outStr = document.getElementById("ranchoCheckOutDate").value;
  if (!inStr) return;

  if (!outStr || outStr < inStr) {
    document.getElementById("ranchoCheckOutDate").value = inStr;
    document.getElementById("ranchoTotalDays").value = "1";
    recalculateRanchoAmounts();
    return;
  }

  const d1 = new Date(inStr + "T12:00:00");
  const d2 = new Date(outStr + "T12:00:00");
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  document.getElementById("ranchoTotalDays").value = String(Math.max(1, diffDays));
  recalculateRanchoAmounts();
}

function recalculateRanchoAmounts() {
  const total = parseFloat(document.getElementById("ranchoTotalAmount").value) || 0;
  const deposit = parseFloat(document.getElementById("ranchoDepositAmount").value) || 0;
  const remaining = Math.max(0, total - deposit);

  const displayEl = document.getElementById("ranchoRemainingDisplay");
  if (displayEl) {
    displayEl.textContent = formatCurrency(remaining);
    displayEl.style.color = remaining > 0 ? "var(--primary-gold)" : "var(--status-paid-text)";
  }
}

async function saveRanchoBooking() {
  const id = document.getElementById("ranchoBookingId").value.trim();
  const clientName = document.getElementById("ranchoClientName").value.trim().toUpperCase();
  const clientPhone = document.getElementById("ranchoClientPhone").value.trim();
  const checkInDate = document.getElementById("ranchoCheckInDate").value;
  let checkOutDate = document.getElementById("ranchoCheckOutDate").value;
  if (!checkOutDate) checkOutDate = checkInDate;

  if (!clientName) {
    showToast("Por favor, informe o nome do responsável pela locação.", "warning");
    return;
  }
  if (!checkInDate) {
    showToast("Por favor, informe a data de check-in.", "warning");
    return;
  }

  const totalDays = Math.max(1, parseInt(document.getElementById("ranchoTotalDays").value, 10) || 1);
  const guestsCount = Math.max(1, parseInt(document.getElementById("ranchoGuestsCount").value, 10) || 4);
  const totalAmount = parseFloat(document.getElementById("ranchoTotalAmount").value) || 0;
  const depositAmount = parseFloat(document.getElementById("ranchoDepositAmount").value) || 0;
  const remainingAmount = Math.max(0, totalAmount - depositAmount);
  const notes = document.getElementById("ranchoNotes").value.trim();

  let paymentStatus = "pending";
  if (remainingAmount === 0 && totalAmount > 0) {
    paymentStatus = "paid";
  } else if (depositAmount > 0) {
    paymentStatus = "deposit_paid";
  }

  const bookingData = {
    id: id || ("rb-" + Date.now()),
    clientName,
    clientPhone,
    checkInDate,
    checkOutDate,
    totalDays,
    guestsCount,
    totalAmount,
    depositAmount,
    remainingAmount,
    paymentStatus,
    paymentMethod: "Pix",
    notes,
    status: "scheduled",
    createdAt: getLocalDateStr()
  };

  if (!appData.ranchoBookings) appData.ranchoBookings = [];

  const existingIdx = appData.ranchoBookings.findIndex(item => item.id === bookingData.id);
  if (existingIdx >= 0) {
    appData.ranchoBookings[existingIdx] = { ...appData.ranchoBookings[existingIdx], ...bookingData };
  } else {
    appData.ranchoBookings.push(bookingData);
  }

  await saveState({
    type: "BOOK_RANCHO",
    tableName: "rancho_bookings",
    recordId: bookingData.id,
    payload: bookingData
  });
  renderRanchoView();
  closeModal("modalRanchoBooking");
  showToast(`Locação de ${clientName} salva com sucesso!`, "success");
}

function deleteActiveRanchoBooking() {
  const id = document.getElementById("ranchoBookingId").value;
  if (!id) return;
  deleteRanchoBooking(id);
  closeModal("modalRanchoBooking");
}

async function deleteRanchoBooking(id) {
  const b = (appData.ranchoBookings || []).find(item => item.id === id);
  const name = b ? b.clientName : "esta locação";

  if (!confirm(`Deseja realmente excluir a locação de "${name}"?`)) return;

  appData.ranchoBookings = (appData.ranchoBookings || []).filter(item => item.id !== id);

  if (window.localDB && typeof window.localDB.deleteRecord === 'function') {
    await window.localDB.deleteRecord('rancho_bookings', id);
  }

  await saveState({
    type: "DELETE_RANCHO_BOOKING",
    tableName: "rancho_bookings",
    recordId: id,
    payload: { id }
  });

  renderRanchoView();
  showToast(`Locação de ${name} excluída com sucesso!`, "info");
}

function openRanchoPaymentModal(bookingId) {
  const b = (appData.ranchoBookings || []).find(item => item.id === bookingId);
  if (!b) return;

  document.getElementById("payRanchoBookingId").value = b.id;
  document.getElementById("payRanchoClientName").textContent = b.clientName;

  let dateDisplay = formatDate(b.checkInDate);
  if (b.checkOutDate && b.checkOutDate !== b.checkInDate) {
    dateDisplay = `${formatDate(b.checkInDate)} até ${formatDate(b.checkOutDate)}`;
  }
  document.getElementById("payRanchoDates").textContent = `${dateDisplay} (${b.totalDays || 1} ${(b.totalDays || 1) === 1 ? 'Diária' : 'Diárias'})`;
  document.getElementById("payRanchoTotal").textContent = formatCurrency(b.totalAmount);
  document.getElementById("payRanchoDeposit").textContent = formatCurrency(b.depositAmount);
  document.getElementById("payRanchoRemaining").textContent = formatCurrency(b.remainingAmount);

  document.getElementById("payRanchoAmount").value = (parseFloat(b.remainingAmount) || 0).toFixed(2);
  document.getElementById("payRanchoNotes").value = "Quitado via Pix na entrada no rancho";

  openModal("modalRanchoPayment");
}

async function submitRanchoPayment() {
  const id = document.getElementById("payRanchoBookingId").value;
  const payVal = parseFloat(document.getElementById("payRanchoAmount").value);
  const notes = document.getElementById("payRanchoNotes").value.trim();

  if (isNaN(payVal) || payVal <= 0) {
    showToast("Informe um valor válido pago.", "warning");
    return;
  }

  const b = (appData.ranchoBookings || []).find(item => item.id === id);
  if (!b) return;

  const newDeposit = (b.depositAmount || 0) + payVal;
  const newRemaining = Math.max(0, (b.totalAmount || 0) - newDeposit);
  b.depositAmount = newDeposit;
  b.remainingAmount = newRemaining;
  b.paymentStatus = newRemaining === 0 ? "paid" : "deposit_paid";
  if (notes) {
    b.notes = (b.notes ? b.notes + " | " : "") + `Quitação ${formatCurrency(payVal)}: ${notes}`;
  }

  await saveState({
    type: "BOOK_RANCHO",
    tableName: "rancho_bookings",
    recordId: b.id,
    payload: b
  });
  renderRanchoView();
  closeModal("modalRanchoPayment");
  showToast(`Pagamento do rancho registrado com sucesso! Saldo restante: ${formatCurrency(newRemaining)}`, "success");
}

function triggerQuickBackupDownload() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup_eldorado_pesca_${timestamp}.json`;
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Backup salvo e baixado com sucesso!", "success");
}

/* ==========================================================================
   TAB: CALENDÁRIO DE CONTEÚDO PARA INSTAGRAM (MODO PONYTAIL)
   // ponytail: Reutilização do motor de calendário existente + sync por outbox settings.
   ========================================================================== */
function renderInstagramView() {
  updateInstagramStats();
  renderInstagramCalendar();
  renderInstagramPostsList();
}
window.renderInstagramView = renderInstagramView;

function updateInstagramStats() {
  const posts = appData.instagramPosts || [];
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const monthName = monthNames[instagramCalSelectedMonth];
  const monthYearLabel = `${monthName} de ${instagramCalSelectedYear}`;

  const monthStr = String(instagramCalSelectedMonth + 1).padStart(2, "0");
  const yearMonthPrefix = `${instagramCalSelectedYear}-${monthStr}`;

  const monthPosts = posts.filter(p => p.date && p.date.startsWith(yearMonthPrefix));

  const totalMonth = monthPosts.length;
  const steelfishMonthPosts = monthPosts.filter(p => p.theme === "steelfish");
  const otherSponsorMonthPosts = monthPosts.filter(p => ['tr_fishing', 'iscas_mathias', 'titan_caiaques', 'fishing_company'].includes(p.theme));
  const publishedCount = monthPosts.filter(p => p.status === "published").length;

  // Cálculo da semana atual para a meta da Steelfish (2 posts por semana)
  const now = new Date();
  const currentDay = now.getDay();
  const distanceToMonday = (currentDay + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - distanceToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayStr = getLocalDateStr(monday);
  const sundayStr = getLocalDateStr(sunday);

  const steelfishWeekCount = posts.filter(p => {
    return p.theme === 'steelfish' && p.date >= mondayStr && p.date <= sundayStr;
  }).length;

  const statMonthNameEl = document.getElementById("statInstaMonthName");
  if (statMonthNameEl) statMonthNameEl.textContent = monthYearLabel;

  const statTotalEl = document.getElementById("statInstaTotalMonth");
  if (statTotalEl) statTotalEl.textContent = `${totalMonth} post${totalMonth === 1 ? '' : 's'}`;

  const statSteelfishEl = document.getElementById("statInstaSteelfishCount");
  if (statSteelfishEl) {
    statSteelfishEl.textContent = `${steelfishWeekCount} de 2 na semana`;
  }

  const statSteelfishStatusEl = document.getElementById("statInstaSteelfishStatus");
  if (statSteelfishStatusEl) {
    if (steelfishWeekCount >= 2) {
      statSteelfishStatusEl.textContent = `Meta da semana cumprida (Seg & Sex no calendário)`;
      statSteelfishStatusEl.style.color = "#34d399";
    } else {
      const remaining = 2 - steelfishWeekCount;
      statSteelfishStatusEl.textContent = `Segundas e Sextas fixas (falta preencher ${remaining} de 2)`;
      statSteelfishStatusEl.style.color = "var(--primary-gold)";
    }
  }

  const statOtherSponsorsEl = document.getElementById("statInstaOtherSponsorsCount");
  if (statOtherSponsorsEl) {
    statOtherSponsorsEl.textContent = `${otherSponsorMonthPosts.length} post${otherSponsorMonthPosts.length === 1 ? '' : 's'}`;
  }

  const statPubEl = document.getElementById("statInstaPublishedCount");
  if (statPubEl) statPubEl.textContent = `${publishedCount} postado${publishedCount === 1 ? '' : 's'}`;

  // Atualiza aviso de patrocinador no topo
  const badgeSteelfishWeekEl = document.getElementById("badgeSteelfishWeekStatus");
  if (badgeSteelfishWeekEl) {
    badgeSteelfishWeekEl.textContent = `Steelfish: Seg & Sex (${steelfishWeekCount}/2)`;
    if (steelfishWeekCount >= 2) {
      badgeSteelfishWeekEl.style.background = "rgba(52, 211, 153, 0.15)";
      badgeSteelfishWeekEl.style.color = "#34d399";
      badgeSteelfishWeekEl.style.borderColor = "rgba(52, 211, 153, 0.4)";
    } else {
      badgeSteelfishWeekEl.style.background = "rgba(229, 193, 88, 0.15)";
      badgeSteelfishWeekEl.style.color = "var(--primary-gold)";
      badgeSteelfishWeekEl.style.borderColor = "var(--border-gold)";
    }
  }

  const noticeEl = document.getElementById("instaWeeklyGoalNotice");
  if (noticeEl) {
    const mondayFmt = `${mondayStr.slice(8, 10)}/${mondayStr.slice(5, 7)}`;
    const sundayFmt = `${sundayStr.slice(8, 10)}/${sundayStr.slice(5, 7)}`;
    if (steelfishWeekCount >= 2) {
      noticeEl.textContent = `Semana atual (${mondayFmt} a ${sundayFmt}): Meta da Steelfish cumprida com ${steelfishWeekCount} postagens (Seg e Sex). Parceiros Oficiais: Tr Fishing, Iscas Mathias, Titan Caiaques e Fishing Company.`;
    } else {
      noticeEl.textContent = `Semana atual (${mondayFmt} a ${sundayFmt}): Steelfish é fixa toda Segunda e Sexta (${steelfishWeekCount} de 2 agendados). Parceiros Oficiais: Tr Fishing, Iscas Mathias, Titan Caiaques e Fishing Company.`;
    }
  }
}
window.updateInstagramStats = updateInstagramStats;

function renderInstagramCalendar() {
  const calGrid = document.getElementById("instagramCalendarGrid");
  if (!calGrid) return;

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const labelEl = document.getElementById("instaCalMonthLabel");
  if (labelEl) {
    labelEl.textContent = `${monthNames[instagramCalSelectedMonth]} de ${instagramCalSelectedYear}`;
  }

  calGrid.innerHTML = "";

  dayNames.forEach(d => {
    const dh = document.createElement("div");
    dh.className = "cal-day-header";
    dh.textContent = d;
    calGrid.appendChild(dh);
  });

  const firstDayIndex = new Date(instagramCalSelectedYear, instagramCalSelectedMonth, 1).getDay();
  const daysInMonth = new Date(instagramCalSelectedYear, instagramCalSelectedMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(instagramCalSelectedYear, instagramCalSelectedMonth, 0).getDate();

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const prevCell = document.createElement("div");
    prevCell.className = "cal-day-cell other-month";
    prevCell.innerHTML = `<span class="cal-day-num">${daysInPrevMonth - i}</span>`;
    calGrid.appendChild(prevCell);
  }

  const todayStr = getLocalDateStr();
  const posts = appData.instagramPosts || [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${instagramCalSelectedYear}-${String(instagramCalSelectedMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayPosts = posts.filter(p => p.date === dayStr);

    const dayDate = new Date(instagramCalSelectedYear, instagramCalSelectedMonth, day);
    const dayOfWeek = dayDate.getDay(); // 0: Dom, 1: Seg, 2: Ter, 3: Qua, 4: Qui, 5: Sex, 6: Sab
    const isSteelfishRecurringDay = (dayOfWeek === 1 || dayOfWeek === 5); // Segunda ou Sexta fixa

    const cell = document.createElement("div");
    const isToday = dayStr === todayStr;
    cell.className = `cal-day-cell current-month ${isToday ? "today" : ""}`;
    cell.style.cursor = "pointer";
    cell.style.minHeight = "76px";
    cell.title = `Clique para planejar post em ${dayStr}`;
    cell.onclick = (e) => {
      if (e.target.closest('.insta-day-chip')) return;
      openNewInstagramPostModal(dayStr);
    };

    let innerHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
        <span class="cal-day-num ${isToday ? 'today-badge' : ''}">${day}</span>
        <span style="font-size:0.65rem; opacity:0.4;">+</span>
      </div>
    `;

    // 1. Renderiza postagens cadastradas no dia
    dayPosts.forEach(p => {
      const isPub = p.status === 'published';
      let chipClass = `insta-day-chip chip-${p.format || 'feed'}`;
      let prefix = p.format === 'reels' ? '[Reels]' : (p.format === 'stories' ? '[Stories]' : '[Feed]');

      if (p.theme === 'steelfish') {
        chipClass = 'insta-day-chip chip-steelfish';
        prefix = '[Steelfish]';
      } else if (p.theme === 'titan_caiaques') {
        chipClass = 'insta-day-chip chip-sponsor';
        prefix = '[Titan]';
      } else if (p.theme === 'tr_fishing') {
        chipClass = 'insta-day-chip chip-sponsor';
        prefix = '[Tr Fishing]';
      } else if (p.theme === 'iscas_mathias') {
        chipClass = 'insta-day-chip chip-sponsor';
        prefix = '[Iscas Mathias]';
      } else if (p.theme === 'fishing_company') {
        chipClass = 'insta-day-chip chip-sponsor';
        prefix = '[Fishing Co.]';
      }

      let displayTitle = (p.title || 'Sem título').trim();
      const lowerTitle = displayTitle.toLowerCase();
      if (lowerTitle.startsWith('steelfish:')) {
        displayTitle = displayTitle.substring(10).trim();
      } else if (lowerTitle.startsWith('titan caiaques:')) {
        displayTitle = displayTitle.substring(15).trim();
      } else if (lowerTitle.startsWith('tr fishing:')) {
        displayTitle = displayTitle.substring(11).trim();
      } else if (lowerTitle.startsWith('iscas mathias:')) {
        displayTitle = displayTitle.substring(14).trim();
      } else if (lowerTitle.startsWith('fishing company:')) {
        displayTitle = displayTitle.substring(16).trim();
      }

      innerHtml += `
        <div class="${chipClass} ${isPub ? 'chip-published' : ''}" 
             title="${prefix} ${escapeHtml(p.title || '')} (${p.time || ''})"
             onclick="openEditInstagramPostModal('${p.id}')">
          <strong style="font-size:0.64rem;">${prefix}</strong> ${escapeHtml(displayTitle)}
        </div>
      `;
    });

    // 2. Se for Segunda ou Sexta e ainda não tiver post cadastrado da Steelfish, exibe o slot fixo contratual
    const hasSteelfishPost = dayPosts.some(p => p.theme === 'steelfish');
    if (isSteelfishRecurringDay && !hasSteelfishPost) {
      const weekdayLabel = dayOfWeek === 1 ? 'Segunda' : 'Sexta';
      innerHtml += `
        <div class="insta-day-chip chip-steelfish chip-recurring" 
             title="Meta Contratual: Steelfish toda ${weekdayLabel} (2 por semana). Clique para preencher o roteiro."
             onclick="openNewInstagramPostModal('${dayStr}', 'steelfish', 'Steelfish: Post Semanal (${weekdayLabel})')">
          <strong style="font-size:0.64rem;">[Steelfish]</strong> Fixo (${weekdayLabel})
        </div>
      `;
    }

    cell.innerHTML = innerHtml;
    calGrid.appendChild(cell);
  }

  const totalRendered = firstDayIndex + daysInMonth;
  const remainingCells = (totalRendered <= 35 ? 35 : 42) - totalRendered;
  for (let d = 1; d <= remainingCells; d++) {
    const nextCell = document.createElement("div");
    nextCell.className = "cal-day-cell other-month";
    nextCell.innerHTML = `<span class="cal-day-num">${d}</span>`;
    calGrid.appendChild(nextCell);
  }
}
window.renderInstagramCalendar = renderInstagramCalendar;

function changeInstagramCalendarMonth(delta) {
  instagramCalSelectedMonth += delta;
  if (instagramCalSelectedMonth < 0) {
    instagramCalSelectedMonth = 11;
    instagramCalSelectedYear--;
  } else if (instagramCalSelectedMonth > 11) {
    instagramCalSelectedMonth = 0;
    instagramCalSelectedYear++;
  }
  updateInstagramStats();
  renderInstagramCalendar();
}
window.changeInstagramCalendarMonth = changeInstagramCalendarMonth;

function goToInstagramToday() {
  const now = new Date();
  instagramCalSelectedYear = now.getFullYear();
  instagramCalSelectedMonth = now.getMonth();
  updateInstagramStats();
  renderInstagramCalendar();
}
window.goToInstagramToday = goToInstagramToday;

function renderUpcomingInstagramSidebar() {
  // Card Próximos Posts removido a pedido do usuário (layout em largura total)
}
window.renderUpcomingInstagramSidebar = renderUpcomingInstagramSidebar;

function setInstagramFilter(filter) {
  currentInstagramFilter = filter;
  const filterBtnMap = {
    all: 'filterInstaAll',
    steelfish: 'filterInstaSteelfish',
    fishing_company: 'filterInstaFishingCo',
    tr_fishing: 'filterInstaTrFishing',
    iscas_mathias: 'filterInstaMathias',
    titan_caiaques: 'filterInstaTitan',
    sponsors: 'filterInstaSponsors',
    ready: 'filterInstaReady',
    draft: 'filterInstaDraft',
    published: 'filterInstaPublished'
  };

  Object.values(filterBtnMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  const activeBtnId = filterBtnMap[filter] || 'filterInstaAll';
  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) activeBtn.classList.add('active');

  renderInstagramPostsList();
}
window.setInstagramFilter = setInstagramFilter;

function setInstagramViewMode(mode) {
  currentInstagramViewMode = mode || 'cards';
  const btnCards = document.getElementById('btnViewInstagramCards');
  const btnTable = document.getElementById('btnViewInstagramTable');
  const cardsContainer = document.getElementById('instagramPostsContainer');
  const tableContainer = document.getElementById('instagramTableView');

  if (btnCards) btnCards.classList.toggle('active', currentInstagramViewMode === 'cards');
  if (btnTable) btnTable.classList.toggle('active', currentInstagramViewMode === 'table');

  if (cardsContainer) cardsContainer.style.display = currentInstagramViewMode === 'cards' ? 'grid' : 'none';
  if (tableContainer) tableContainer.style.display = currentInstagramViewMode === 'table' ? 'block' : 'none';

  renderInstagramPostsList();
}
window.setInstagramViewMode = setInstagramViewMode;

function setInstagramMonthFilter(month) {
  currentInstagramMonthFilter = month || 'all';
  const map = {
    'all': 'filterMonthAll',
    '2026-09': 'filterMonthSep',
    '2026-10': 'filterMonthOct',
    '2026-11': 'filterMonthNov',
    '2026-12': 'filterMonthDec'
  };
  Object.values(map).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const activeEl = document.getElementById(map[month] || 'filterMonthAll');
  if (activeEl) activeEl.classList.add('active');

  renderInstagramPostsList();
}
window.setInstagramMonthFilter = setInstagramMonthFilter;

function setInstagramStatusFilter(status) {
  currentInstagramStatusFilter = status || 'all';
  const map = {
    'all': 'filterStatusAll',
    'draft': 'filterInstaDraft',
    'producing': 'filterInstaProducing',
    'ready': 'filterInstaReady',
    'published': 'filterInstaPublished'
  };
  Object.values(map).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const activeEl = document.getElementById(map[status] || 'filterStatusAll');
  if (activeEl) activeEl.classList.add('active');

  renderInstagramPostsList();
}
window.setInstagramStatusFilter = setInstagramStatusFilter;

function renderInstagramPostsList() {
  const cardsContainer = document.getElementById("instagramPostsContainer");
  const tableContainer = document.getElementById("instagramTableView");
  if (!cardsContainer && !tableContainer) return;

  const searchInput = document.getElementById("inputSearchInstagram");
  const query = (searchInput ? searchInput.value : "").toLowerCase().trim();

  let posts = (appData.instagramPosts || []).slice();

  // Filtro de Marca / Patrocinador
  if (currentInstagramFilter === 'steelfish') {
    posts = posts.filter(p => p.theme === 'steelfish');
  } else if (currentInstagramFilter === 'fishing_company') {
    posts = posts.filter(p => p.theme === 'fishing_company');
  } else if (currentInstagramFilter === 'tr_fishing') {
    posts = posts.filter(p => p.theme === 'tr_fishing');
  } else if (currentInstagramFilter === 'iscas_mathias') {
    posts = posts.filter(p => p.theme === 'iscas_mathias');
  } else if (currentInstagramFilter === 'titan_caiaques') {
    posts = posts.filter(p => p.theme === 'titan_caiaques');
  } else if (currentInstagramFilter === 'sponsors') {
    posts = posts.filter(p => ['steelfish', 'tr_fishing', 'iscas_mathias', 'titan_caiaques', 'fishing_company'].includes(p.theme));
  } else if (currentInstagramFilter === 'ready') {
    posts = posts.filter(p => p.status === 'ready');
  } else if (currentInstagramFilter === 'draft') {
    posts = posts.filter(p => p.status === 'draft' || p.status === 'producing');
  } else if (currentInstagramFilter === 'published') {
    posts = posts.filter(p => p.status === 'published');
  }

  // Filtro de Mês
  if (currentInstagramMonthFilter !== 'all') {
    posts = posts.filter(p => p.date && p.date.startsWith(currentInstagramMonthFilter));
  }

  // Filtro de Status
  if (currentInstagramStatusFilter === 'draft') {
    posts = posts.filter(p => p.status === 'draft');
  } else if (currentInstagramStatusFilter === 'producing') {
    posts = posts.filter(p => p.status === 'producing');
  } else if (currentInstagramStatusFilter === 'ready') {
    posts = posts.filter(p => p.status === 'ready');
  } else if (currentInstagramStatusFilter === 'published') {
    posts = posts.filter(p => p.status === 'published');
  }

  // Busca textual
  if (query) {
    posts = posts.filter(p => 
      (p.title || "").toLowerCase().includes(query) ||
      (p.caption || "").toLowerCase().includes(query) ||
      (p.theme || "").toLowerCase().includes(query) ||
      (p.pillar || "").toLowerCase().includes(query)
    );
  }

  posts.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.time || "").localeCompare(a.time || ""));

  if (currentInstagramViewMode === 'table') {
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (tableContainer) {
      tableContainer.style.display = 'block';
      renderInstagramTable(posts);
    }
    return;
  }

  if (tableContainer) tableContainer.style.display = 'none';
  if (cardsContainer) cardsContainer.style.display = 'grid';

  if (posts.length === 0) {
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; color: var(--text-dim); background: var(--bg-card); border-radius: var(--radius-sm); border: 1px dashed var(--border-light);">
          Nenhum conteúdo encontrado para os filtros selecionados.<br>
          <button class="btn btn-gold" style="margin-top: 1rem;" onclick="openNewInstagramPostModal()">+ Criar Novo Post</button>
        </div>
      `;
    }
    return;
  }

  if (cardsContainer) cardsContainer.innerHTML = "";
  posts.forEach(p => {
    const card = document.createElement("div");
    card.className = "insta-post-card";

    const formatBadgeClass = p.format === 'reels' ? 'badge-insta-reels' : (p.format === 'stories' ? 'badge-insta-stories' : 'badge-insta-feed');
    const formatLabel = p.format === 'reels' ? 'Reels' : (p.format === 'stories' ? 'Stories' : 'Feed');

    const statusBadgeClass = p.status === 'published' ? 'badge-insta-status-published' : (p.status === 'ready' ? 'badge-insta-status-ready' : (p.status === 'producing' ? 'badge-insta-status-producing' : 'badge-insta-status-draft'));
    const statusLabel = p.status === 'published' ? 'Publicado' : (p.status === 'ready' ? 'Pronto' : (p.status === 'producing' ? 'Gravando' : 'Rascunho'));

    const themeLabels = {
      steelfish: 'Patrocinador: Steelfish (2/sem)',
      tr_fishing: 'Patrocinador: Tr Fishing',
      iscas_mathias: 'Patrocinador: Iscas Mathias',
      titan_caiaques: 'Patrocinador: Titan Caiaques',
      fishing_company: 'Patrocinador: Fishing Company',
      pesca: 'Pesca & Troféus',
      rifas: 'Rifas & Vales',
      rancho: 'Rancho Lake',
      dicas: 'Dicas Técnicas',
      bastidores: 'Bastidores'
    };
    const themeLabel = themeLabels[p.theme] || p.theme || 'Geral';

    let themeBadgeClass = 'badge';
    let themeBadgeStyle = 'font-size: 0.72rem; color: var(--text-dim); background: rgba(255,255,255,0.05); padding: 0.2rem 0.45rem; border-radius: 4px;';
    if (p.theme === 'steelfish') {
      themeBadgeClass = 'badge-insta-sponsor-steelfish';
      themeBadgeStyle = '';
    } else if (['tr_fishing', 'iscas_mathias', 'titan_caiaques', 'fishing_company'].includes(p.theme)) {
      themeBadgeClass = 'badge-insta-sponsor';
      themeBadgeStyle = '';
    }

    const parts = (p.date || '').split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : p.date;

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem; flex-wrap: wrap; gap: 0.4rem;">
          <div style="display: flex; gap: 0.4rem; align-items: center;">
            <span class="${formatBadgeClass}">${formatLabel}</span>
            <span class="${themeBadgeClass}" style="${themeBadgeStyle}">${themeLabel}</span>
          </div>
          <div style="display: flex; gap: 0.4rem; align-items: center;">
            <span class="${statusBadgeClass}">${statusLabel}</span>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 0.6rem; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.45rem;">
          <span>Data: ${formattedDate}</span>
          ${p.time ? `<span>Horário: ${p.time}</span>` : ''}
        </div>

        <h4 style="font-size: 0.98rem; font-weight: 700; color: var(--text-light); margin-bottom: 0.65rem; line-height: 1.35;">
          ${escapeHtml(p.title || 'Sem título')}
        </h4>

        ${p.caption ? `
          <div class="insta-copy-preview">${escapeHtml(p.caption)}</div>
        ` : `
          <div style="font-size: 0.75rem; color: var(--text-dim); font-style: italic;">Nenhuma legenda ou roteiro cadastrado.</div>
        `}
      </div>

        <button type="button" class="btn btn-secondary btn-sm" onclick="copyInstagramPauta('${p.id}')" title="Copiar pauta completa com roteiro">
          Copiar Pauta
        </button>
        <button type="button" class="btn ${p.status === 'published' ? 'btn-secondary' : 'btn-whatsapp'} btn-sm" onclick="toggleInstagramPostStatus('${p.id}')">
          ${p.status === 'published' ? 'Reabrir' : 'Publicado'}
        </button>
        <button type="button" class="btn btn-gold btn-sm" onclick="openEditInstagramPostModal('${p.id}')">
          Editar
        </button>
      </div>
    `;
    if (cardsContainer) cardsContainer.appendChild(card);
  });
}
window.renderInstagramPostsList = renderInstagramPostsList;

function openNewInstagramPostModal(defaultDate = null, defaultTheme = "steelfish", defaultTitle = "") {
  activeInstagramPostId = null;
  document.getElementById("modalInstagramTitle").textContent = "Planejar Post no Instagram";
  document.getElementById("instaPostId").value = "";
  document.getElementById("instaPostDate").value = defaultDate || getLocalDateStr();
  document.getElementById("instaPostTime").value = "18:30";
  document.getElementById("instaPostFormat").value = "reels";
  document.getElementById("instaPostTheme").value = defaultTheme || "steelfish";
  document.getElementById("instaPostTitle").value = defaultTitle || "";
  document.getElementById("instaPostCaption").value = "";
  document.getElementById("instaPostStatus").value = "draft";
  const btnDelete = document.getElementById("btnDeleteInstagramPost");
  if (btnDelete) btnDelete.style.display = "none";
  openModal("modalInstagramPost");
}
window.openNewInstagramPostModal = openNewInstagramPostModal;

function openEditInstagramPostModal(postId) {
  const post = (appData.instagramPosts || []).find(p => String(p.id) === String(postId));
  if (!post) return;

  activeInstagramPostId = post.id;
  document.getElementById("modalInstagramTitle").textContent = "Editar Conteúdo do Instagram";
  document.getElementById("instaPostId").value = post.id;
  document.getElementById("instaPostDate").value = post.date || getLocalDateStr();
  document.getElementById("instaPostTime").value = post.time || "18:30";
  document.getElementById("instaPostFormat").value = post.format || "feed";
  document.getElementById("instaPostTheme").value = post.theme || "steelfish";
  document.getElementById("instaPostTitle").value = post.title || "";
  document.getElementById("instaPostCaption").value = post.caption || "";
  document.getElementById("instaPostStatus").value = post.status || "draft";

  const btnDelete = document.getElementById("btnDeleteInstagramPost");
  if (btnDelete) btnDelete.style.display = "inline-flex";

  openModal("modalInstagramPost");
}
window.openEditInstagramPostModal = openEditInstagramPostModal;

async function handleSaveInstagramPostSubmit(e) {
  e.preventDefault();
  const idInput = document.getElementById("instaPostId").value;
  const isEditing = !!idInput;
  const postId = isEditing ? idInput : ('insta-' + Date.now());

  const postData = {
    id: postId,
    date: document.getElementById("instaPostDate").value,
    time: document.getElementById("instaPostTime").value || "18:30",
    format: document.getElementById("instaPostFormat").value,
    theme: document.getElementById("instaPostTheme").value,
    title: document.getElementById("instaPostTitle").value.trim(),
    caption: document.getElementById("instaPostCaption").value.trim(),
    status: document.getElementById("instaPostStatus").value
  };

  if (!Array.isArray(appData.instagramPosts)) {
    appData.instagramPosts = [];
  }

  if (isEditing) {
    const idx = appData.instagramPosts.findIndex(p => String(p.id) === String(postId));
    if (idx >= 0) {
      appData.instagramPosts[idx] = postData;
    } else {
      appData.instagramPosts.push(postData);
    }
  } else {
    appData.instagramPosts.unshift(postData);
  }

  if (!appData.settings) appData.settings = {};
  appData.settings.instagramPosts = appData.instagramPosts;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: {
      key: 'instagramPosts',
      value: appData.instagramPosts
    }
  });

  closeModal("modalInstagramPost");
  showToast(isEditing ? "Post atualizado com sucesso!" : "Post planejado com sucesso!", "success");
  renderInstagramView();
}
window.handleSaveInstagramPostSubmit = handleSaveInstagramPostSubmit;

async function deleteInstagramPost(postId) {
  if (!confirm("Deseja realmente excluir este conteúdo do calendário?")) return;

  appData.instagramPosts = (appData.instagramPosts || []).filter(p => String(p.id) !== String(postId));
  if (!appData.settings) appData.settings = {};
  appData.settings.instagramPosts = appData.instagramPosts;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: {
      key: 'instagramPosts',
      value: appData.instagramPosts
    }
  });

  closeModal("modalInstagramPost");
  showToast("Post excluído com sucesso.", "info");
  renderInstagramView();
}
window.deleteInstagramPost = deleteInstagramPost;

function deleteActiveInstagramPost() {
  if (activeInstagramPostId) {
    deleteInstagramPost(activeInstagramPostId);
  }
}
window.deleteActiveInstagramPost = deleteActiveInstagramPost;

async function toggleInstagramPostStatus(postId) {
  const post = (appData.instagramPosts || []).find(p => String(p.id) === String(postId));
  if (!post) return;

  post.status = post.status === 'published' ? 'ready' : 'published';
  if (!appData.settings) appData.settings = {};
  appData.settings.instagramPosts = appData.instagramPosts;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: {
      key: 'instagramPosts',
      value: appData.instagramPosts
    }
  });

  showToast(post.status === 'published' ? 'Post marcado como Publicado!' : 'Post reaberto para edição.', 'success');
  renderInstagramView();
}
window.toggleInstagramPostStatus = toggleInstagramPostStatus;

function copyInstagramCaption(postId) {
  const post = (appData.instagramPosts || []).find(p => String(p.id) === String(postId));
  if (!post || !post.caption) {
    showToast("Este post não possui legenda cadastrada.", "warning");
    return;
  }
  navigator.clipboard.writeText(post.caption).then(() => {
    showToast("Legenda copiada para a Área de Transferência!", "success");
  }).catch(() => {
    showToast("Falha ao copiar legenda.", "error");
  });
}
window.copyInstagramCaption = copyInstagramCaption;

function copyModalCaptionToClipboard() {
  const text = document.getElementById("instaPostCaption").value;
  if (!text) {
    showToast("Nenhuma legenda digitada para copiar.", "warning");
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    showToast("Texto copiado com sucesso!", "success");
  });
}
window.copyModalCaptionToClipboard = copyModalCaptionToClipboard;

function copyInstagramPauta(postId) {
  const post = (appData.instagramPosts || []).find(p => String(p.id) === String(postId));
  if (!post) return;
  const brandLabels = {
    steelfish: 'Steelfish',
    fishing_company: 'Fishing Company',
    tr_fishing: 'TR Fishing',
    iscas_mathias: 'Iscas Mathias',
    titan_caiaques: 'Titan Caiaques'
  };
  const brandName = brandLabels[post.theme] || post.theme || 'Eldorado Pesca';
  const parts = (post.date || '').split('-');
  const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : post.date;

  const text = `[CRONOGRAMA EDITORIAL • ${brandName.toUpperCase()}]\nData: ${formattedDate} (${post.dayOfWeek || ''})\nFormato: ${(post.format || 'feed').toUpperCase()}\nPilar: ${post.pillar || 'Geral'}${post.seasonalHook ? `\nSazonalidade: ${post.seasonalHook}` : ''}\n\nTÍTULO / HOOK:\n${post.title || ''}\n\nLEGENDA / PAUTA:\n${post.caption || ''}`;

  navigator.clipboard.writeText(text).then(() => {
    showToast("Pauta copiada para a Área de Transferência!", "success");
  }).catch(() => {
    showToast("Falha ao copiar pauta.", "error");
  });
}
window.copyInstagramPauta = copyInstagramPauta;

function renderInstagramTable(posts) {
  const container = document.getElementById("instagramTableView");
  if (!container) return;

  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--text-dim); background: var(--bg-card); border-radius: var(--radius-sm); border: 1px dashed var(--border-light);">
        Nenhum conteúdo encontrado para os filtros selecionados.<br>
        <button class="btn btn-gold btn-sm" style="margin-top: 1rem;" onclick="openNewInstagramPostModal()">+ Criar Novo Post</button>
      </div>
    `;
    return;
  }

  const brandLabels = {
    steelfish: 'Steelfish',
    fishing_company: 'Fishing Company',
    tr_fishing: 'TR Fishing',
    iscas_mathias: 'Iscas Mathias',
    titan_caiaques: 'Titan Caiaques',
    pesca: 'Pesca & Troféus',
    rifas: 'Rifas & Vales',
    rancho: 'Rancho Lake',
    dicas: 'Dicas Técnicas',
    bastidores: 'Bastidores'
  };

  let html = `
    <div class="table-editorial-wrap">
      <table class="table-editorial">
        <thead>
          <tr>
            <th>Data</th>
            <th>Dia</th>
            <th>Marca</th>
            <th>Formato</th>
            <th>Pilar</th>
            <th>Pauta / Roteiro da Postagem</th>
            <th>Status</th>
            <th style="text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
  `;

  posts.forEach(p => {
    const parts = (p.date || '').split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : p.date;

    const brandName = brandLabels[p.theme] || p.theme || 'Geral';
    let brandBadge = `<span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-light);">${brandName}</span>`;
    if (p.theme === 'steelfish') {
      brandBadge = `<span class="badge-insta-sponsor-steelfish">Steelfish</span>`;
    } else if (['tr_fishing', 'iscas_mathias', 'titan_caiaques', 'fishing_company'].includes(p.theme)) {
      brandBadge = `<span class="badge-insta-sponsor">${brandName}</span>`;
    }

    const formatBadge = p.format === 'reels' ? '<span class="badge-insta-reels">Reels</span>' : (p.format === 'stories' ? '<span class="badge-insta-stories">Stories</span>' : '<span class="badge-insta-feed">Feed</span>');

    const statusBadgeClass = p.status === 'published' ? 'badge-insta-status-published' : (p.status === 'ready' ? 'badge-insta-status-ready' : (p.status === 'producing' ? 'badge-insta-status-producing' : 'badge-insta-status-draft'));
    const statusLabel = p.status === 'published' ? 'Publicado' : (p.status === 'ready' ? 'Pronto' : (p.status === 'producing' ? 'Gravando' : 'Rascunho'));

    const seasonalTag = p.seasonalHook ? `<span class="badge" style="background: rgba(229, 193, 88, 0.15); color: var(--primary-gold); font-size: 0.7rem; margin-left: 0.35rem; border: 1px solid var(--border-gold);">${escapeHtml(p.seasonalHook)}</span>` : '';

    html += `
      <tr>
        <td style="font-weight: 700; white-space: nowrap;">${formattedDate}</td>
        <td style="color: var(--text-muted); font-size: 0.78rem; white-space: nowrap;">${p.dayOfWeek || ''}</td>
        <td style="white-space: nowrap;">${brandBadge}</td>
        <td style="white-space: nowrap;">${formatBadge}</td>
        <td style="color: var(--text-muted); font-size: 0.78rem; white-space: nowrap;">${escapeHtml(p.pillar || '-')}</td>
        <td style="max-width: 320px;">
          <div style="font-weight: 700; color: var(--text-light); line-height: 1.3;">${escapeHtml(p.title || 'Sem título')}${seasonalTag}</div>
          ${p.caption ? `<div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.25rem; max-height: 42px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.caption.slice(0, 120))}...</div>` : ''}
        </td>
        <td style="white-space: nowrap;"><span class="${statusBadgeClass}">${statusLabel}</span></td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 0.35rem;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="copyInstagramPauta('${p.id}')" title="Copiar pauta completa">Copiar</button>
            <button type="button" class="btn ${p.status === 'published' ? 'btn-secondary' : 'btn-whatsapp'} btn-sm" onclick="toggleInstagramPostStatus('${p.id}')" title="Alternar status">${p.status === 'published' ? 'Reabrir' : 'Postar'}</button>
            <button type="button" class="btn btn-gold btn-sm" onclick="openEditInstagramPostModal('${p.id}')" title="Editar">Editar</button>
          </div>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}
window.renderInstagramTable = renderInstagramTable;

async function loadOfficialInstagramSchedule() {
  const source = (typeof window !== 'undefined' && window.OFFICIAL_INSTAGRAM_104_POSTS) ? window.OFFICIAL_INSTAGRAM_104_POSTS : null;
  if (!source || !Array.isArray(source) || source.length === 0) {
    showToast("Cronograma oficial não encontrado.", "error");
    return;
  }
  if (appData.instagramPosts && appData.instagramPosts.length > 0) {
    if (!confirm(`Deseja carregar o cronograma oficial de 104 posts (09/Set a 31/Dez/2026)? Isso sincronizará as postagens de todas as marcas.`)) {
      return;
    }
  }

  appData.instagramPosts = JSON.parse(JSON.stringify(source));
  if (!appData.settings) appData.settings = {};
  appData.settings.instagramPosts = appData.instagramPosts;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: {
      key: 'instagramPosts',
      value: appData.instagramPosts
    }
  });

  showToast(`Cronograma oficial com ${appData.instagramPosts.length} posts carregado com sucesso!`, "success");
  renderInstagramView();
}
window.loadOfficialInstagramSchedule = loadOfficialInstagramSchedule;

function exportInstagramCalendarCSV() {
  const posts = (appData.instagramPosts || []).slice();
  if (posts.length === 0) {
    showToast("Nenhum post para exportar.", "warning");
    return;
  }

  posts.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "").localeCompare(b.time || ""));

  const brandLabels = {
    steelfish: 'Steelfish',
    fishing_company: 'Fishing Company',
    tr_fishing: 'TR Fishing',
    iscas_mathias: 'Iscas Mathias',
    titan_caiaques: 'Titan Caiaques',
    pesca: 'Pesca & Troféus',
    rifas: 'Rifas & Vales',
    rancho: 'Rancho Lake',
    dicas: 'Dicas Técnicas',
    bastidores: 'Bastidores'
  };

  const statusLabels = {
    draft: 'Planejado / Rascunho',
    producing: 'Em Produção',
    ready: 'Agendado / Pronto',
    published: 'Publicado'
  };

  const header = ['Data', 'Dia da Semana', 'Marca / Patrocinador', 'Formato', 'Pilar de Conteúdo', 'Título / Tema', 'Roteiro / Legenda', 'Sazonalidade', 'Status'];
  const rows = [header.join(';')];

  posts.forEach(p => {
    const brand = brandLabels[p.theme] || p.theme || '';
    const status = statusLabels[p.status] || p.status || '';
    const row = [
      p.date || '',
      p.dayOfWeek || '',
      brand,
      (p.format || '').toUpperCase(),
      p.pillar || '',
      p.title || '',
      (p.caption || '').replace(/\r?\n/g, ' '),
      p.seasonalHook || '',
      status
    ].map(val => `"${String(val).replace(/"/g, '""')}"`);
    rows.push(row.join(';'));
  });

  const csvContent = rows.join('\r\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calendario_editorial_instagram_104_posts_2026.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Planilha CSV exportada com sucesso!", "success");
}
window.exportInstagramCalendarCSV = exportInstagramCalendarCSV;

/* ==========================================================================
   TAB 5: GESTÃO DE BOLETOS POR FOTO • BOLETOSCAN PRO
   ========================================================================== */

function renderBoletosView() {
  updateBoletosStats();
  renderBoletoMonthPills();
  renderBoletosAgenda();
}
window.renderBoletosView = renderBoletosView;

function updateBoletosStats() {
  const boletos = appData.boletos || [];
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const monthName = monthNames[boletoSelectedMonth] || "Mês";
  const monthYearLabel = `${monthName} de ${boletoSelectedYear}`;

  const monthPrefix = `${boletoSelectedYear}-${String(boletoSelectedMonth + 1).padStart(2, "0")}`;
  const monthBoletos = boletos.filter(b => b.dueDate && b.dueDate.startsWith(monthPrefix));

  const todayStr = getLocalDateStr();

  let totalToPay = 0;
  let pendingCount = 0;
  let totalPaid = 0;
  let paidCount = 0;
  let dueTodayAmount = 0;
  let dueTodayCount = 0;
  let lateAmount = 0;
  let lateCount = 0;

  monthBoletos.forEach(b => {
    const val = parseFloat(b.amount) || 0;
    if (b.status === 'paid') {
      totalPaid += val;
      paidCount++;
    } else {
      totalToPay += val;
      pendingCount++;
      if (b.dueDate === todayStr) {
        dueTodayAmount += val;
        dueTodayCount++;
      } else if (b.dueDate < todayStr) {
        lateAmount += val;
        lateCount++;
      }
    }
  });

  const lbl = document.getElementById("boletoCurrentMonthLabel");
  if (lbl) lbl.textContent = monthYearLabel;

  const elToPay = document.getElementById("statBoletoTotalToPay");
  if (elToPay) elToPay.textContent = formatCurrency(totalToPay);
  const elPendingCount = document.getElementById("statBoletoPendingCount");
  if (elPendingCount) elPendingCount.textContent = `${pendingCount} boleto${pendingCount === 1 ? '' : 's'} pendente${pendingCount === 1 ? '' : 's'}`;

  const elPaid = document.getElementById("statBoletoTotalPaid");
  if (elPaid) elPaid.textContent = formatCurrency(totalPaid);
  const elPaidCount = document.getElementById("statBoletoPaidCount");
  if (elPaidCount) elPaidCount.textContent = `${paidCount} boleto${paidCount === 1 ? '' : 's'} pago${paidCount === 1 ? '' : 's'}`;

  const elToday = document.getElementById("statBoletoDueToday");
  if (elToday) elToday.textContent = formatCurrency(dueTodayAmount);
  const elTodayCount = document.getElementById("statBoletoDueTodayCount");
  if (elTodayCount) elTodayCount.textContent = `${dueTodayCount} vencendo hoje`;

  const elLate = document.getElementById("statBoletoLate");
  if (elLate) elLate.textContent = formatCurrency(lateAmount);
  const elLateCount = document.getElementById("statBoletoLateCount");
  if (elLateCount) elLateCount.textContent = `${lateCount} em atraso`;
}
window.updateBoletosStats = updateBoletosStats;

function renderBoletoMonthPills() {
  const container = document.getElementById("boletoMonthPills");
  if (!container) return;

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const boletos = appData.boletos || [];
  container.innerHTML = "";

  for (let m = 0; m < 12; m++) {
    const prefix = `${boletoSelectedYear}-${String(m + 1).padStart(2, "0")}`;
    const count = boletos.filter(b => b.dueDate && b.dueDate.startsWith(prefix)).length;
    const isActive = (boletoSelectedMonth === m);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `boleto-month-pill ${isActive ? 'active' : ''}`;
    btn.title = `${monthNames[m]} de ${boletoSelectedYear} (${count} boleto${count === 1 ? '' : 's'})`;
    btn.innerHTML = `<span>${monthNames[m]}</span>${count > 0 ? `<span class="pill-count" style="font-size: 0.72rem; font-weight: 800; padding: 1px 6px; border-radius: 9999px; background: ${isActive ? 'rgba(0,0,0,0.35)' : 'rgba(229,193,88,0.2)'}; color: ${isActive ? '#000000' : 'var(--primary-gold)'}; margin-left: 4px; border: 1px solid ${isActive ? 'transparent' : 'rgba(229,193,88,0.4)'};">${count}</span>` : ''}`;
    btn.onclick = () => selectBoletoMonth(boletoSelectedYear, m);
    container.appendChild(btn);
  }
}
window.renderBoletoMonthPills = renderBoletoMonthPills;

function selectBoletoMonth(year, month) {
  boletoSelectedYear = year;
  boletoSelectedMonth = month;
  renderBoletosView();
}
window.selectBoletoMonth = selectBoletoMonth;

function changeBoletoMonth(delta) {
  boletoSelectedMonth += delta;
  if (boletoSelectedMonth < 0) {
    boletoSelectedMonth = 11;
    boletoSelectedYear--;
  } else if (boletoSelectedMonth > 11) {
    boletoSelectedMonth = 0;
    boletoSelectedYear++;
  }
  renderBoletosView();
}
window.changeBoletoMonth = changeBoletoMonth;

function goToBoletoToday() {
  const now = new Date();
  boletoSelectedYear = now.getFullYear();
  boletoSelectedMonth = now.getMonth();
  renderBoletosView();
}
window.goToBoletoToday = goToBoletoToday;

function setBoletoFilter(filter) {
  currentBoletoFilter = filter;
  const map = {
    all: 'filterBoletoAll',
    pending: 'filterBoletoPending',
    today: 'filterBoletoToday',
    late: 'filterBoletoLate',
    paid: 'filterBoletoPaid'
  };
  Object.values(map).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const activeEl = document.getElementById(map[filter] || 'filterBoletoAll');
  if (activeEl) activeEl.classList.add('active');

  renderBoletosAgenda();
}
window.setBoletoFilter = setBoletoFilter;

function renderBoletosAgenda() {
  const container = document.getElementById("boletosAgendaContainer");
  if (!container) return;

  const searchInput = document.getElementById("inputSearchBoleto");
  const query = (searchInput ? searchInput.value : "").toLowerCase().trim();

  let boletos = (appData.boletos || []).slice();
  const todayStr = getLocalDateStr();

  // Filtra por mês selecionado
  const monthPrefix = `${boletoSelectedYear}-${String(boletoSelectedMonth + 1).padStart(2, "0")}`;
  boletos = boletos.filter(b => b.dueDate && b.dueDate.startsWith(monthPrefix));

  // Filtro de status
  if (currentBoletoFilter === 'pending') {
    boletos = boletos.filter(b => b.status !== 'paid');
  } else if (currentBoletoFilter === 'today') {
    boletos = boletos.filter(b => b.status !== 'paid' && b.dueDate === todayStr);
  } else if (currentBoletoFilter === 'late') {
    boletos = boletos.filter(b => b.status !== 'paid' && b.dueDate < todayStr);
  } else if (currentBoletoFilter === 'paid') {
    boletos = boletos.filter(b => b.status === 'paid');
  }

  // Busca textual
  if (query) {
    boletos = boletos.filter(b => 
      (b.beneficiary || "").toLowerCase().includes(query) ||
      (b.code || "").toLowerCase().includes(query) ||
      (b.description || "").toLowerCase().includes(query) ||
      String(b.amount || "").includes(query)
    );
  }

  if (boletos.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1.5rem; background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-light);">
        <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-light); margin-bottom: 0.4rem;">
          Nenhum boleto encontrado para este mês ou filtro.
        </div>
        <p style="font-size: 0.82rem; color: var(--text-dim); max-width: 480px; margin: 0 auto 1.25rem;">
          Tire uma foto do boleto pelo iPhone, anexe da galeria ou adicione manualmente para organizar a agenda.
        </p>
        <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
          <label for="boletoCameraInput" class="btn btn-gold btn-sm" style="cursor: pointer;">
            Fotografar Boleto
          </label>
          <button type="button" class="btn btn-secondary btn-sm" onclick="openNewBoletoModal()">
            + Digitar Manual
          </button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="loadDemoBoletos()">
            Carregar Demonstração
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Agrupamento por dia de vencimento (ordem cronológica)
  const grouped = {};
  boletos.forEach(b => {
    const key = b.dueDate || 'sem-data';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(b);
  });

  const sortedDates = Object.keys(grouped).sort();
  const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  let html = "";

  sortedDates.forEach(dateStr => {
    const dayBoletos = grouped[dateStr];
    let dayTotal = 0;
    dayBoletos.forEach(b => { dayTotal += (parseFloat(b.amount) || 0); });

    let headerLabel = dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      const weekday = dayNames[dt.getDay()];
      const mName = monthNames[m];
      headerLabel = `Dia ${d} de ${mName} (${weekday})`;
    }

    html += `
      <div class="boleto-day-block">
        <div class="boleto-day-header">
          <div class="boleto-day-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span>${headerLabel}</span>
          </div>
          <div class="boleto-day-total">
            Total do Dia: ${formatCurrency(dayTotal)} <span style="font-size: 0.75rem; color: var(--text-dim); font-weight: normal;">(${dayBoletos.length} boleto${dayBoletos.length === 1 ? '' : 's'})</span>
          </div>
        </div>
        <div class="boleto-day-items">
    `;

    dayBoletos.forEach(b => {
      const isPaid = b.status === 'paid';
      const isLate = !isPaid && b.dueDate < todayStr;
      const isToday = !isPaid && b.dueDate === todayStr;

      let statusBadge = `<span class="badge-boleto-due">A Vencer</span>`;
      if (isPaid) {
        statusBadge = `<span class="badge-boleto-paid">Pago</span>`;
      } else if (isLate) {
        statusBadge = `<span class="badge-boleto-late">Atrasado</span>`;
      } else if (isToday) {
        statusBadge = `<span class="badge-boleto-today">Vence Hoje</span>`;
      }

      const valFormatted = formatCurrency(parseFloat(b.amount) || 0);

      const categoryLabels = {
        rancho: 'Rancho Lake',
        loja: 'Loja',
        barcos: 'Barcos Náuticos',
        combustivel: 'Combustível',
        internet: 'Internet / Starlink',
        energia: 'Energia / Água',
        impostos: 'Impostos',
        outros: 'Geral'
      };
      const catLabel = categoryLabels[b.category] || b.category || 'Geral';

      html += `
        <div class="boleto-card ${isPaid ? 'is-paid' : ''}">
          <div class="boleto-main-info">
            <div class="boleto-beneficiary">
              <span>${escapeHtml(b.beneficiary || 'Sem Beneficiário')}</span>
              <span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-dim); font-size: 0.7rem; border-radius: 4px; padding: 0.15rem 0.45rem;">
                ${catLabel}
              </span>
              ${statusBadge}
            </div>

            ${b.description ? `<div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(b.description)}</div>` : ''}

            ${b.code ? `
              <div style="display: flex; align-items: center; gap: 0.45rem; margin-top: 0.35rem; flex-wrap: wrap;">
                <div class="boleto-code-box" title="Linha digitável do boleto">
                  ${escapeHtml(b.code)}
                </div>
                <button type="button" class="btn btn-gold btn-sm btn-mobile-copy" onclick="copyBoletoLinhaDigitavel('${b.id}', this)" title="Copiar linha digitável para colar no app do banco">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span>Copiar Linha</span>
                </button>
              </div>
            ` : (b.nf ? `
              <div style="display: flex; align-items: center; gap: 0.4rem; margin-top: 0.25rem; flex-wrap: wrap;">
                <span class="badge" style="background: rgba(229,193,88,0.12); border: 1px solid rgba(229,193,88,0.3); color: var(--primary-gold); font-size: 0.72rem; padding: 0.15rem 0.45rem;">NF ${b.nf} • Parcela ${b.installment || '1'}</span>
                <button type="button" class="btn btn-gold btn-sm" style="padding: 0.2rem 0.55rem; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 0.3rem;" onclick="triggerAttachPhotoLinhaDigitavel('${b.id}')" title="Fotografar a linha digitável (47 ou 48 dígitos) deste boleto">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                  <span>Foto Linha</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm" style="padding: 0.2rem 0.55rem; font-size: 0.72rem;" onclick="openBoletoPayModal('${b.id}')" title="Vincular linha digitável do boleto">
                  + Código
                </button>
              </div>
            ` : `
              <div style="display: flex; align-items: center; gap: 0.4rem; margin-top: 0.25rem; flex-wrap: wrap;">
                <button type="button" class="btn btn-gold btn-sm" style="padding: 0.2rem 0.55rem; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 0.3rem;" onclick="triggerAttachPhotoLinhaDigitavel('${b.id}')" title="Fotografar a linha digitável (47 ou 48 dígitos)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                  <span>Foto Linha</span>
                </button>
              </div>
            `)}
          </div>

          <div class="boleto-value-box">
            <div class="boleto-value-num">${valFormatted}</div>
            <div class="boleto-value-sub">${isPaid ? 'Quitado' : 'A pagar'}</div>
          </div>

          <div class="boleto-actions-box">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openBoletoPayModal('${b.id}')" title="Ver código de barras e copiar linha digitável">
              Ver Código / Copiar
            </button>
            <button type="button" class="btn ${isPaid ? 'btn-secondary' : 'btn-whatsapp'} btn-sm" onclick="toggleBoletoPaidStatus('${b.id}')" title="${isPaid ? 'Marcar como não pago' : 'Confirmar quitação deste boleto'}">
              ${isPaid ? 'Reabrir' : 'Marcar como Pago'}
            </button>
            <button type="button" class="btn btn-gold btn-sm" onclick="openEditBoletoModal('${b.id}')" title="Editar informações">
              Editar
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="deleteBoleto('${b.id}')" title="Excluir boleto">
              ✕
            </button>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
window.renderBoletosAgenda = renderBoletosAgenda;

let activeBoletoAttachId = null;

function triggerAttachPhotoLinhaDigitavel(boletoId) {
  activeBoletoAttachId = boletoId;
  const input = document.getElementById("boletoLinhaDigitavelInput");
  if (input) {
    input.value = "";
    input.click();
  }
}
window.triggerAttachPhotoLinhaDigitavel = triggerAttachPhotoLinhaDigitavel;

function copyBoletoLinhaDigitavel(id, btnElement) {
  const b = (appData.boletos || []).find(item => String(item.id) === String(id));
  if (!b || !b.code) {
    showToast("Este boleto não possui linha digitável cadastrada.", "warning");
    return;
  }
  const cleanCode = b.code.replace(/[^\d]/g, '');
  if (!cleanCode) {
    showToast("Nenhum dígito válido na linha digitável.", "warning");
    return;
  }

  // Vibração háptica no celular
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate([40, 30, 40]); } catch (e) {}
  }

  const finishCopy = () => {
    showToast("Linha digitável copiada com sucesso! Cole no app do seu banco.", "success", 4000);
    if (btnElement) {
      const originalHtml = btnElement.innerHTML;
      btnElement.classList.add("btn-copy-success");
      btnElement.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>✓ Copiado!</span>
      `;
      setTimeout(() => {
        btnElement.classList.remove("btn-copy-success");
        btnElement.innerHTML = originalHtml;
      }, 2500);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cleanCode).then(finishCopy).catch(() => {
      fallbackCopyText(cleanCode, finishCopy);
    });
  } else {
    fallbackCopyText(cleanCode, finishCopy);
  }
}
window.copyBoletoLinhaDigitavel = copyBoletoLinhaDigitavel;

function copyBoletoCode(id) {
  copyBoletoLinhaDigitavel(id, null);
}
window.copyBoletoCode = copyBoletoCode;

function fallbackCopyText(text, callback) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    if (callback) callback();
  } catch (e) {
    showToast("Não foi possível copiar automaticamente. Selecione e copie manualmente.", "error");
  }
  document.body.removeChild(ta);
}

async function toggleBoletoPaidStatus(id) {
  const b = (appData.boletos || []).find(item => String(item.id) === String(id));
  if (!b) return;

  b.status = (b.status === 'paid' ? 'pending' : 'paid');
  b.paidAt = b.status === 'paid' ? new Date().toISOString() : null;

  if (!appData.settings) appData.settings = {};
  appData.settings.boletos = appData.boletos;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: {
      key: 'boletos',
      value: appData.boletos
    }
  });

  showToast(b.status === 'paid' ? "Boleto marcado como Pago!" : "Boleto reaberto como Pendente.", "success");
  renderBoletosView();
}
window.toggleBoletoPaidStatus = toggleBoletoPaidStatus;

async function deleteBoleto(id) {
  const b = (appData.boletos || []).find(item => String(item.id) === String(id));
  if (!b) return;

  if (!confirm(`Deseja excluir o boleto de ${b.beneficiary || 'valor ' + formatCurrency(b.amount)}?`)) {
    return;
  }

  appData.boletos = (appData.boletos || []).filter(item => String(item.id) !== String(id));
  if (!appData.settings) appData.settings = {};
  appData.settings.boletos = appData.boletos;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: {
      key: 'boletos',
      value: appData.boletos
    }
  });

  showToast("Boleto excluído com sucesso.", "info");
  renderBoletosView();
}
window.deleteBoleto = deleteBoleto;

let currentBoletoPrefillMetadata = {};

function openNewBoletoModal(prefill = {}) {
  activeBoletoId = null;
  currentBoletoPrefillMetadata = {
    beneficiaryDocument: prefill.beneficiaryDocument || '',
    bankCode: prefill.bankCode || '',
    bankName: prefill.bankName || '',
    barcode: prefill.barcode || '',
    digitLine: prefill.digitLine || prefill.code || '',
    confidence: prefill.confidence || 'manual',
    source: prefill.source || 'manual'
  };

  document.getElementById("modalBoletoFormTitle").textContent = "Registrar Novo Boleto";
  document.getElementById("bfBoletoId").value = "";
  document.getElementById("bfBeneficiary").value = prefill.beneficiary || "";
  document.getElementById("bfCode").value = prefill.formattedCode || prefill.code || "";
  document.getElementById("bfDueDate").value = prefill.dueDate || getLocalDateStr();
  document.getElementById("bfAmount").value = prefill.amount || "";
  document.getElementById("bfCategory").value = prefill.category || "rancho";
  document.getElementById("bfStatus").value = prefill.status || "pending";
  document.getElementById("bfDescription").value = prefill.description || "";

  const prevBox = document.getElementById("bfImagePreviewContainer");
  const prevImg = document.getElementById("bfImagePreview");
  if (lastScannedBoletoDataUrl && prevBox && prevImg) {
    prevImg.src = lastScannedBoletoDataUrl;
    prevBox.style.display = "block";
  } else if (prevBox) {
    prevBox.style.display = "none";
  }

  openModal("modalBoletoForm");
}
window.openNewBoletoModal = openNewBoletoModal;

function openEditBoletoModal(id) {
  const b = (appData.boletos || []).find(item => String(item.id) === String(id));
  if (!b) return;

  activeBoletoId = b.id;
  currentBoletoPrefillMetadata = {
    beneficiaryDocument: b.beneficiaryDocument || '',
    bankCode: b.bankCode || '',
    bankName: b.bankName || '',
    barcode: b.barcode || '',
    digitLine: b.digitLine || b.code || '',
    confidence: b.confidence || 'manual',
    source: b.source || 'manual'
  };

  document.getElementById("modalBoletoFormTitle").textContent = "Editar Boleto";
  document.getElementById("bfBoletoId").value = b.id;
  document.getElementById("bfBeneficiary").value = b.beneficiary || "";
  document.getElementById("bfCode").value = b.code || "";
  document.getElementById("bfDueDate").value = b.dueDate || getLocalDateStr();
  document.getElementById("bfAmount").value = b.amount || "";
  document.getElementById("bfCategory").value = b.category || "rancho";
  document.getElementById("bfStatus").value = b.status || "pending";
  document.getElementById("bfDescription").value = b.description || "";

  const prevBox = document.getElementById("bfImagePreviewContainer");
  const prevImg = document.getElementById("bfImagePreview");
  if (b.imageUrl && prevBox && prevImg) {
    prevImg.src = b.imageUrl;
    prevBox.style.display = "block";
  } else if (prevBox) {
    prevBox.style.display = "none";
  }

  openModal("modalBoletoForm");
}
window.openEditBoletoModal = openEditBoletoModal;

async function saveBoletoModal(batchNext = false) {
  const beneficiary = document.getElementById("bfBeneficiary").value.trim();
  const dueDate = document.getElementById("bfDueDate").value;
  const amount = parseFloat(document.getElementById("bfAmount").value);

  if (!beneficiary) {
    showToast("Informe o beneficiário ou concessionária.", "warning");
    return;
  }
  if (!dueDate) {
    showToast("Informe a data de vencimento do boleto.", "warning");
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    showToast("Informe um valor válido em R$.", "warning");
    return;
  }

  const code = document.getElementById("bfCode").value.trim();
  const category = document.getElementById("bfCategory").value;
  const status = document.getElementById("bfStatus").value;
  const description = document.getElementById("bfDescription").value.trim();

  const idInput = document.getElementById("bfBoletoId").value;
  const isEditing = !!idInput;
  const boletoId = isEditing ? idInput : ('bol-' + Date.now());

  const existing = isEditing ? (appData.boletos || []).find(b => String(b.id) === String(boletoId)) : null;

  let codeValidation = null;
  if (code) {
    codeValidation = validateBoletoCode(code, { allowDvGeralMismatch: true });
  }

  const boletoObj = {
    id: boletoId,
    beneficiary,
    beneficiaryDocument: currentBoletoPrefillMetadata.beneficiaryDocument || (existing && existing.beneficiaryDocument) || '',
    code: (codeValidation && codeValidation.formattedDigitLine) || code,
    digitLine: (codeValidation && codeValidation.digitLine) || currentBoletoPrefillMetadata.digitLine || (existing && existing.digitLine) || '',
    barcode: (codeValidation && codeValidation.barcode) || currentBoletoPrefillMetadata.barcode || (existing && existing.barcode) || '',
    bankCode: (codeValidation && codeValidation.bankCode) || currentBoletoPrefillMetadata.bankCode || (existing && existing.bankCode) || '',
    bankName: (codeValidation && codeValidation.bankName) || currentBoletoPrefillMetadata.bankName || (existing && existing.bankName) || '',
    dueDate,
    amount,
    category,
    status,
    description,
    confidence: (codeValidation && codeValidation.confidence) || currentBoletoPrefillMetadata.confidence || (existing && existing.confidence) || 'manual',
    source: currentBoletoPrefillMetadata.source || (existing && existing.source) || 'manual',
    imageUrl: lastScannedBoletoDataUrl || (existing && existing.imageUrl) || null,
    createdAt: (existing && existing.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!Array.isArray(appData.boletos)) {
    appData.boletos = [];
  }

  if (isEditing) {
    const idx = appData.boletos.findIndex(b => String(b.id) === String(boletoId));
    if (idx >= 0) appData.boletos[idx] = boletoObj;
    else appData.boletos.push(boletoObj);
  } else {
    appData.boletos.unshift(boletoObj);
  }

  if (!appData.settings) appData.settings = {};
  appData.settings.boletos = appData.boletos;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: {
      key: 'boletos',
      value: appData.boletos
    }
  });

  closeModal("modalBoletoForm");
  showToast(isEditing ? "Boleto atualizado com sucesso!" : "Boleto lançado na agenda com sucesso!", "success");

  // Ajusta o mês do seletor para o mês do boleto salvo
  if (dueDate) {
    const parts = dueDate.split('-');
    if (parts.length === 3) {
      boletoSelectedYear = parseInt(parts[0], 10);
      boletoSelectedMonth = parseInt(parts[1], 10) - 1;
    }
  }

  renderBoletosView();
  lastScannedBoletoDataUrl = null;

  if (batchNext) {
    const cam = document.getElementById("boletoCameraInput");
    if (cam) cam.click();
  }
}
window.saveBoletoModal = saveBoletoModal;

function saveBoletoModalAndNext() {
  saveBoletoModal(true);
}
window.saveBoletoModalAndNext = saveBoletoModalAndNext;

function getThiagoRealContasAPagar() {
  return [
    { id: 'bol-real-001', dueDate: '2026-08-31', amount: 1475.96, beneficiary: 'JOGA INDUSTRIA E COMERCIO LTDA', nf: '018810', installment: '001', category: 'loja', status: 'pending', description: 'NF 018810 - Parcela 001 (Duplicata Joga)' },
    { id: 'bol-real-002', dueDate: '2026-09-06', amount: 554.30, beneficiary: 'RICARDO PESCA LTDA', nf: '001869', installment: '001', category: 'loja', status: 'pending', description: 'NF 001869 - Parcela 001 (Duplicata Ricardo Pesca)' },
    { id: 'bol-real-003', dueDate: '2026-09-17', amount: 432.88, beneficiary: 'KALA COMERCIO E DISTRIBUICAO LTDA', nf: '011865', installment: '001', category: 'loja', status: 'pending', description: 'NF 011865 - Parcela 001 (Duplicata Kala)' },
    { id: 'bol-real-004', dueDate: '2026-09-19', amount: 458.50, beneficiary: 'MAJU - DIST. DE MAT. ELETR. E HIDRAULICOS LTDA', nf: '286266', installment: '001', category: 'loja', status: 'pending', description: 'NF 286266 - Parcela 001 (Duplicata Maju)' },
    { id: 'bol-real-005', dueDate: '2026-09-21', amount: 185.03, beneficiary: 'NAKINE DECORACOES LTDA', nf: '004283', installment: '003', category: 'loja', status: 'pending', description: 'NF 004283 - Parcela 003 (Duplicata Nakine)' },
    { id: 'bol-real-006', dueDate: '2026-09-30', amount: 1475.96, beneficiary: 'JOGA INDUSTRIA E COMERCIO LTDA', nf: '018810', installment: '002', category: 'loja', status: 'pending', description: 'NF 018810 - Parcela 002 (Duplicata Joga)' },
    { id: 'bol-real-007', dueDate: '2026-10-02', amount: 432.87, beneficiary: 'KALA COMERCIO E DISTRIBUICAO LTDA', nf: '011865', installment: '002', category: 'loja', status: 'pending', description: 'NF 011865 - Parcela 002 (Duplicata Kala)' },
    { id: 'bol-real-008', dueDate: '2026-10-04', amount: 1061.44, beneficiary: 'NAKINE DECORACOES LTDA', nf: '004403', installment: '001', category: 'loja', status: 'pending', description: 'NF 004403 - Parcela 001 (Duplicata Nakine)' },
    { id: 'bol-real-009', dueDate: '2026-10-17', amount: 432.87, beneficiary: 'KALA COMERCIO E DISTRIBUICAO LTDA', nf: '011865', installment: '003', category: 'loja', status: 'pending', description: 'NF 011865 - Parcela 003 (Duplicata Kala)' },
    { id: 'bol-real-010', dueDate: '2026-10-30', amount: 1475.96, beneficiary: 'JOGA INDUSTRIA E COMERCIO LTDA', nf: '018810', installment: '003', category: 'loja', status: 'pending', description: 'NF 018810 - Parcela 003 (Duplicata Joga)' },
    { id: 'bol-real-011', dueDate: '2026-11-03', amount: 980.46, beneficiary: 'NAKINE DECORACOES LTDA', nf: '004403', installment: '002', category: 'loja', status: 'pending', description: 'NF 004403 - Parcela 002 (Duplicata Nakine)' },
    { id: 'bol-real-012', dueDate: '2026-11-29', amount: 1475.96, beneficiary: 'JOGA INDUSTRIA E COMERCIO LTDA', nf: '018810', installment: '004', category: 'loja', status: 'pending', description: 'NF 018810 - Parcela 004 (Duplicata Joga)' },
    { id: 'bol-real-013', dueDate: '2026-12-03', amount: 980.46, beneficiary: 'NAKINE DECORACOES LTDA', nf: '004403', installment: '003', category: 'loja', status: 'pending', description: 'NF 004403 - Parcela 003 (Duplicata Nakine)' },
    { id: 'bol-real-014', dueDate: '2026-12-29', amount: 1475.94, beneficiary: 'JOGA INDUSTRIA E COMERCIO LTDA', nf: '018810', installment: '005', category: 'loja', status: 'pending', description: 'NF 018810 - Parcela 005 (Duplicata Joga)' },
    { id: 'bol-real-015', dueDate: '2027-01-02', amount: 980.46, beneficiary: 'NAKINE DECORACOES LTDA', nf: '004403', installment: '004', category: 'loja', status: 'pending', description: 'NF 004403 - Parcela 004 (Duplicata Nakine)' },
    { id: 'bol-real-016', dueDate: '2027-02-01', amount: 980.46, beneficiary: 'NAKINE DECORACOES LTDA', nf: '004403', installment: '005', category: 'loja', status: 'pending', description: 'NF 004403 - Parcela 005 (Duplicata Nakine)' }
  ];
}
window.getThiagoRealContasAPagar = getThiagoRealContasAPagar;

async function loadDemoBoletos() {
  if (!confirm("Deseja carregar as 16 contas a pagar reais do relatório FastReport (Total R$ 14.859,51)?")) {
    return;
  }

  const realBoletos = getThiagoRealContasAPagar();
  appData.boletos = realBoletos.slice();
  if (!appData.settings) appData.settings = {};
  appData.settings.boletos = appData.boletos;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: {
      key: 'boletos',
      value: appData.boletos
    }
  });

  showToast("16 contas a pagar reais do relatório carregadas com sucesso!", "success");
  boletoSelectedYear = 2026;
  boletoSelectedMonth = 8; // Setembro
  renderBoletosView();
}
window.loadDemoBoletos = loadDemoBoletos;

/* Parser & Importador de Relatório FastReport (HTML / PDF) */
function parseFastReportContasAPagar(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') return [];
  const boletos = [];
  const rowPattern = /<td[^>]*>(\d{2}\/\d{2}\/\d{4})<\/td>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<td[^>]*class="s7"[^>]*>([\d\.,]+)<\/td>/gi;
  
  let match;
  let idx = 1;
  while ((match = rowPattern.exec(htmlContent)) !== null) {
    const rawDate = match[1];
    const [d, m, y] = rawDate.split('/');
    const dueDate = `${y}-${m}-${d}`;
    const supplier = match[2].trim();
    const nf = match[3].trim();
    const installment = match[4].trim();
    const amountClean = match[5].replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(amountClean) || 0;
    
    let category = 'loja';
    const sUpper = supplier.toUpperCase();
    if (sUpper.includes('COPEL') || sUpper.includes('SANEPAR')) category = 'energia';
    else if (sUpper.includes('STARLINK') || sUpper.includes('INTERNET')) category = 'internet';
    else if (sUpper.includes('PETROLEO') || sUpper.includes('COMBUSTIVEL')) category = 'combustivel';
    else if (sUpper.includes('NAUTICA') || sUpper.includes('BARCO') || sUpper.includes('MERCURY')) category = 'barcos';

    boletos.push({
      id: `bol-rel-${dueDate}-${nf}-${installment}-${idx++}`,
      beneficiary: supplier,
      code: '',
      bankName: supplier.includes('JOGA') ? 'Joga Fornecedor' : (supplier.includes('KALA') ? 'Kala Distribuição' : (supplier.includes('NAKINE') ? 'Nakine Decorações' : 'Fornecedor')),
      dueDate: dueDate,
      amount: amount,
      category: category,
      status: 'pending',
      description: `NF ${nf} - Parcela ${installment} (Duplicata FastReport)`,
      nf: nf,
      installment: installment,
      source: 'relatorio_fastreport'
    });
  }
  return boletos;
}
window.parseFastReportContasAPagar = parseFastReportContasAPagar;

async function saveParsedContasAPagar(parsed, sourceLabel = "relatório") {
  if (!parsed || parsed.length === 0) return;
  if (!Array.isArray(appData.boletos)) appData.boletos = [];

  let importedCount = 0;
  let updatedCount = 0;
  let totalAmount = 0;

  parsed.forEach(newItem => {
    totalAmount += (parseFloat(newItem.amount) || 0);
    const existingIndex = appData.boletos.findIndex(b => 
      (b.nf && b.installment && b.nf === newItem.nf && String(b.installment) === String(newItem.installment)) ||
      (b.beneficiary === newItem.beneficiary && b.dueDate === newItem.dueDate && Math.abs(b.amount - newItem.amount) < 0.05)
    );

    if (existingIndex >= 0) {
      const existing = appData.boletos[existingIndex];
      appData.boletos[existingIndex] = {
        ...existing,
        dueDate: newItem.dueDate,
        amount: newItem.amount,
        beneficiary: newItem.beneficiary,
        nf: newItem.nf,
        installment: newItem.installment,
        description: existing.description || newItem.description
      };
      updatedCount++;
    } else {
      appData.boletos.push(newItem);
      importedCount++;
    }
  });

  if (!appData.settings) appData.settings = {};
  appData.settings.boletos = appData.boletos;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: { key: 'boletos', value: appData.boletos }
  });

  showToast(`${importedCount} contas adicionadas e ${updatedCount} atualizadas do ${sourceLabel}! Total: ${formatCurrency(totalAmount)}`, "success", 5000);

  if (parsed[0] && parsed[0].dueDate) {
    const parts = parsed[0].dueDate.split('-');
    if (parts.length === 3) {
      boletoSelectedYear = parseInt(parts[0], 10);
      boletoSelectedMonth = parseInt(parts[1], 10) - 1;
    }
  }

  renderBoletosView();
}
window.saveParsedContasAPagar = saveParsedContasAPagar;

async function importFastReportHtml(htmlContent) {
  const parsed = parseFastReportContasAPagar(htmlContent);
  if (parsed.length === 0) {
    showToast("Nenhuma conta a pagar identificada no arquivo HTML. Verifique se o formato é FastReport.", "warning");
    return;
  }
  await saveParsedContasAPagar(parsed, "relatório HTML");
}
window.importFastReportHtml = importFastReportHtml;

/* Parser de texto de relatório FastReport (extraído de PDF ou TXT) */
function parseFastReportPdfText(textLines) {
  if (!Array.isArray(textLines)) return [];
  const boletos = [];
  let currentBoleto = null;

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i].trim();
    if (!line) continue;
    const dateMatch = line.match(/^([0-3]\d\/[0-1]\d\/202\d)/);

    if (dateMatch) {
      if (currentBoleto) {
        boletos.push(currentBoleto);
      }

      const dueDateRaw = dateMatch[1];
      const [d, m, y] = dueDateRaw.split('/');
      const isoDueDate = `${y}-${m}-${d}`;

      const rest = line.substring(dueDateRaw.length).trim();

      let nf = '';
      let installment = '';
      const nfMatch = rest.match(/\b(\d{4,8})\s+(\d{1,4})\b/);
      if (nfMatch) {
        nf = nfMatch[1];
        installment = String(parseInt(nfMatch[2], 10));
      }

      const amounts = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g) || [];

      let supplier = rest;
      if (nfMatch) {
        supplier = rest.substring(0, rest.indexOf(nfMatch[0])).trim();
      }

      let category = 'loja';
      const sUpper = supplier.toUpperCase();
      if (sUpper.includes('COPEL') || sUpper.includes('SANEPAR')) category = 'energia';
      else if (sUpper.includes('STARLINK') || sUpper.includes('INTERNET')) category = 'internet';
      else if (sUpper.includes('PETROLEO') || sUpper.includes('COMBUSTIVEL')) category = 'combustivel';
      else if (sUpper.includes('NAUTICA') || sUpper.includes('BARCO') || sUpper.includes('MERCURY')) category = 'barcos';

      currentBoleto = {
        id: `bol-pdf-${isoDueDate}-${nf || Date.now()}-${installment || '1'}-${boletos.length + 1}`,
        dueDate: isoDueDate,
        beneficiary: supplier,
        bankName: supplier.includes('JOGA') ? 'Joga Fornecedor' : (supplier.includes('KALA') ? 'Kala Distribuição' : (supplier.includes('NAKINE') ? 'Nakine Decorações' : 'Fornecedor')),
        code: '',
        amount: amounts.length > 0 ? parseFloat(amounts[0].replace(/\./g, '').replace(',', '.')) : 0,
        category: category,
        status: 'pending',
        description: nf ? `NF ${nf} - Parcela ${installment || '1'} (Duplicata FastReport)` : 'Duplicata a Pagar',
        nf: nf,
        installment: installment || '1',
        source: 'relatorio_pdf'
      };
    } else if (currentBoleto) {
      if (line.startsWith('TOTAL GERAL:') || line.startsWith('TOTAL:')) {
        boletos.push(currentBoleto);
        currentBoleto = null;
        break;
      }

      const amounts = line.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
      if (amounts && amounts.length > 0 && currentBoleto.amount === 0) {
        currentBoleto.amount = parseFloat(amounts[0].replace(/\./g, '').replace(',', '.'));
      }

      const cleanLine = line.replace(/\bTA\b|\bDUPLICA\b|\bDuplicata a Pagar\b/gi, '').replace(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g, '').trim();
      if (cleanLine && !cleanLine.includes('TOTAL') && !cleanLine.includes('0,00')) {
        currentBoleto.beneficiary = (currentBoleto.beneficiary + ' ' + cleanLine).replace(/\bLTDA\b(\s+\bLTDA\b)+/gi, 'LTDA').replace(/\s+/g, ' ').trim();
      }
    }
  }
  if (currentBoleto) boletos.push(currentBoleto);
  return boletos;
}
window.parseFastReportPdfText = parseFastReportPdfText;

async function parseAndImportFastReportTextLines(textLines, label = "relatório") {
  const parsed = parseFastReportPdfText(textLines);
  if (parsed.length === 0) {
    showToast("Nenhuma conta encontrada no formato do relatório.", "warning");
    return;
  }
  await saveParsedContasAPagar(parsed, label);
}
window.parseAndImportFastReportTextLines = parseAndImportFastReportTextLines;

function triggerImportReportClick() {
  const input = document.getElementById("boletoPdfInput") || document.getElementById("inputImportReportFile");
  if (input) {
    input.value = "";
    input.click();
  }
}
window.triggerImportReportClick = triggerImportReportClick;

function handleReportFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    processBoletoPdf(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    if (lowerName.endsWith('.txt')) {
      parseAndImportFastReportTextLines(content.split(/\r?\n/), 'arquivo texto');
    } else {
      importFastReportHtml(content);
    }
  };
  reader.onerror = () => {
    showToast("Erro ao ler arquivo do relatório.", "danger");
  };
  reader.readAsText(file);
}
window.handleReportFileUpload = handleReportFileUpload;

/* Conversões FEBRABAN: Linha Digitável <-> Código de Barras (44 dígitos) */
function calcMod10(seq) {
  let mult = 2;
  let sum = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    let mul = parseInt(seq[i], 10) * mult;
    if (mul > 9) mul = Math.floor(mul / 10) + (mul % 10);
    sum += mul;
    mult = mult === 2 ? 1 : 2;
  }
  const rem = sum % 10;
  return rem === 0 ? '0' : String(10 - rem);
}
window.calcMod10 = calcMod10;
if (typeof globalThis !== 'undefined') globalThis.calcMod10 = calcMod10;

function calcMod11Arrecadacao(seq) {
  let sum = 0;
  let weight = 2;
  for (let i = seq.length - 1; i >= 0; i--) {
    sum += parseInt(seq[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  if (rem === 0 || rem === 1) return '0';
  if (rem === 10) return '1';
  return String(11 - rem);
}
window.calcMod11Arrecadacao = calcMod11Arrecadacao;
if (typeof globalThis !== 'undefined') globalThis.calcMod11Arrecadacao = calcMod11Arrecadacao;

function calcDvGeralFebraban(code44) {
  if (!code44 || code44.length !== 44) return null;
  const digits = code44.slice(0, 4) + code44.slice(5);
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  const dv = 11 - rem;
  if (dv === 0 || dv === 10 || dv === 11) return '1';
  return String(dv);
}
window.calcDvGeralFebraban = calcDvGeralFebraban;
if (typeof globalThis !== 'undefined') globalThis.calcDvGeralFebraban = calcDvGeralFebraban;

function calcFactorDueDate(factor) {
  const f = parseInt(factor, 10);
  if (isNaN(f) || f < 1000) return null;

  let dt = null;
  // Regra FEBRABAN: Ciclo 1 base 1997-10-07 atingiu 9999 em 21/02/2025.
  // Em 22/02/2025 reiniciou em 1000 (Ciclo 2).
  // Fatores de 1000 a 3000 pertencem ao Ciclo 2 (datas de 2025 a ~2030).
  // Fatores > 3000 (ex: 8000 a 9999) pertencem ao Ciclo 1 (datas históricas 2019 a fev/2025).
  if (f < 3000) {
    const base2025 = new Date(2025, 1, 22);
    dt = new Date(base2025.getTime() + (f - 1000) * 86400000);
  } else {
    const base1997 = new Date(1997, 9, 7);
    dt = new Date(base1997.getTime() + f * 86400000);
  }

  if (!dt || isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  if (year < 2000 || year > 2040) return null; // Sanidade temporal estrita

  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
window.calcFactorDueDate = calcFactorDueDate;
if (typeof globalThis !== 'undefined') globalThis.calcFactorDueDate = calcFactorDueDate;

const FEBRABAN_BANK_NAMES = {
  '001': 'Banco do Brasil',
  '033': 'Santander',
  '104': 'Caixa Econômica Federal',
  '237': 'Bradesco',
  '341': 'Itaú Unibanco',
  '748': 'Sicredi',
  '756': 'Sicoob',
  '260': 'Nubank',
  '077': 'Banco Inter',
  '212': 'Banco Original',
  '041': 'Banrisul',
  '422': 'Banco Safra',
  '655': 'Banco Votorantim / BV',
  '070': 'BRB - Banco de Brasília',
  '085': 'Ailos / Viacredi',
  '136': 'Unicred',
  '290': 'PagBank',
  '380': 'PicPay',
  '336': 'C6 Bank',
  '633': 'Banco Rendimento',
  '208': 'Banco BTG Pactual',
  '021': 'Banestes',
  '047': 'Banese'
};
window.FEBRABAN_BANK_NAMES = FEBRABAN_BANK_NAMES;
if (typeof globalThis !== 'undefined') globalThis.FEBRABAN_BANK_NAMES = FEBRABAN_BANK_NAMES;

function linhaDigitavelToCodigoBarras(linha) {
  const c = String(linha || '').replace(/\D/g, '');
  if (c.length === 47) {
    const banco = c.slice(0, 3);
    const moeda = c.slice(3, 4);
    const campoLivre1 = c.slice(4, 9);
    const campoLivre2 = c.slice(10, 20);
    const campoLivre3 = c.slice(21, 31);
    const dvGeral = c.slice(32, 33);
    const fatorVenc = c.slice(33, 37);
    const valor = c.slice(37, 47);
    return banco + moeda + dvGeral + fatorVenc + valor + campoLivre1 + campoLivre2 + campoLivre3;
  } else if (c.length === 48) {
    return c.slice(0, 11) + c.slice(12, 23) + c.slice(24, 35) + c.slice(36, 47);
  }
  return c;
}
window.linhaDigitavelToCodigoBarras = linhaDigitavelToCodigoBarras;
if (typeof globalThis !== 'undefined') globalThis.linhaDigitavelToCodigoBarras = linhaDigitavelToCodigoBarras;

function codigoBarrasToLinhaDigitavel(barcode) {
  const c = String(barcode || '').replace(/\D/g, '');
  if (c.length === 44) {
    if (c.startsWith('8')) {
      const b1 = c.slice(0, 11);
      const b2 = c.slice(11, 22);
      const b3 = c.slice(22, 33);
      const b4 = c.slice(33, 44);
      const moedaMod = c[2];
      const isMod10 = (moedaMod === '6' || moedaMod === '7');
      const calcFn = isMod10 ? calcMod10 : calcMod11Arrecadacao;
      return `${b1}-${calcFn(b1)} ${b2}-${calcFn(b2)} ${b3}-${calcFn(b3)} ${b4}-${calcFn(b4)}`;
    }
    const banco = c.slice(0, 3);
    const moeda = c.slice(3, 4);
    const dvGeral = c.slice(4, 5);
    const fator = c.slice(5, 9);
    const valor = c.slice(9, 19);
    const campoLivre1 = c.slice(19, 24);
    const campoLivre2 = c.slice(24, 34);
    const campoLivre3 = c.slice(34, 44);

    const f1 = banco + moeda + campoLivre1;
    const f2 = campoLivre2;
    const f3 = campoLivre3;

    const part1 = f1 + calcMod10(f1);
    const part2 = f2 + calcMod10(f2);
    const part3 = f3 + calcMod10(f3);
    const part4 = dvGeral;
    const part5 = fator + valor;

    return `${part1.slice(0, 5)}.${part1.slice(5)} ${part2.slice(0, 5)}.${part2.slice(5)} ${part3.slice(0, 5)}.${part3.slice(5)} ${part4} ${part5}`;
  }
  return barcode;
}
window.codigoBarrasToLinhaDigitavel = codigoBarrasToLinhaDigitavel;
if (typeof globalThis !== 'undefined') globalThis.codigoBarrasToLinhaDigitavel = codigoBarrasToLinhaDigitavel;

function validateBoletoCode(code, options = {}) {
  const result = {
    valid: false,
    type: null,
    barcode: '',
    digitLine: '',
    formattedDigitLine: '',
    formattedBarcode: '',
    bankCode: null,
    bankName: null,
    amount: null,
    dueDate: null,
    factor: null,
    confidence: 'low',
    errors: []
  };

  if (!code) {
    result.errors.push('Código vazio');
    return result;
  }

  const clean = String(code).trim().replace(/\D/g, '');

  if (clean.length === 44) {
    if (clean.startsWith('8')) {
      // Arrecadação / Concessionária (44 dígitos)
      const moedaMod = clean[2];
      const dvGeral = clean[3];
      const valCentavos = parseInt(clean.slice(4, 15), 10);
      const isMod10 = (moedaMod === '6' || moedaMod === '7');
      const isMod11 = (moedaMod === '8' || moedaMod === '9');

      if (!isMod10 && !isMod11) {
        result.errors.push('Identificador de valor/módulo inválido no boleto de arrecadação');
        return result;
      }

      const seqSemDv = clean.slice(0, 3) + clean.slice(4);
      const calcDv = isMod10 ? calcMod10(seqSemDv) : calcMod11Arrecadacao(seqSemDv);

      if (calcDv !== dvGeral) {
        result.errors.push(`Dígito verificador geral de arrecadação inválido (esperado ${calcDv}, obtido ${dvGeral})`);
        return result;
      }

      result.valid = true;
      result.type = 'utility';
      result.barcode = clean;
      result.formattedBarcode = `${clean.slice(0, 11)} ${clean.slice(11, 22)} ${clean.slice(22, 33)} ${clean.slice(33, 44)}`;
      result.digitLine = codigoBarrasToLinhaDigitavel(clean).replace(/\D/g, '');
      result.formattedDigitLine = codigoBarrasToLinhaDigitavel(clean);
      if (valCentavos > 0 && (moedaMod === '6' || moedaMod === '8')) {
        result.amount = (valCentavos / 100).toFixed(2);
      }
      result.confidence = 'high';
      return result;

    } else {
      // Boleto Bancário (44 dígitos)
      const bankCode = clean.slice(0, 3);
      const moeda = clean.slice(3, 4);
      const dvGeral = clean.slice(4, 5);
      const fator = parseInt(clean.slice(5, 9), 10);
      const valCentavos = parseInt(clean.slice(9, 19), 10);

      if (moeda !== '9' && moeda !== '0') {
        result.errors.push('Código de moeda bancária inválido');
        return result;
      }

      const dvCalc = calcDvGeralFebraban(clean);
      if (dvCalc !== dvGeral) {
        result.errors.push(`Dígito verificador geral do código de barras inválido (esperado ${dvCalc}, obtido ${dvGeral})`);
        return result;
      }

      result.valid = true;
      result.type = 'bank';
      result.barcode = clean;
      result.formattedBarcode = `${clean.slice(0, 4)}.${clean.slice(4, 5)}.${clean.slice(5, 9)}.${clean.slice(9, 19)}.${clean.slice(19)}`;
      result.bankCode = bankCode;
      result.bankName = FEBRABAN_BANK_NAMES[bankCode] || ('Banco ' + bankCode);
      result.digitLine = codigoBarrasToLinhaDigitavel(clean).replace(/\D/g, '');
      result.formattedDigitLine = codigoBarrasToLinhaDigitavel(clean);

      if (fator >= 1000) {
        result.factor = fator;
        result.dueDate = calcFactorDueDate(fator);
      }
      if (valCentavos > 0) {
        result.amount = (valCentavos / 100).toFixed(2);
      }
      result.confidence = 'high';
      return result;
    }

  } else if (clean.length === 47) {
    // Linha Digitável Bancária (47 dígitos)
    const c1 = clean.slice(0, 9);
    const dv1 = clean.slice(9, 10);
    const c2 = clean.slice(10, 20);
    const dv2 = clean.slice(20, 21);
    const c3 = clean.slice(21, 31);
    const dv3 = clean.slice(31, 32);
    const dvGeral = clean.slice(32, 33);
    const fatorStr = clean.slice(33, 37);
    const valorStr = clean.slice(37, 47);

    const calcDv1 = calcMod10(c1);
    const calcDv2 = calcMod10(c2);
    const calcDv3 = calcMod10(c3);

    const dv1Ok = (calcDv1 === dv1);
    const dv2Ok = (calcDv2 === dv2);
    const dv3Ok = (calcDv3 === dv3);

    if (!dv1Ok) result.errors.push(`DV do campo 1 inválido (esperado ${calcDv1}, obtido ${dv1})`);
    if (!dv2Ok) result.errors.push(`DV do campo 2 inválido (esperado ${calcDv2}, obtido ${dv2})`);
    if (!dv3Ok) result.errors.push(`DV do campo 3 inválido (esperado ${calcDv3}, obtido ${dv3})`);

    const barcode44 = linhaDigitavelToCodigoBarras(clean);
    const calcDvG = calcDvGeralFebraban(barcode44);
    const dvGOk = (calcDvG === dvGeral);
    if (!dvGOk) result.errors.push(`DV geral divergente (esperado ${calcDvG}, obtido ${dvGeral})`);

    const allowMismatch = (options && options.allowDvGeralMismatch === true);
    const isValid = dv1Ok && dv2Ok && dv3Ok && (dvGOk || allowMismatch);

    if (!isValid) {
      return result;
    }

    const bankCode = clean.slice(0, 3);
    const fator = parseInt(fatorStr, 10);
    const valCentavos = parseInt(valorStr, 10);

    result.valid = true;
    result.type = 'bank';
    result.barcode = barcode44;
    result.formattedBarcode = `${barcode44.slice(0, 4)}.${barcode44.slice(4, 5)}.${barcode44.slice(5, 9)}.${barcode44.slice(9, 19)}.${barcode44.slice(19)}`;
    result.digitLine = clean;
    result.formattedDigitLine = `${clean.slice(0, 5)}.${clean.slice(5, 10)} ${clean.slice(10, 15)}.${clean.slice(15, 21)} ${clean.slice(21, 26)}.${clean.slice(26, 32)} ${clean.slice(32, 33)} ${clean.slice(33, 47)}`;
    result.bankCode = bankCode;
    result.bankName = FEBRABAN_BANK_NAMES[bankCode] || ('Banco ' + bankCode);

    if (fator >= 1000) {
      result.factor = fator;
      result.dueDate = calcFactorDueDate(fator);
    }
    if (valCentavos > 0) {
      result.amount = (valCentavos / 100).toFixed(2);
    }
    result.confidence = dvGOk ? 'high' : 'medium';
    return result;

  } else if (clean.length === 48) {
    // Linha Digitável de Arrecadação / Concessionária (48 dígitos)
    if (!clean.startsWith('8')) {
      result.errors.push('Linha de 48 dígitos deve iniciar com 8');
      return result;
    }

    const moedaMod = clean[2];
    const isMod10 = (moedaMod === '6' || moedaMod === '7');
    const isMod11 = (moedaMod === '8' || moedaMod === '9');

    if (!isMod10 && !isMod11) {
      result.errors.push('Identificador de módulo inválido no boleto de arrecadação');
      return result;
    }

    const b1 = clean.slice(0, 11);
    const dv1 = clean.slice(11, 12);
    const b2 = clean.slice(12, 23);
    const dv2 = clean.slice(23, 24);
    const b3 = clean.slice(24, 35);
    const dv3 = clean.slice(35, 36);
    const b4 = clean.slice(36, 47);
    const dv4 = clean.slice(47, 48);

    const calcFn = isMod10 ? calcMod10 : calcMod11Arrecadacao;
    const calcDv1 = calcFn(b1);
    const calcDv2 = calcFn(b2);
    const calcDv3 = calcFn(b3);
    const calcDv4 = calcFn(b4);

    const dv1Ok = (calcDv1 === dv1);
    const dv2Ok = (calcDv2 === dv2);
    const dv3Ok = (calcDv3 === dv3);
    const dv4Ok = (calcDv4 === dv4);

    if (!dv1Ok) result.errors.push(`DV do bloco 1 inválido (esperado ${calcDv1}, obtido ${dv1})`);
    if (!dv2Ok) result.errors.push(`DV do bloco 2 inválido (esperado ${calcDv2}, obtido ${dv2})`);
    if (!dv3Ok) result.errors.push(`DV do bloco 3 inválido (esperado ${calcDv3}, obtido ${dv3})`);
    if (!dv4Ok) result.errors.push(`DV do bloco 4 inválido (esperado ${calcDv4}, obtido ${dv4})`);

    const allowMismatch = (options && options.allowDvGeralMismatch === true);
    const isValid = (dv1Ok && dv2Ok && dv3Ok && dv4Ok) || (allowMismatch && (dv1Ok || dv2Ok));

    if (!isValid) {
      return result;
    }

    const barcode44 = b1 + b2 + b3 + b4;
    const valCentavos = parseInt(barcode44.slice(4, 15), 10);

    result.valid = true;
    result.type = 'utility';
    result.barcode = barcode44;
    result.formattedBarcode = `${barcode44.slice(0, 11)} ${barcode44.slice(11, 22)} ${barcode44.slice(22, 33)} ${barcode44.slice(33, 44)}`;
    result.digitLine = clean;
    result.formattedDigitLine = `${b1}-${dv1} ${b2}-${dv2} ${b3}-${dv3} ${b4}-${dv4}`;
    if (valCentavos > 0 && (moedaMod === '6' || moedaMod === '8')) {
      result.amount = (valCentavos / 100).toFixed(2);
    }
    result.confidence = (dv1Ok && dv2Ok && dv3Ok && dv4Ok) ? 'high' : 'medium';
    return result;

  } else {
    result.errors.push(`Comprimento numérico inválido (${clean.length} dígitos, esperado 44, 47 ou 48)`);
    return result;
  }
}
window.validateBoletoCode = validateBoletoCode;
if (typeof globalThis !== 'undefined') globalThis.validateBoletoCode = validateBoletoCode;

/* Geradores de Código de Barras (ITF / FEBRABAN) e QR Code */
function generateItfBarcodeSvg(digits, height = 70) {
  let clean = String(digits || '').replace(/\D/g, '');
  if (clean.length === 0) return '';
  if (clean.length % 2 !== 0) clean = '0' + clean;
  
  const ITF_PATTERNS = [
    '00110', '10001', '01001', '11000', '00101',
    '10100', '01100', '00011', '10010', '01010'
  ];
  
  const narrow = 2;
  const wide = 5;
  let elements = [];
  let x = 12;
  
  elements.push({ x, w: narrow }); x += narrow;
  x += narrow;
  elements.push({ x, w: narrow }); x += narrow;
  x += narrow;
  
  for (let i = 0; i < clean.length; i += 2) {
    const p1 = ITF_PATTERNS[parseInt(clean[i], 10)];
    const p2 = ITF_PATTERNS[parseInt(clean[i + 1], 10)];
    for (let j = 0; j < 5; j++) {
      const barW = p1[j] === '1' ? wide : narrow;
      const spaceW = p2[j] === '1' ? wide : narrow;
      elements.push({ x, w: barW });
      x += barW;
      x += spaceW;
    }
  }
  
  elements.push({ x, w: wide }); x += wide;
  x += narrow;
  elements.push({ x, w: narrow }); x += narrow;
  x += 12;
  
  const barHeight = height - 20;
  const rects = elements.map(e => `<rect x="${e.x}" y="6" width="${e.w}" height="${barHeight}" fill="#111827"/>`).join('');
  
  return `<svg viewBox="0 0 ${x} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; border-radius:6px; padding:4px; box-sizing:border-box;">
    ${rects}
    <text x="${x / 2}" y="${height - 4}" text-anchor="middle" font-family="monospace" font-size="10" fill="#1f2937" font-weight="bold">${clean}</text>
  </svg>`;
}
window.generateItfBarcodeSvg = generateItfBarcodeSvg;

function generateQRCodeSvg(text, cellSize = 4, margin = 8) {
  if (!text) return '';
  try {
    if (typeof window.qrcode === 'function') {
      const qr = window.qrcode(0, 'M');
      qr.addData(String(text));
      qr.make();
      return qr.createSvgTag(cellSize, margin);
    }
  } catch (err) {
    console.warn('Erro ao gerar QR Code SVG:', err);
  }
  return '';
}
window.generateQRCodeSvg = generateQRCodeSvg;

/* ==========================================================================
   DECODIFICADOR DE CÓDIGO DE BARRAS (ITF / I2OF5) & LEITOR DE CÂMERA AO VIVO
   ========================================================================== */
const ITF_PATTERNS = [
  '00110', '10001', '01001', '11000', '00101',
  '10100', '01100', '00011', '10010', '01010'
];

function calcDvGeralFebraban(code44) {
  if (!code44 || code44.length !== 44) return null;
  const digits = code44.slice(0, 4) + code44.slice(5);
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  const dv = 11 - rem;
  if (dv === 0 || dv === 10 || dv === 11) return '1';
  return String(dv);
}
window.calcDvGeralFebraban = calcDvGeralFebraban;

function decode5Elements(widths) {
  if (!widths || widths.length !== 5) return -1;
  const indexed = widths.map((w, idx) => ({ w, idx }));
  indexed.sort((a, b) => b.w - a.w);
  const bits = ['0', '0', '0', '0', '0'];
  bits[indexed[0].idx] = '1';
  bits[indexed[1].idx] = '1';
  return ITF_PATTERNS.indexOf(bits.join(''));
}

function decodeItfRunLengths(runs) {
  if (!runs || runs.length < 227) return null;

  for (let startIdx = 0; startIdx <= runs.length - 227; startIdx++) {
    if (!runs[startIdx].isBlack) continue;
    const s1 = runs[startIdx].width;
    const s2 = runs[startIdx + 1].width;
    const s3 = runs[startIdx + 2].width;
    const s4 = runs[startIdx + 3].width;

    const avgNarrow = (s1 + s2 + s3 + s4) / 4;
    if (avgNarrow < 0.75) continue;

    const maxDiff = Math.max(
      Math.abs(s1 - avgNarrow),
      Math.abs(s2 - avgNarrow),
      Math.abs(s3 - avgNarrow),
      Math.abs(s4 - avgNarrow)
    );
    if (maxDiff > avgNarrow * 0.9) continue;

    let pos = startIdx + 4;
    let code = '';
    let valid = true;

    for (let pair = 0; pair < 22; pair++) {
      if (pos + 10 > runs.length) { valid = false; break; }
      const bars = [];
      const spaces = [];
      for (let j = 0; j < 5; j++) {
        bars.push(runs[pos++].width);
        spaces.push(runs[pos++].width);
      }
      const d1 = decode5Elements(bars);
      const d2 = decode5Elements(spaces);
      if (d1 === -1 || d2 === -1) { valid = false; break; }
      code += String(d1) + String(d2);
    }

    if (valid && code.length === 44) {
      // Valida se atende rigorosamente ao padrão FEBRABAN
      const check = validateBoletoCode(code);
      if (check && check.valid) {
        return code;
      }
    }
  }
  return null;
}
window.decodeItfRunLengths = decodeItfRunLengths;

function scanItfBarcodeFromCanvas(canvas) {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;

  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Varredura horizontal em múltiplas alturas
    const ySteps = [0.5, 0.7, 0.75, 0.8, 0.85, 0.65, 0.6, 0.55, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.9];
    for (const yp of ySteps) {
      const y = Math.floor(h * yp);
      const rowLum = new Uint8Array(w);
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
        rowLum[x] = lum;
        rowSum += lum;
      }
      const avgLum = rowSum / w;

      const thresholds = [avgLum, avgLum * 0.85, avgLum * 1.15];
      for (const thresh of thresholds) {
        const runs = [];
        let isBlack = rowLum[0] < thresh;
        let curW = 0;
        for (let x = 0; x < w; x++) {
          const pixBlack = rowLum[x] < thresh;
          if (pixBlack === isBlack) {
            curW++;
          } else {
            runs.push({ isBlack, width: curW });
            isBlack = pixBlack;
            curW = 1;
          }
        }
        runs.push({ isBlack, width: curW });

        const code = decodeItfRunLengths(runs);
        if (code) return code;
      }
    }

    // Se não achou na horizontal, testa verticalmente (caso o boleto esteja em pé ou girado 90 graus)
    const xSteps = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
    for (const xp of xSteps) {
      const x = Math.floor(w * xp);
      const colLum = new Uint8Array(h);
      let colSum = 0;
      for (let y = 0; y < h; y++) {
        const idx = (y * w + x) * 4;
        const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
        colLum[y] = lum;
        colSum += lum;
      }
      const avgLum = colSum / h;

      const runs = [];
      let isBlack = colLum[0] < avgLum;
      let curW = 0;
      for (let y = 0; y < h; y++) {
        const pixBlack = colLum[y] < avgLum;
        if (pixBlack === isBlack) {
          curW++;
        } else {
          runs.push({ isBlack, width: curW });
          isBlack = pixBlack;
          curW = 1;
        }
      }
      runs.push({ isBlack, width: curW });

      const code = decodeItfRunLengths(runs);
      if (code) return code;
    }
  } catch (err) {
    console.warn('Erro ao escanear canvas para ITF:', err);
  }

  return null;
}
window.scanItfBarcodeFromCanvas = scanItfBarcodeFromCanvas;

/* Câmera Leitora em Tempo Real (Live Scanner) */
let boletoScannerStream = null;
let boletoScannerAnimFrame = null;
let boletoScannerCurrentFacing = 'environment';
let boletoScannerTrack = null;
let boletoScannerTorchActive = false;
let lastScannerCheckTime = 0;

async function openBoletoLiveBarcodeScanner() {
  const modal = document.getElementById("modalBoletoLiveScanner");
  const video = document.getElementById("boletoLiveVideo");
  const torchBtn = document.getElementById("btnToggleScannerTorch");
  const helpMsg = document.getElementById("boletoScannerHelpMsg");
  const box = document.getElementById("boletoViewfinderBox");
  const fallbackBox = document.getElementById("boletoScannerFallbackActions");

  if (!modal || !video) {
    showToast("Componente de câmera não encontrado no DOM.", "error");
    return;
  }

  // Abre imediatamente o modal com classe .open para garantir opacidade 1 e interação ativa
  modal.classList.add("open");
  modal.style.display = "flex";

  if (fallbackBox) fallbackBox.style.display = "none";
  if (box) {
    box.style.display = "block";
    box.classList.remove("detected");
  }
  if (helpMsg) helpMsg.textContent = "Iniciando câmera...";

  const hasGetUserMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');

  if (!hasGetUserMedia) {
    console.warn("Navegador sem suporte a getUserMedia ou executando em contexto não seguro (HTTP).");
    if (helpMsg) {
      helpMsg.innerHTML = '<span style="color:#f59e0b">Câmera ao vivo requer HTTPS. Use os botões abaixo:</span>';
    }
    if (fallbackBox) {
      fallbackBox.style.display = "flex";
    }
    showToast("Câmera ao vivo requer HTTPS. Você pode tirar uma foto com a câmera do celular!", "warning", 5000);
    return;
  }

  try {
    if (boletoScannerStream) {
      boletoScannerStream.getTracks().forEach(t => t.stop());
      boletoScannerStream = null;
    }

    // Configuração do vídeo para compatibilidade máxima com iOS Safari e Android
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    // Tentativas progressivas de constraints
    const constraintCandidates = [
      {
        video: {
          facingMode: { ideal: boletoScannerCurrentFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      },
      {
        video: { facingMode: { ideal: boletoScannerCurrentFacing } },
        audio: false
      },
      {
        video: { facingMode: boletoScannerCurrentFacing },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    let stream = null;
    let lastError = null;
    for (const c of constraintCandidates) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        if (stream) break;
      } catch (err) {
        lastError = err;
        console.warn("Tentativa de constraints falhou:", c, err);
      }
    }

    if (!stream) {
      throw lastError || new Error("Não foi possível acessar a câmera do dispositivo.");
    }

    boletoScannerStream = stream;
    video.srcObject = boletoScannerStream;

    // Aguarda metadados no iOS Safari antes de reproduzir
    await new Promise((resolve) => {
      if (video.readyState >= 2) {
        resolve();
      } else {
        const onLoaded = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          resolve();
        };
        video.addEventListener('loadedmetadata', onLoaded);
        setTimeout(resolve, 800);
      }
    });

    try {
      await video.play();
    } catch (playErr) {
      console.warn("video.play inicial falhou, tentando novamente mutado:", playErr);
      video.muted = true;
      await video.play().catch(e => console.warn("Retry de play falhou:", e));
    }

    const tracks = boletoScannerStream.getVideoTracks();
    if (tracks && tracks.length > 0) {
      boletoScannerTrack = tracks[0];
      const caps = typeof boletoScannerTrack.getCapabilities === 'function' ? boletoScannerTrack.getCapabilities() : {};
      if (caps && caps.torch && torchBtn) {
        torchBtn.style.display = "inline-flex";
      } else if (torchBtn) {
        torchBtn.style.display = "none";
      }
    }

    if (helpMsg) helpMsg.textContent = "Aponte a mira para o Código de Barras do boleto";
    startBoletoScannerLoop();

  } catch (err) {
    console.error("Erro ao iniciar câmera para leitura de boleto:", err);
    if (helpMsg) {
      helpMsg.innerHTML = '<span style="color:#ef4444">Permissão negada ou câmera ocupada.</span>';
    }
    if (fallbackBox) {
      fallbackBox.style.display = "flex";
    }
    showToast("Não foi possível acessar a câmera ao vivo. Use as opções abaixo para fotografar.", "warning", 5000);
  }
}
window.openBoletoLiveBarcodeScanner = openBoletoLiveBarcodeScanner;

function closeBoletoLiveBarcodeScanner() {
  const modal = document.getElementById("modalBoletoLiveScanner");
  const video = document.getElementById("boletoLiveVideo");
  const fallbackBox = document.getElementById("boletoScannerFallbackActions");
  const torchBtn = document.getElementById("btnToggleScannerTorch");

  if (modal) {
    modal.classList.remove("open");
    modal.style.display = "none";
  }

  if (fallbackBox) {
    fallbackBox.style.display = "none";
  }

  if (torchBtn) {
    torchBtn.textContent = "Lanterna";
    torchBtn.style.display = "none";
  }

  if (boletoScannerAnimFrame) {
    cancelAnimationFrame(boletoScannerAnimFrame);
    boletoScannerAnimFrame = null;
  }

  if (boletoScannerStream) {
    boletoScannerStream.getTracks().forEach(t => t.stop());
    boletoScannerStream = null;
  }
  if (video) video.srcObject = null;
  boletoScannerTrack = null;
  boletoScannerTorchActive = false;
}
window.closeBoletoLiveBarcodeScanner = closeBoletoLiveBarcodeScanner;

function triggerBoletoCameraCapture(type) {
  const inputId = type === 'completa' ? 'boletoCameraInput' : 'boletoLinhaDigitavelInput';
  const inp = document.getElementById(inputId);
  if (inp) {
    inp.click();
  }
}
window.triggerBoletoCameraCapture = triggerBoletoCameraCapture;

async function switchBoletoScannerCamera() {
  boletoScannerCurrentFacing = boletoScannerCurrentFacing === 'environment' ? 'user' : 'environment';
  await openBoletoLiveBarcodeScanner();
}
window.switchBoletoScannerCamera = switchBoletoScannerCamera;

async function toggleBoletoScannerTorch() {
  if (!boletoScannerTrack) return;
  try {
    boletoScannerTorchActive = !boletoScannerTorchActive;
    await boletoScannerTrack.applyConstraints({
      advanced: [{ torch: boletoScannerTorchActive }]
    });
    const btn = document.getElementById("btnToggleScannerTorch");
    if (btn) btn.textContent = boletoScannerTorchActive ? "Desligar Luz" : "Lanterna";
  } catch (err) {
    console.warn("Lanterna não suportada:", err);
  }
}
window.toggleBoletoScannerTorch = toggleBoletoScannerTorch;

function startBoletoScannerLoop() {
  const video = document.getElementById("boletoLiveVideo");
  const canvas = document.getElementById("boletoLiveCanvas");
  const box = document.getElementById("boletoViewfinderBox");
  const helpMsg = document.getElementById("boletoScannerHelpMsg");
  if (!video || !canvas) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const scanFrame = async () => {
    if (!boletoScannerStream || video.paused || video.ended) return;

    const now = Date.now();
    if (now - lastScannerCheckTime >= 85 && video.videoWidth > 0 && video.videoHeight > 0) {
      lastScannerCheckTime = now;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cropW = Math.min(vw, 1200);
      const cropH = Math.round(cropW * 0.45);
      const cropX = Math.round((vw - cropW) / 2);
      const cropY = Math.round((vh - cropH) / 2);

      canvas.width = cropW;
      canvas.height = cropH;
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      let foundCode = null;

      // 1. Tenta decodificador direto ITF
      foundCode = scanItfBarcodeFromCanvas(canvas);

      // 2. Tenta BarcodeDetector nativo se o dispositivo suportar
      if (!foundCode && typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const det = new window.BarcodeDetector({ formats: ['itf', 'code_128', 'qr_code'] });
          const bcs = await det.detect(canvas);
          if (bcs && bcs.length > 0) {
            foundCode = bcs[0].rawValue;
          }
        } catch (e) {}
      }

      if (foundCode) {
        const decoded = decodeFebrabanBoleto(foundCode);
        if (decoded && (decoded.code || decoded.amount)) {
          if (box) box.classList.add("detected");
          if (helpMsg) helpMsg.textContent = "✓ Código identificado! Carregando boleto...";

          if (navigator.vibrate) {
            try { navigator.vibrate([100, 50, 100]); } catch(e) {}
          }

          setTimeout(() => {
            closeBoletoLiveBarcodeScanner();
            openNewBoletoModal({
              beneficiary: decoded.beneficiary || "",
              code: decoded.formattedCode || decoded.code || foundCode,
              dueDate: decoded.dueDate || getLocalDateStr(),
              amount: decoded.amount || "",
              category: "loja"
            });
            showToast("Código de barras lido com sucesso! R$ " + (decoded.amount || "0,00"), "success", 4500);
          }, 450);
          return;
        }
      }
    }

    boletoScannerAnimFrame = requestAnimationFrame(scanFrame);
  };

  boletoScannerAnimFrame = requestAnimationFrame(scanFrame);
}

/* Fallback de OCR via API Cloud Online Segura (/api/ocr) */
async function callOcrSpaceApi(base64DataUrl, customKey) {
  try {
    const networkFn = window['fetch'];
    if (typeof networkFn !== 'function') return null;

    // 1. Tenta endpoint seguro serverless da própria aplicação
    try {
      const response = await networkFn('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Image: base64DataUrl })
      });
      if (response.ok) {
        const json = await response.json();
        if (json && json.parsedText) {
          return json.parsedText;
        }
      }
    } catch (apiErr) {
      // Endpoint serverless indisponível ou offline; prossegue para fallback local
    }

    // 2. Se houver chave explicitamente configurada pelo usuário nas configurações
    const userApiKey = customKey || (appData.settings && appData.settings.ocrApiKey);
    if (userApiKey) {
      const formData = new FormData();
      formData.append('base64Image', base64DataUrl);
      formData.append('language', 'por');
      formData.append('isTable', 'true');
      formData.append('scale', 'true');
      formData.append('OCREngine', '2');

      const response = await networkFn('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { 'apikey': userApiKey },
        body: formData
      });
      if (response.ok) {
        const json = await response.json();
        if (json && json.ParsedResults && json.ParsedResults.length > 0) {
          return json.ParsedResults[0].ParsedText || "";
        }
      }
    }
  } catch (err) {
    console.warn('Fallback de OCR em nuvem indisponível ou offline:', err);
  }
  return null;
}
window.callOcrSpaceApi = callOcrSpaceApi;

/* Modal de Pagamento: Linha Digitável e Detalhes do Boleto */
function openBoletoPayModal(id) {
  const b = (appData.boletos || []).find(item => String(item.id) === String(id));
  if (!b) return;

  const modal = document.getElementById("modalBoletoPay");
  const body = document.getElementById("modalBoletoPayBody");
  const footerActions = document.getElementById("modalBoletoPayFooterActions");
  if (!modal || !body) return;

  const isPaid = b.status === 'paid';
  const valFormatted = formatCurrency(parseFloat(b.amount) || 0);

  const parts = (b.dueDate || '').split('-');
  const formattedDueDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : b.dueDate;

  const hasCode = !!(b.code && b.code.trim().length >= 20);

  let barcodeSvg = '';
  let qrcodeSvg = '';

  if (hasCode) {
    const barcode44 = b.barcode || linhaDigitavelToCodigoBarras(b.code);
    barcodeSvg = generateItfBarcodeSvg(barcode44 || b.code, 75);
    qrcodeSvg = generateQRCodeSvg(barcode44 || b.code, 4, 8);
  } else {
    const refText = `Boleto: ${b.beneficiary} | NF: ${b.nf || 'S/N'} | Valor: ${valFormatted} | Venc: ${formattedDueDate}`;
    qrcodeSvg = generateQRCodeSvg(refText, 4, 8);
  }

  let html = `
    <div style="background: rgba(13, 22, 38, 0.6); border: 1px solid var(--border-gold); border-radius: var(--radius-sm); padding: 1rem 1.25rem; margin-bottom: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <div style="font-size: 0.78rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Beneficiário / Concessionária</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #ffffff;">${escapeHtml(b.beneficiary || 'Beneficiário não identificado')}</div>
          ${b.bankName ? `<div style="font-size: 0.8rem; color: var(--primary-gold); margin-top: 0.2rem;">Banco Emissor: <strong>${escapeHtml(b.bankName)}</strong></div>` : ''}
          ${b.nf ? `<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">Nota Fiscal: <strong>${b.nf}</strong> • Parcela: <strong>${b.installment || '1'}</strong></div>` : ''}
        </div>
        <div style="text-align: right;">
          <div style="font-size: 0.78rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Valor a Pagar</div>
          <div style="font-size: 1.4rem; font-weight: 900; color: var(--primary-gold);">${valFormatted}</div>
          <div style="font-size: 0.8rem; color: var(--text-light); margin-top: 0.2rem;">Vencimento: <strong>${formattedDueDate}</strong></div>
        </div>
      </div>
    </div>
  `;

  if (hasCode) {
    html += `
      <!-- Ação Principal: Copiar Linha Digitável para Internet Banking -->
      <div style="margin-bottom: 1.15rem;">
        <button type="button" class="btn-copy-linha-hero" onclick="copyBoletoLinhaDigitavel('${b.id}', this)" title="Copiar Linha Digitável para pagar no internet banking do seu banco">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copiar Linha Digitável (Para Pagar no Banco)</span>
        </button>
      </div>

      <div style="margin-bottom: 1.25rem;">
        <label class="form-label" style="font-size: 0.82rem; color: var(--primary-gold); margin-bottom: 0.4rem;">
          Linha Digitável FEBRABAN:
        </label>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <input type="text" readonly value="${escapeHtml(b.code)}" class="form-input" style="font-family: monospace; font-size: 0.82rem; background: rgba(0,0,0,0.5);" id="modalPayBoletoCodeInput">
          <button type="button" class="btn btn-secondary btn-sm" onclick="copyBoletoLinhaDigitavel('${b.id}', this)" style="white-space: nowrap; padding: 0.6rem 0.85rem;">
            Copiar
          </button>
        </div>
      </div>

      <!-- Código de Barras Visual FEBRABAN -->
      <div style="margin-bottom: 1.25rem;">
        <label class="form-label" style="font-size: 0.82rem; color: var(--text-light); margin-bottom: 0.35rem;">
          Código de Barras FEBRABAN (Leitura na Tela):
        </label>
        <div class="barcode-preview-box">
          ${barcodeSvg}
        </div>
      </div>

      <!-- QR Code de Referência Contábil (Sem simulação indevida de pagamento) -->
      <div style="text-align: center; margin-bottom: 1rem;">
        <label class="form-label" style="font-size: 0.82rem; color: var(--text-dim); margin-bottom: 0.35rem; display: block;">
          Código de Referência Rápida:
        </label>
        <div class="qrcode-preview-box">
          ${qrcodeSvg}
        </div>
        <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.25rem;">
          Para pagar este boleto, copie a linha digitável acima e cole no aplicativo do seu internet banking.
        </div>
      </div>
    `;
  } else {
    html += `
      <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: var(--radius-sm); padding: 0.9rem 1.15rem; margin-bottom: 1.25rem;">
        <div style="font-size: 0.85rem; font-weight: 700; color: #fbbf24; margin-bottom: 0.35rem;">
          Duplicata Contábil (Contas a Pagar)
        </div>
        <div style="font-size: 0.8rem; color: var(--text-light); line-height: 1.45;">
          Esta duplicata foi lançada sem a linha digitável. Para pagar via internet banking, fotografe o boleto ou informe a <strong>linha digitável validada</strong>.
        </div>
      </div>

      <div style="margin-bottom: 1.25rem;">
        <label class="form-label">Adicionar Linha Digitável do Boleto:</label>
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input type="text" id="modalAttachBoletoCodeInput" class="form-input" placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000" style="font-family: monospace; font-size: 0.82rem;">
          <button type="button" class="btn btn-gold btn-sm" onclick="saveBoletoAttachedCodeDirect('${b.id}')" style="white-space: nowrap;">
            Salvar Código
          </button>
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
          <button type="button" class="btn btn-gold btn-sm" style="flex: 1; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;" onclick="triggerAttachPhotoLinhaDigitavel('${b.id}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <span>Fotografar Boleto / Linha Digitável</span>
          </button>
        </div>
      </div>
    `;
  }

  body.innerHTML = html;

  if (footerActions) {
    footerActions.innerHTML = `
      ${!hasCode ? `
        <label for="boletoCameraInput" class="btn btn-secondary btn-sm" style="cursor: pointer;" onclick="closeModal('modalBoletoPay');" title="Fotografar o boleto físico">
          Fotografar Boleto Completo
        </label>
      ` : ''}
      <button type="button" class="btn ${isPaid ? 'btn-secondary' : 'btn-whatsapp'} btn-sm" onclick="toggleBoletoPaidStatus('${b.id}'); closeModal('modalBoletoPay');">
        ${isPaid ? 'Reabrir Conta' : 'Confirmar Pagamento / Quitar'}
      </button>
    `;
  }

  openModal("modalBoletoPay");
}
window.openBoletoPayModal = openBoletoPayModal;

async function saveBoletoAttachedCodeDirect(id) {
  const input = document.getElementById("modalAttachBoletoCodeInput");
  const code = (input ? input.value : "").trim();
  if (!code) {
    showToast("Informe a linha digitável do boleto.", "warning");
    return;
  }

  const check = validateBoletoCode(code);
  if (!check.valid) {
    showToast("Código de barras / linha digitável inválido conforme FEBRABAN. Verifique os dígitos.", "warning", 5000);
    return;
  }
  
  const b = (appData.boletos || []).find(item => String(item.id) === String(id));
  if (!b) return;
  
  b.code = check.formattedDigitLine || check.digitLine;
  b.barcode = check.barcode;
  b.digitLine = check.digitLine;
  if (check.bankName) b.bankName = check.bankName;
  if (check.bankCode) b.bankCode = check.bankCode;
  if (check.amount && (!b.amount || b.amount === 0)) b.amount = parseFloat(check.amount);
  if (check.dueDate && !b.dueDate) b.dueDate = check.dueDate;

  if (!appData.settings) appData.settings = {};
  appData.settings.boletos = appData.boletos;

  await saveState({
    type: 'UPDATE_SETTINGS',
    payload: { key: 'boletos', value: appData.boletos }
  });

  showToast("Código validado e vinculado com sucesso!", "success");
  openBoletoPayModal(id);
  renderBoletosAgenda();
}
window.saveBoletoAttachedCodeDirect = saveBoletoAttachedCodeDirect;

function exportBoletosBackupJSON() {
  const boletos = appData.boletos || [];
  const jsonStr = JSON.stringify({
    exportedAt: new Date().toISOString(),
    system: "Eldorado Pesca • Gestão de Boletos",
    totalBoletos: boletos.length,
    boletos
  }, null, 2);

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_boletos_eldorado_${getLocalDateStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Backup JSON dos boletos baixado com sucesso!", "success");
}
window.exportBoletosBackupJSON = exportBoletosBackupJSON;

/* Preprocessamento de imagem em Canvas para iPhone / OCR */
function triggerBoletoUploadClick(e) {
  if (e.target.closest('button') || e.target.closest('label') || e.target.closest('input')) return;
  const cam = document.getElementById("boletoCameraInput");
  if (cam) cam.click();
}
window.triggerBoletoUploadClick = triggerBoletoUploadClick;

async function processBoletoPdf(file) {
  const banner = document.getElementById("boletoOcrBanner");
  const statusText = document.getElementById("boletoOcrStatusText");
  const percentText = document.getElementById("boletoOcrPercentText");
  const progressBar = document.getElementById("boletoOcrProgressBar");

  try {
    if (banner) banner.style.display = "block";
    if (statusText) statusText.textContent = "Carregando motor PDF no navegador...";
    if (progressBar) progressBar.style.width = "20%";
    if (percentText) percentText.textContent = "20%";

    if (typeof window !== 'undefined' && window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';
    }

    const pdfjs = (typeof window !== 'undefined' && window.pdfjsLib) ? window.pdfjsLib : (typeof require === 'function' ? require('./pdf.min.js') : null);
    if (!pdfjs) {
      throw new Error("Biblioteca PDF.js não encontrada.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    if (statusText) statusText.textContent = `Lendo ${doc.numPages} página(s) do PDF...`;
    if (progressBar) progressBar.style.width = "40%";
    if (percentText) percentText.textContent = "40%";

    const textLines = [];
    let fullRawText = "";
    let firstPageCanvas = null;

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      
      const groups = {};
      content.items.forEach(it => {
        const y = Math.round(it.transform[5]);
        if (!groups[y]) groups[y] = [];
        groups[y].push({ x: it.transform[4], str: it.str });
      });
      const sortedY = Object.keys(groups).map(Number).sort((a,b) => b - a);
      sortedY.forEach(y => {
        const line = groups[y].sort((a,b) => a.x - b.x).map(it => it.str.trim()).filter(Boolean).join(' ');
        if (line) textLines.push(line);
      });
      fullRawText += " " + content.items.map(it => it.str).join(' ');

      if (p === 1) {
        try {
          const viewport = page.getViewport({ scale: 1.5 });
          const cvs = document.createElement('canvas');
          cvs.width = viewport.width;
          cvs.height = viewport.height;
          const ctx = cvs.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;
          firstPageCanvas = cvs;
          lastScannedBoletoDataUrl = cvs.toDataURL('image/jpeg', 0.85);
        } catch (cvsErr) {
          console.warn("Não foi possível renderizar miniatura da página 1 do PDF:", cvsErr);
        }
      }
    }

    if (progressBar) progressBar.style.width = "65%";
    if (percentText) percentText.textContent = "65%";
    if (statusText) statusText.textContent = "Identificando tipo do documento...";

    // Caso 1: Relatório de Contas a Pagar com múltiplas duplicatas (FastReport ou similar)
    const upperText = fullRawText.toUpperCase();
    const isReport = upperText.includes("RELATÓRIO DE CONTAS A PAGAR") ||
                     upperText.includes("DUPLICATA A PAGAR") ||
                     textLines.filter(l => /^[0-3]\d\/[0-1]\d\/202\d/.test(l)).length >= 2;

    if (isReport) {
      const parsed = parseFastReportPdfText(textLines);
      if (parsed && parsed.length > 0) {
        await saveParsedContasAPagar(parsed, "relatório PDF");
        if (progressBar) progressBar.style.width = "100%";
        if (percentText) percentText.textContent = "100%";
        if (statusText) statusText.textContent = "Relatório importado com sucesso!";
        setTimeout(() => { if (banner) banner.style.display = "none"; }, 1200);
        return;
      }
    }

    // Caso 2: Boleto individual de empresa única
    let decoded = decodeFebrabanBoleto(fullRawText);

    // Se o PDF for escaneado (sem texto selecionável) ou a linha digitável não foi encontrada no texto:
    if ((!decoded || !decoded.code) && firstPageCanvas) {
      if (statusText) statusText.textContent = "Lendo código de barras / linha digitável na imagem...";
      if (progressBar) progressBar.style.width = "75%";
      
      // Tentativa 1: BarcodeDetector nativo no canvas (ultra rápido)
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({ formats: ['itf', 'code_128', 'qr_code'] });
          const detectedBarcodes = await detector.detect(firstPageCanvas);
          if (detectedBarcodes && detectedBarcodes.length > 0) {
            const rawVal = detectedBarcodes[0].rawValue;
            const dec = decodeFebrabanBoleto(rawVal);
            if (dec && dec.code) decoded = dec;
          }
        } catch (bErr) {}
      }

      // Tentativa 2: Tesseract OCR no canvas
      if (!decoded || !decoded.code) {
        try {
          const Tesseract = await loadTesseract();
          const workerRes = await Tesseract.recognize(firstPageCanvas, 'por');
          const ocrText = (workerRes && workerRes.data && workerRes.data.text) ? workerRes.data.text : "";
          const dec = decodeFebrabanBoleto(ocrText);
          if (dec && (dec.code || dec.amount)) decoded = dec;
        } catch (ocrErr) {
          console.warn("OCR no canvas do PDF:", ocrErr);
        }
      }
    }

    if (progressBar) progressBar.style.width = "100%";
    if (percentText) percentText.textContent = "100%";
    if (statusText) statusText.textContent = "Leitura do PDF concluída!";
    setTimeout(() => { if (banner) banner.style.display = "none"; }, 1200);

    // Abrir modal com os dados preenchidos
    openNewBoletoModal({
      beneficiary: (decoded && decoded.beneficiary) || file.name.replace(/\.pdf$/i, ''),
      code: (decoded && (decoded.formattedCode || decoded.code)) || '',
      dueDate: (decoded && decoded.dueDate) || getLocalDateStr(),
      amount: (decoded && decoded.amount) || '',
      category: 'loja'
    });

    showToast("PDF de boleto processado com sucesso! Confira e confirme os dados.", "success");

  } catch (err) {
    console.error("Erro ao processar PDF:", err);
    if (banner) banner.style.display = "none";
    showToast("Não foi possível ler o arquivo PDF. Você pode cadastrar manualmente.", "error");
    openNewBoletoModal();
  }
}
window.processBoletoPdf = processBoletoPdf;

function handleBoletoUnifiedFileInput(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    processBoletoPdf(file);
    e.target.value = "";
    return;
  }

  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || file.type.includes('html')) {
    const reader = new FileReader();
    reader.onload = (ev) => importFastReportHtml(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
    return;
  }

  if (lowerName.endsWith('.txt')) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split(/\r?\n/);
      parseAndImportFastReportTextLines(lines, 'arquivo texto');
    };
    reader.readAsText(file);
    e.target.value = "";
    return;
  }

  processBoletoImage(file);
  e.target.value = "";
}
window.handleBoletoUnifiedFileInput = handleBoletoUnifiedFileInput;

async function handleLinhaDigitavelPhotoInput(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const targetBoletoId = activeBoletoAttachId;
  activeBoletoAttachId = null;

  const banner = document.getElementById("boletoOcrBanner");
  const statusText = document.getElementById("boletoOcrStatusText");
  const percentText = document.getElementById("boletoOcrPercentText");
  const progressBar = document.getElementById("boletoOcrProgressBar");

  try {
    if (banner) banner.style.display = "block";
    const updateProgress = (text, pct) => {
      if (statusText) statusText.textContent = text;
      if (percentText) percentText.textContent = pct + "%";
      if (progressBar) progressBar.style.width = pct + "%";
    };

    const parsed = await scanBoletoFromImagePipeline(file, updateProgress);

    setTimeout(() => { if (banner) banner.style.display = "none"; }, 1000);

    if (targetBoletoId) {
      const b = (appData.boletos || []).find(item => String(item.id) === String(targetBoletoId));
      if (b) {
        if (parsed.validatedCode && parsed.validatedCode.valid) {
          b.code = parsed.code;
          b.barcode = parsed.barcode;
          b.digitLine = parsed.digitLine;
          if (parsed.bankName) b.bankName = parsed.bankName;
          if (parsed.bankCode) b.bankCode = parsed.bankCode;
          if (parsed.dueDate && !b.dueDate) b.dueDate = parsed.dueDate;
          if (parsed.amount && (!b.amount || b.amount === 0)) b.amount = parseFloat(parsed.amount);
          b.extractionConfidence = parsed.confidence || 'high';

          if (!appData.settings) appData.settings = {};
          appData.settings.boletos = appData.boletos;
          await saveState({
            type: 'UPDATE_SETTINGS',
            payload: { key: 'boletos', value: appData.boletos }
          });

          showToast(`Linha digitável vinculada com sucesso a ${b.beneficiary}!`, "success", 4500);
          renderBoletosAgenda();
          openBoletoPayModal(b.id);
          e.target.value = "";
          return;
        } else {
          showToast("Não foi possível identificar o código de barras com segurança. Tente tirar outra foto.", "warning", 5000);
          openBoletoPayModal(b.id);
          e.target.value = "";
          return;
        }
      }
    }

    if (parsed.validatedCode && parsed.validatedCode.valid) {
      openNewBoletoModal({
        beneficiary: parsed.beneficiary || "",
        beneficiaryDocument: parsed.beneficiaryDocument || "",
        bankName: parsed.bankName || "",
        bankCode: parsed.bankCode || "",
        code: parsed.code || "",
        barcode: parsed.barcode || "",
        digitLine: parsed.digitLine || "",
        dueDate: parsed.dueDate || getLocalDateStr(),
        amount: parsed.amount || "",
        category: "loja",
        extractionConfidence: parsed.confidence || 'medium'
      });
      showToast(parsed.amount ? `Boleto identificado! Valor: R$ ${parsed.amount}` : "Linha digitável identificada! Confira os dados.", "success");
    } else {
      showToast("Não foi possível identificar o código de barras com segurança. Tente tirar outra foto.", "warning", 5000);
      openNewBoletoModal({
        beneficiary: parsed.beneficiary || "",
        beneficiaryDocument: parsed.beneficiaryDocument || "",
        dueDate: parsed.dueDate || getLocalDateStr(),
        amount: parsed.amount || "",
        category: "loja",
        extractionConfidence: "low"
      });
    }

  } catch (err) {
    console.error("Erro ao fotografar linha digitável:", err);
    if (banner) banner.style.display = "none";
    showToast("Erro ao processar imagem. Você pode cadastrar manualmente.", "error");
    openNewBoletoModal();
  }

  e.target.value = "";
}
window.handleLinhaDigitavelPhotoInput = handleLinhaDigitavelPhotoInput;

function handleBoletoFileInput(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
    processBoletoPdf(file);
    e.target.value = "";
    return;
  }

  if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || file.type.includes('html')) {
    const reader = new FileReader();
    reader.onload = (ev) => importFastReportHtml(ev.target.result);
    reader.readAsText(file);
    e.target.value = "";
    return;
  }
  processBoletoImage(file);
  e.target.value = "";
}
window.handleBoletoFileInput = handleBoletoFileInput;

function handleBoletoDragOver(e) {
  e.preventDefault();
  const dz = document.getElementById("boletosDropzone");
  if (dz) dz.classList.add("drag-over");
}
window.handleBoletoDragOver = handleBoletoDragOver;

function handleBoletoDragLeave(e) {
  const dz = document.getElementById("boletosDropzone");
  if (dz) dz.classList.remove("drag-over");
}
window.handleBoletoDragLeave = handleBoletoDragLeave;

function handleBoletoDrop(e) {
  e.preventDefault();
  const dz = document.getElementById("boletosDropzone");
  if (dz) dz.classList.remove("drag-over");
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.pdf') || file.type === 'application/pdf') {
      processBoletoPdf(file);
      return;
    }

    if (lowerName.endsWith('.html') || lowerName.endsWith('.htm') || file.type.includes('html')) {
      const reader = new FileReader();
      reader.onload = (ev) => importFastReportHtml(ev.target.result);
      reader.readAsText(file);
      return;
    }
    processBoletoImage(file);
  }
}
window.handleBoletoDrop = handleBoletoDrop;

// Suporte a colar foto da área de transferência (Ctrl+V)
window.addEventListener('paste', (e) => {
  if (activeTab !== 'tab-boletos') return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile();
      if (file) {
        processBoletoImage(file);
        break;
      }
    }
  }
});

function preprocessImageForCanvas(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionamento inteligente para não estourar memória no Safari iOS (max 1600px)
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        // 1. Canvas Original
        const cvsOriginal = document.createElement('canvas');
        cvsOriginal.width = width;
        cvsOriginal.height = height;
        const ctxOrig = cvsOriginal.getContext('2d');
        ctxOrig.drawImage(img, 0, 0, width, height);

        // 2. Canvas em Tons de Cinza e Alto Contraste (ideal para barras pretas e OCR)
        const cvsGrayscale = document.createElement('canvas');
        cvsGrayscale.width = width;
        cvsGrayscale.height = height;
        const ctxGray = cvsGrayscale.getContext('2d');
        ctxGray.drawImage(img, 0, 0, width, height);
        try {
          const imgData = ctxGray.getImageData(0, 0, width, height);
          const d = imgData.data;
          const contrast = 1.45;
          const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
          for (let i = 0; i < d.length; i += 4) {
            const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const val = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
            d[i] = val;
            d[i + 1] = val;
            d[i + 2] = val;
          }
          ctxGray.putImageData(imgData, 0, 0);
        } catch (err) {
          console.warn('Processamento de pixels em canvas ignorado:', err);
        }

        // 3. Canvas Binarizado (Threshold adaptativo)
        const cvsBinarized = document.createElement('canvas');
        cvsBinarized.width = width;
        cvsBinarized.height = height;
        const ctxBin = cvsBinarized.getContext('2d');
        ctxBin.drawImage(cvsGrayscale, 0, 0);
        try {
          const imgData = ctxBin.getImageData(0, 0, width, height);
          const d = imgData.data;
          let sumLum = 0;
          for (let i = 0; i < d.length; i += 4) {
            sumLum += d[i];
          }
          const avgLum = (sumLum / (d.length / 4)) * 0.90;
          for (let i = 0; i < d.length; i += 4) {
            const bin = d[i] < avgLum ? 0 : 255;
            d[i] = bin;
            d[i + 1] = bin;
            d[i + 2] = bin;
          }
          ctxBin.putImageData(imgData, 0, 0);
        } catch (err) {
          console.warn('Filtro binarizado ignorado:', err);
        }

        // 4. Canvas com ROI Inferior (Bottom 42% onde reside o código FEBRABAN)
        const roiY = Math.floor(height * 0.56);
        const roiHeight = height - roiY;
        const cvsRoi = document.createElement('canvas');
        cvsRoi.width = width;
        cvsRoi.height = roiHeight;
        const ctxRoi = cvsRoi.getContext('2d');
        ctxRoi.drawImage(cvsGrayscale, 0, roiY, width, roiHeight, 0, 0, width, roiHeight);

        const dataUrl = cvsGrayscale.toDataURL('image/jpeg', 0.88);
        const variants = [
          { label: 'roi_inferior', canvas: cvsRoi },
          { label: 'alto_contraste', canvas: cvsGrayscale },
          { label: 'binarizada', canvas: cvsBinarized },
          { label: 'original', canvas: cvsOriginal }
        ];

        resolve({
          canvas: cvsGrayscale,
          dataUrl,
          width,
          height,
          variants,
          originalCanvas: cvsOriginal
        });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
window.preprocessImageForCanvas = preprocessImageForCanvas;

let tesseractLoaderPromise = null;
function loadTesseract() {
  if (typeof window !== 'undefined' && window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }
  if (tesseractLoaderPromise) return tesseractLoaderPromise;
  tesseractLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => {
      resolve(window.Tesseract);
    };
    script.onerror = () => {
      tesseractLoaderPromise = null;
      reject(new Error('Falha ao carregar Tesseract.js (sem internet ou CDN bloqueada).'));
    };
    document.head.appendChild(script);
  });
  return tesseractLoaderPromise;
}

/* Extração Inteligente de Beneficiário do Documento */
function extractBeneficiaryFromText(rawText) {
  if (!rawText) return { beneficiary: '', document: '' };
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let beneficiary = '';
  let document = '';

  // 1. Procura por CNPJ / CPF do beneficiário no documento
  const cnpjMatch = rawText.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/) || rawText.match(/\b\d{14}\b/);
  const cpfMatch = rawText.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
  if (cnpjMatch) document = cnpjMatch[0];
  else if (cpfMatch) document = cpfMatch[0];

  // 2. Busca por âncoras explícitas de beneficiário / cedente
  const anchorRegex = /(?:benefici[aá]rio(?:\s*final)?|cedente|raz[aã]o\s*social|nome\s*do\s*benefici[aá]rio)[:\s]+([^\r\n]{3,65})/i;
  for (const line of lines) {
    const m = line.match(anchorRegex);
    if (m) {
      let candidate = m[1].trim();
      // Remove sufixos como CNPJ, CPF, Agência, etc. da mesma linha
      candidate = candidate.replace(/(?:cnpj|cpf|ag[eê]ncia|conta|c[oó]digo)[\s\/:].*$/i, '').trim();
      candidate = candidate.replace(/^[\s\-–—:;,\.]+|[\s\-–—:;,\.]+$/g, '');
      if (candidate.length >= 3 && !/^(?:banco|pagador|sacado|ag[eê]ncia|data|vencimento|valor)/i.test(candidate)) {
        beneficiary = candidate;
        break;
      }
    }
  }

  // 3. Concessionárias evidentes de serviços públicos (energia/água)
  if (!beneficiary) {
    const lower = rawText.toLowerCase();
    if (lower.includes('copel') && (lower.includes('energia') || lower.includes('distribui') || lower.includes('eletric'))) {
      beneficiary = 'Copel Energia';
    } else if (lower.includes('sanepar') && (lower.includes('agua') || lower.includes('saneamento'))) {
      beneficiary = 'Sanepar Água';
    }
  }

  // 4. REGRA DE OURO: Banco emissor NUNCA vira beneficiário
  return { beneficiary, document };
}
window.extractBeneficiaryFromText = extractBeneficiaryFromText;

function decodeFebrabanBoleto(rawText) {
  const result = {
    valid: false,
    code: '',
    formattedCode: '',
    barcode: '',
    digitLine: '',
    dueDate: '',
    amount: '',
    beneficiary: '',
    beneficiaryDocument: '',
    bankName: '',
    bankCode: '',
    confidence: 'low'
  };

  if (!rawText) return result;

  const bankDictionary = {
    '001': 'Banco do Brasil',
    '033': 'Santander',
    '104': 'Caixa Econômica Federal',
    '237': 'Bradesco',
    '341': 'Itaú Unibanco',
    '748': 'Sicredi',
    '756': 'Sicoob',
    '260': 'Nubank',
    '077': 'Banco Inter',
    '212': 'Banco Original',
    '041': 'Banrisul',
    '422': 'Banco Safra',
    '655': 'Banco Votorantim',
    '336': 'Banco C6',
    '290': 'PagBank',
    '380': 'PicPay'
  };

  const getBankName = (code) => {
    if (typeof FEBRABAN_BANK_NAMES !== 'undefined' && FEBRABAN_BANK_NAMES[code]) {
      return FEBRABAN_BANK_NAMES[code];
    }
    return bankDictionary[code] || ('Banco ' + code);
  };

  const parseFactorDate = (factor) => {
    if (typeof calcFactorDueDate === 'function') {
      return calcFactorDueDate(factor);
    }
    const f = parseInt(factor, 10);
    if (isNaN(f) || f < 1000) return '';
    let dt = null;
    if (f < 3000) {
      const base2025 = new Date(2025, 1, 22);
      dt = new Date(base2025.getTime() + (f - 1000) * 86400000);
    } else {
      const base1997 = new Date(1997, 9, 7);
      dt = new Date(base1997.getTime() + f * 86400000);
    }
    if (!dt || isNaN(dt.getTime())) return '';
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Resolvedor autônomo de validação
  const validateFn = (typeof validateBoletoCode === 'function')
    ? validateBoletoCode
    : (typeof globalThis !== 'undefined' && typeof globalThis.validateBoletoCode === 'function')
      ? globalThis.validateBoletoCode
      : null;

  const trimmed = String(rawText).trim();
  const directDigits = trimmed.replace(/\D/g, '');

  // 1. Entrada direta de 44 dígitos (Código de Barras)
  if (directDigits.length === 44) {
    if (validateFn) {
      const check = validateFn(directDigits);
      if (check && check.valid) {
        result.valid = true;
        result.code = check.digitLine || check.barcode;
        result.formattedCode = check.formattedDigitLine || check.formattedBarcode;
        result.barcode = check.barcode;
        result.digitLine = check.digitLine;
        result.bankName = check.bankName || '';
        result.bankCode = check.bankCode || '';
        result.dueDate = check.dueDate || '';
        result.amount = check.amount || '';
        result.confidence = 'high';
        return result;
      }
    } else {
      const bankCode = directDigits.slice(0, 3);
      result.bankCode = bankCode;
      result.bankName = getBankName(bankCode);
      const factor = parseInt(directDigits.slice(5, 9), 10);
      result.dueDate = parseFactorDate(factor);
      const valCentavos = parseInt(directDigits.slice(9, 19), 10);
      if (valCentavos > 0) result.amount = (valCentavos / 100).toFixed(2);
      result.barcode = directDigits;
      result.code = directDigits;
    }
  }

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // 2. Procura bloco estruturado de 5 grupos (47 dígitos bancários)
  // Formato FEBRABAN: 00190.00009 01881.000002 00000.000003 1 98150000147596
  const block5Regex = /(\d{5})[.\s-]*(\d{5})\s+(\d{5})[.\s-]*(\d{6})\s+(\d{5})[.\s-]*(\d{6})\s+(\d)\s+(\d{14})/;
  for (const line of lines) {
    const cleanLine = line
      .replace(/[oO]/g, '0')
      .replace(/[lI\|]/g, '1')
      .replace(/[sS]/g, '5')
      .replace(/[bB]/g, '8')
      .replace(/[zZ]/g, '2');

    const m = cleanLine.match(block5Regex);
    if (m) {
      const candidateDigits = m[1] + m[2] + m[3] + m[4] + m[5] + m[6] + m[7] + m[8];
      const check = validateFn ? validateFn(candidateDigits, { allowDvGeralMismatch: true }) : null;
      if (check && check.valid) {
        result.valid = true;
        result.code = candidateDigits;
        result.formattedCode = m[1] + '.' + m[2] + ' ' + m[3] + '.' + m[4] + ' ' + m[5] + '.' + m[6] + ' ' + m[7] + ' ' + m[8];
        result.barcode = check.barcode;
        result.digitLine = candidateDigits;
        result.bankName = check.bankName || '';
        result.bankCode = check.bankCode || '';
        result.dueDate = check.dueDate || '';
        result.amount = check.amount || '';
        result.confidence = check.confidence || 'medium';
        break;
      } else if (!validateFn) {
        // Fallback autônomo sem validador em escopo isolado
        result.valid = true;
        result.code = candidateDigits;
        result.formattedCode = m[1] + '.' + m[2] + ' ' + m[3] + '.' + m[4] + ' ' + m[5] + '.' + m[6] + ' ' + m[7] + ' ' + m[8];
        const bankCode = m[1].slice(0, 3);
        result.bankCode = bankCode;
        result.bankName = getBankName(bankCode);
        const factor = parseInt(m[8].slice(0, 4), 10);
        result.dueDate = parseFactorDate(factor);
        const valCentavos = parseInt(m[8].slice(4, 14), 10);
        if (valCentavos > 0) result.amount = (valCentavos / 100).toFixed(2);
        break;
      }
    }
  }

  // 3. Procura bloco estruturado de 4 grupos (48 dígitos concessionárias)
  if (!result.code) {
    const block4Regex = /(\d{11})[.\s-]*(\d)\s+(\d{11})[.\s-]*(\d)\s+(\d{11})[.\s-]*(\d)\s+(\d{11})[.\s-]*(\d)/;
    for (const line of lines) {
      const cleanLine = line.replace(/[oO]/g, '0').replace(/[lI\|]/g, '1');
      const m = cleanLine.match(block4Regex);
      if (m) {
        const candidateDigits = m[1] + m[2] + m[3] + m[4] + m[5] + m[6] + m[7] + m[8];
        if (candidateDigits.startsWith('8')) {
          const check = validateFn ? validateFn(candidateDigits, { allowDvGeralMismatch: true }) : null;
          if (check && check.valid) {
            result.valid = true;
            result.code = candidateDigits;
            result.formattedCode = m[1] + '-' + m[2] + ' ' + m[3] + '-' + m[4] + ' ' + m[5] + '-' + m[6] + ' ' + m[7] + '-' + m[8];
            result.barcode = check.barcode;
            result.digitLine = candidateDigits;
            result.beneficiary = 'Concessionária / Tributo';
            result.amount = check.amount || '';
            result.confidence = check.confidence || 'medium';
            break;
          } else if (!validateFn) {
            result.valid = true;
            result.code = candidateDigits;
            result.formattedCode = m[1] + '-' + m[2] + ' ' + m[3] + '-' + m[4] + ' ' + m[5] + '-' + m[6] + ' ' + m[7] + '-' + m[8];
            result.digitLine = candidateDigits;
            result.beneficiary = 'Concessionária / Tributo';
            break;
          }
        }
      }
    }
  }

  // 4. Procura linha única isolada com 47 ou 48 dígitos
  if (!result.code) {
    for (const line of lines) {
      const d = line.replace(/[oO]/g, '0').replace(/[lI\|]/g, '1').replace(/\D/g, '');
      if (d.length === 47 || (d.length === 48 && d.startsWith('8'))) {
        const check = validateFn ? validateFn(d, { allowDvGeralMismatch: true }) : null;
        if (check && check.valid) {
          result.valid = true;
          result.code = check.digitLine || check.barcode;
          result.formattedCode = check.formattedDigitLine || check.formattedBarcode;
          result.barcode = check.barcode;
          result.digitLine = check.digitLine;
          result.bankName = check.bankName || '';
          result.bankCode = check.bankCode || '';
          result.dueDate = check.dueDate || '';
          result.amount = check.amount || '';
          result.confidence = check.confidence || 'medium';
          if (check.type === 'utility') result.beneficiary = 'Concessionária / Tributo';
          break;
        } else if (!validateFn && d.length === 47) {
          result.valid = true;
          result.code = d;
          const bankCode = d.slice(0, 3);
          result.bankCode = bankCode;
          result.bankName = getBankName(bankCode);
          const factor = parseInt(d.slice(33, 37), 10);
          result.dueDate = parseFactorDate(factor);
          const valCentavos = parseInt(d.slice(37, 47), 10);
          if (valCentavos > 0) result.amount = (valCentavos / 100).toFixed(2);
          break;
        }
      }
    }
  }

  // 5. Extração de Beneficiário do Documento
  if (typeof extractBeneficiaryFromText === 'function') {
    const benefData = extractBeneficiaryFromText(rawText);
    if (benefData.beneficiary && !result.beneficiary) {
      result.beneficiary = benefData.beneficiary;
    }
    if (benefData.document) {
      result.beneficiaryDocument = benefData.document;
    }
  }

  // 6. Reconhecimento de Fornecedores e Concessionárias Comuns
  if (!result.beneficiary) {
    const lower = rawText.toLowerCase();
    if (lower.includes('copel')) result.beneficiary = 'Copel Energia';
    else if (lower.includes('sanepar')) result.beneficiary = 'Sanepar Água';
    else if (lower.includes('joga')) result.beneficiary = 'Joga Indústria e Comércio';
    else if (lower.includes('kala')) result.beneficiary = 'Kala Comércio e Distribuição';
    else if (lower.includes('nakine')) result.beneficiary = 'Nakine Decorações';
    else if (lower.includes('ricardo pesca')) result.beneficiary = 'Ricardo Pesca';
    else if (lower.includes('maju')) result.beneficiary = 'Maju Dist. Mat. Elétricos';
    else if (lower.includes('starlink')) result.beneficiary = 'Starlink Internet';
    else if (lower.includes('claro')) result.beneficiary = 'Claro Telecom';
    else if (lower.includes('vivo') || lower.includes('telefonica')) result.beneficiary = 'Vivo Telefônica';
    else if (lower.includes('steelfish')) result.beneficiary = 'Steelfish';
    else if (lower.includes('mathias')) result.beneficiary = 'Iscas Mathias';
    else if (lower.includes('titan')) result.beneficiary = 'Titan Caiaques';
  }

  // 7. Data de Vencimento Visual (fallback para documentos puramente visuais)
  if (!result.dueDate) {
    const dateMatch = rawText.match(/(?:vencimento|venc|pagar\s*at[eé])[:\s]*([0-3]?\d)[\/\.-]([0-1]?\d)[\/\.-](202\d)/i) ||
                      rawText.match(/\b([0-3]\d)[\/\.-]([0-1]\d)[\/\.-](202\d)\b/);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      const year = dateMatch[3];
      result.dueDate = `${year}-${month}-${day}`;
    }
  }

  // 8. Valor Visual no texto (ignorando estritamente desconto, mora, multa, abatimento)
  if (!result.amount) {
    const valorRegex = /(?:valor(?:\s*(?:do\s*documento|cobrado|total|l[ií]quido|a\s*pagar))?|total\s*a\s*pagar)[:\s]+(?:R\$\s*)?([\d\.]+(?:,\d{2}))/i;
    for (const line of lines) {
      if (/desconto|abatimento|mora|multa|dedu[cç]/i.test(line)) continue;
      const vm = line.match(valorRegex) || line.match(/R\$\s*([\d\.]+(?:,\d{2}))/i);
      if (vm) {
        const parsed = parseFloat(vm[1].replace(/\./g, '').replace(',', '.'));
        if (parsed > 0) {
          result.amount = parsed.toFixed(2);
          break;
        }
      }
    }
  }

  return result;
}

function decodeBoletoCodeManually() {
  const codeVal = document.getElementById("bfCode").value;
  if (!codeVal) {
    showToast("Digite ou cole a linha digitável primeiro.", "warning");
    return;
  }
  const check = validateBoletoCode(codeVal, { allowDvGeralMismatch: true });
  if (!check.valid) {
    showToast("Código inválido conforme as normas FEBRABAN. Verifique os dígitos.", "warning", 4500);
    return;
  }
  if (check.formattedDigitLine) document.getElementById("bfCode").value = check.formattedDigitLine;
  if (check.dueDate) document.getElementById("bfDueDate").value = check.dueDate;
  if (check.amount) document.getElementById("bfAmount").value = check.amount;
  if (check.bankName) {
    const notesEl = document.getElementById("bfDescription");
    if (notesEl && !notesEl.value) notesEl.value = `Banco emissor: ${check.bankName}`;
  }
  showToast("Código FEBRABAN validado com sucesso!", "success");
}
window.decodeBoletoCodeManually = decodeBoletoCodeManually;
if (typeof window !== 'undefined') window.decodeFebrabanBoleto = decodeFebrabanBoleto;
if (typeof globalThis !== 'undefined') globalThis.decodeFebrabanBoleto = decodeFebrabanBoleto;

function onBoletoCodeInput(val) {
  const clean = String(val || '').replace(/\D/g, '');
  if (clean.length === 47 || clean.length === 48 || clean.length === 44) {
    const check = validateBoletoCode(clean, { allowDvGeralMismatch: true });
    if (check.valid) {
      if (check.dueDate && !document.getElementById("bfDueDate").value) {
        document.getElementById("bfDueDate").value = check.dueDate;
      }
      if (check.amount && !document.getElementById("bfAmount").value) {
        document.getElementById("bfAmount").value = check.amount;
      }
    }
  }
}
window.onBoletoCodeInput = onBoletoCodeInput;

/* Esteira Central de Leitura com Prioridade Rígida: Barcode -> Linha Digitável -> OCR */
async function scanBoletoFromImagePipeline(file, onProgress) {
  if (typeof onProgress === 'function') onProgress('Otimizando imagem no Canvas...', 20);
  const prep = await preprocessImageForCanvas(file);
  lastScannedBoletoDataUrl = prep.dataUrl;

  let validatedCode = null;
  let detectedConfidence = 'low';

  // 1. PRIORIDADE MÁXIMA: Leitura Real do Código de Barras
  if (typeof onProgress === 'function') onProgress('Buscando código de barras FEBRABAN...', 35);

  // A) BarcodeDetector nativo nos variants da imagem
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['itf', 'code_128'] });
      for (const v of prep.variants) {
        const barcodes = await detector.detect(v.canvas);
        if (barcodes && barcodes.length > 0) {
          for (const bc of barcodes) {
            const check = validateBoletoCode(bc.rawValue);
            if (check.valid) {
              validatedCode = check;
              detectedConfidence = 'high';
              break;
            }
          }
        }
        if (validatedCode) break;
      }
    } catch (bErr) {}
  }

  // B) Decodificador ITF Canvas se BarcodeDetector nativo não encontrou
  if (!validatedCode) {
    if (typeof onProgress === 'function') onProgress('Analisando linhas do código de barras...', 50);
    for (const v of prep.variants) {
      const itf = scanItfBarcodeFromCanvas(v.canvas);
      if (itf) {
        const check = validateBoletoCode(itf);
        if (check.valid) {
          validatedCode = check;
          detectedConfidence = 'high';
          break;
        }
      }
    }
  }

  // 2. SEGUNDA PRIORIDADE: Linha Digitável via OCR Estruturado na Região do Código
  let ocrFullText = '';
  if (!validatedCode) {
    if (typeof onProgress === 'function') onProgress('Lendo linha digitável via OCR...', 65);
    try {
      const Tesseract = await loadTesseract();
      const roiVariant = prep.variants.find(v => v.label === 'roi_inferior') || prep.variants[0];
      const workerRes = await Tesseract.recognize(roiVariant.canvas, 'por');
      const roiText = (workerRes && workerRes.data && workerRes.data.text) ? workerRes.data.text : '';

      const checkRoi = decodeFebrabanBoleto(roiText);
      if (checkRoi && checkRoi.valid) {
        validatedCode = checkRoi;
        detectedConfidence = 'medium';
      }
    } catch (ocrErr) {
      console.warn('OCR na região inferior falhou:', ocrErr);
    }
  }

  // 3. TERCEIRA PRIORIDADE: OCR no documento completo para dados visuais e fallback
  if (typeof onProgress === 'function') onProgress('Lendo dados do documento...', 80);
  try {
    const Tesseract = await loadTesseract();
    const workerRes = await Tesseract.recognize(prep.canvas, 'por');
    ocrFullText = (workerRes && workerRes.data && workerRes.data.text) ? workerRes.data.text : '';

    if (!validatedCode) {
      const fullCheck = decodeFebrabanBoleto(ocrFullText);
      if (fullCheck && fullCheck.valid) {
        validatedCode = fullCheck;
        detectedConfidence = 'medium';
      }
    }
  } catch (ocrErr) {}

  // 4. FALLBACK EM NUVEM SE NENHUM CÓDIGO VÁLIDO FOI OBTIDO LOCALMENTE
  if (!validatedCode) {
    if (typeof onProgress === 'function') onProgress('Consultando OCR seguro...', 90);
    try {
      const cloudText = await callOcrSpaceApi(prep.dataUrl);
      if (cloudText) {
        ocrFullText = (ocrFullText ? (ocrFullText + '\n') : '') + cloudText;
        const cloudDec = decodeFebrabanBoleto(cloudText);
        if (cloudDec && cloudDec.valid) {
          validatedCode = cloudDec;
          detectedConfidence = 'medium';
        }
      }
    } catch (cloudErr) {}
  }

  // 5. Extração de Dados Visuais (Beneficiário, CNPJ, etc.) a partir do texto OCR acumulado
  const visualData = extractBeneficiaryFromText(ocrFullText);
  let visualDueDate = '';
  let visualAmount = '';

  if (!validatedCode || !validatedCode.dueDate) {
    const dateMatch = ocrFullText.match(/(?:vencimento|venc|pagar\s*at[eé])[:\s]*([0-3]?\d)[\/\.-]([0-1]?\d)[\/\.-](202\d)/i) ||
                      ocrFullText.match(/\b([0-3]\d)[\/\.-]([0-1]\d)[\/\.-](202\d)\b/);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      const year = dateMatch[3];
      visualDueDate = `${year}-${month}-${day}`;
    }
  }

  if (!validatedCode || !validatedCode.amount) {
    const valorRegex = /(?:valor(?:\s*(?:do\s*documento|cobrado|total|l[ií]quido|a\s*pagar))?|total\s*a\s*pagar)[:\s]+(?:R\$\s*)?([\d\.]+(?:,\d{2}))/i;
    for (const line of ocrFullText.split(/\r?\n/)) {
      if (/desconto|abatimento|mora|multa|dedu[cç]/i.test(line)) continue;
      const vm = line.match(valorRegex) || line.match(/R\$\s*([\d\.]+(?:,\d{2}))/i);
      if (vm) {
        const parsed = parseFloat(vm[1].replace(/\./g, '').replace(',', '.'));
        if (parsed > 0) {
          visualAmount = parsed.toFixed(2);
          break;
        }
      }
    }
  }

  if (typeof onProgress === 'function') onProgress('Concluído!', 100);

  return {
    validatedCode,
    confidence: detectedConfidence,
    beneficiary: visualData.beneficiary || (validatedCode && validatedCode.beneficiary) || '',
    beneficiaryDocument: visualData.document || '',
    dueDate: (validatedCode && validatedCode.dueDate) || visualDueDate || '',
    amount: (validatedCode && validatedCode.amount) || visualAmount || '',
    bankName: (validatedCode && validatedCode.bankName) || '',
    bankCode: (validatedCode && validatedCode.bankCode) || '',
    code: (validatedCode && (validatedCode.formattedDigitLine || validatedCode.digitLine || validatedCode.code)) || '',
    barcode: (validatedCode && validatedCode.barcode) || '',
    digitLine: (validatedCode && validatedCode.digitLine) || '',
    rawOcrText: ocrFullText
  };
}
window.scanBoletoFromImagePipeline = scanBoletoFromImagePipeline;

async function processBoletoImage(file) {
  const banner = document.getElementById("boletoOcrBanner");
  const statusText = document.getElementById("boletoOcrStatusText");
  const percentText = document.getElementById("boletoOcrPercentText");
  const progressBar = document.getElementById("boletoOcrProgressBar");

  try {
    if (banner) banner.style.display = "block";
    const updateProgress = (text, pct) => {
      if (statusText) statusText.textContent = text;
      if (percentText) percentText.textContent = pct + "%";
      if (progressBar) progressBar.style.width = pct + "%";
    };

    const parsed = await scanBoletoFromImagePipeline(file, updateProgress);

    setTimeout(() => {
      if (banner) banner.style.display = "none";
    }, 1000);

    if (parsed.validatedCode && parsed.validatedCode.valid) {
      openNewBoletoModal({
        beneficiary: parsed.beneficiary || "",
        beneficiaryDocument: parsed.beneficiaryDocument || "",
        bankName: parsed.bankName || "",
        bankCode: parsed.bankCode || "",
        code: parsed.code || "",
        barcode: parsed.barcode || "",
        digitLine: parsed.digitLine || "",
        dueDate: parsed.dueDate || getLocalDateStr(),
        amount: parsed.amount || "",
        category: "rancho",
        extractionConfidence: parsed.confidence || 'high'
      });

      if (parsed.amount) {
        showToast(`Boleto validado! Valor: R$ ${parsed.amount}`, "success");
      } else {
        showToast("Código FEBRABAN validado! Confira os dados para salvar.", "success");
      }
    } else {
      // NÃO aceita números aleatórios nem inventa código!
      showToast("Não foi possível identificar o código de barras com segurança. Confira ou digite manualmente.", "warning", 5000);
      openNewBoletoModal({
        beneficiary: parsed.beneficiary || "",
        beneficiaryDocument: parsed.beneficiaryDocument || "",
        dueDate: parsed.dueDate || getLocalDateStr(),
        amount: parsed.amount || "",
        category: "rancho",
        extractionConfidence: "low"
      });
    }

  } catch (err) {
    console.error("Erro ao processar imagem do boleto:", err);
    if (banner) banner.style.display = "none";
    showToast("Não foi possível ler o arquivo. Você pode cadastrar manualmente.", "error");
    openNewBoletoModal();
  }
}
window.processBoletoImage = processBoletoImage;

/* ==========================================================================
   TAB 4: CONTROLE DE PONTO DO EDUARDO (DIÁRIAS)
   ========================================================================== */
function renderEduardoView() {
  renderEduardoCalendar();
  renderEduardoCalculations();
}

function renderEduardoCalendar() {
  const calGrid = document.getElementById("eduardoCalendarGrid");
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  document.getElementById("calMonthLabel").textContent = `${monthNames[calSelectedMonth]} de ${calSelectedYear}`;

  calGrid.innerHTML = "";

  dayNames.forEach(d => {
    const dh = document.createElement("div");
    dh.className = "cal-day-header";
    dh.textContent = d;
    calGrid.appendChild(dh);
  });

  const firstDayIndex = new Date(calSelectedYear, calSelectedMonth, 1).getDay();
  const daysInMonth = new Date(calSelectedYear, calSelectedMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calSelectedYear, calSelectedMonth, 0).getDate();

  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const prevCell = document.createElement("div");
    prevCell.className = "cal-day-cell other-month";
    prevCell.innerHTML = `<span class="cal-day-num">${daysInPrevMonth - i}</span>`;
    calGrid.appendChild(prevCell);
  }

  const todayStr = getLocalDateStr();

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${calSelectedYear}-${String(calSelectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const log = appData.eduardoWorkDays.find(d => d.date === dayStr);

    const cell = document.createElement("div");
    const isToday = dayStr === todayStr;
    const workType = log ? log.type : "none";

    cell.className = `cal-day-cell ${workType} ${isToday ? 'today' : ''}`;
    cell.dataset.date = dayStr;

    let tagHtml = "";
    if (log) {
      if (log.type === "full") {
        tagHtml = `<span class="cal-status-tag full">Dia Inteiro</span>`;
      } else if (log.type === "half") {
        tagHtml = `<span class="cal-status-tag half">Meio Período</span>`;
      } else if (log.type === "off") {
        tagHtml = `<span class="cal-status-tag off">Folga</span>`;
      }
    }

    cell.innerHTML = `
      <div style="display: flex; justify-content: space-between;">
        <span class="cal-day-num">${day}</span>
        ${isToday ? '<span style="font-size: 0.65rem; color: var(--primary-gold); font-weight: 800;">HOJE</span>' : ''}
      </div>
      ${tagHtml}
    `;

    cell.addEventListener("click", () => openEduardoDayModal(dayStr));
    calGrid.appendChild(cell);
  }
}

function renderEduardoCalculations() {
  const dailyRate = parseFloat(document.getElementById("inputEduardoDailyRate").value) || appData.settings.eduardoDailyRate || 62;
  const halfRate = parseFloat(document.getElementById("inputEduardoHalfRate").value) || appData.settings.eduardoHalfRate || 31;

  const monthLogs = appData.eduardoWorkDays.filter(d => {
    const dt = new Date(d.date + "T12:00:00");
    return dt.getFullYear() === calSelectedYear && dt.getMonth() === calSelectedMonth;
  });

  const fullLogs = monthLogs.filter(d => d.type === "full");
  const halfLogs = monthLogs.filter(d => d.type === "half");

  const countFull = fullLogs.length;
  const countHalf = halfLogs.length;
  const totalDaysEq = countFull + (countHalf * 0.5);
  const totalPayment = (countFull * dailyRate) + (countHalf * halfRate);

  document.getElementById("eduardoTotalAmountDisplay").textContent = formatCurrency(totalPayment);
  document.getElementById("eduardoCountFull").textContent = `${countFull} dias (${formatCurrency(countFull * dailyRate)})`;
  document.getElementById("eduardoCountHalf").textContent = `${countHalf} dias (${formatCurrency(countHalf * halfRate)})`;
  document.getElementById("eduardoTotalDaysEq").textContent = `${totalDaysEq.toFixed(1)} diárias`;
}

/* Modal: Ponto do Eduardo */
let currentEduardoType = "full";
function openEduardoDayModal(dateStr) {
  const targetDate = dateStr ? getLocalDateStr(dateStr) : getLocalDateStr();
  document.getElementById("eduardoInputDate").value = targetDate;

  const existing = appData.eduardoWorkDays.find(d => d.date === targetDate);
  if (existing) {
    selectEduardoType(existing.type);
    document.getElementById("eduardoInputNotes").value = existing.notes || "";
    document.getElementById("btnDeleteEduardoDay").style.display = "block";
  } else {
    selectEduardoType("full");
    document.getElementById("eduardoInputNotes").value = "";
    document.getElementById("btnDeleteEduardoDay").style.display = "none";
  }

  openModal("modalEduardoDay");
}

function selectEduardoType(type) {
  currentEduardoType = type;
  
  document.getElementById("btnEduardoTypeFull").className = "status-toggle-btn" + (type === "full" ? " selected-paid" : "");
  document.getElementById("btnEduardoTypeHalf").className = "status-toggle-btn" + (type === "half" ? " selected-reserved" : "");
  document.getElementById("btnEduardoTypeOff").className = "status-toggle-btn" + (type === "off" ? " selected-available" : "");
}

async function saveEduardoDay() {
  const dateVal = document.getElementById("eduardoInputDate").value;
  const notesVal = document.getElementById("eduardoInputNotes").value.trim();

  if (!dateVal) {
    showToast("Selecione uma data.", "warning");
    return;
  }

  const dailyRate = parseFloat(document.getElementById("inputEduardoDailyRate").value) || 62;
  const halfRate = parseFloat(document.getElementById("inputEduardoHalfRate").value) || 31;

  const weight = currentEduardoType === "full" ? 1.0 : (currentEduardoType === "half" ? 0.5 : 0.0);
  const amountDue = currentEduardoType === "full" ? dailyRate : (currentEduardoType === "half" ? halfRate : 0.0);

  appData.eduardoWorkDays = appData.eduardoWorkDays.filter(d => d.date !== dateVal);

  if (currentEduardoType !== "off") {
    appData.eduardoWorkDays.push({
      date: dateVal,
      type: currentEduardoType,
      hoursWeight: weight,
      amountDue: amountDue,
      notes: notesVal
    });
  }

  await saveState({
    type: "SET_EDUARDO_DAY",
    tableName: "eduardo_work_days",
    recordId: dateVal,
    payload: {
      date: dateVal,
      type: currentEduardoType,
      hoursWeight: weight,
      amountDue: amountDue,
      notes: notesVal
    }
  });

  renderEduardoView();
  closeModal("modalEduardoDay");
  showToast(`Ponto do dia ${formatDate(dateVal)} salvo com sucesso!`, "success");
}

async function deleteEduardoDay() {
  const dateVal = document.getElementById("eduardoInputDate").value;
  appData.eduardoWorkDays = appData.eduardoWorkDays.filter(d => d.date !== dateVal);
  
  if (window.localDB && window.currentOrgId && dateVal) {
    try {
      await window.localDB.deleteRecord('eduardo_work_days', [window.currentOrgId, dateVal]);
    } catch (e) {
      console.warn('[Eduardo] Erro ao deletar do store local:', e);
    }
  }

  await saveState({
    type: "DELETE_EDUARDO_DAY",
    tableName: "eduardo_work_days",
    recordId: dateVal,
    payload: { date: dateVal }
  });

  renderEduardoView();
  closeModal("modalEduardoDay");
  showToast(`Registro do dia ${formatDate(dateVal)} excluído.`, "success");
}

function exportEduardoReport() {
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const dailyRate = parseFloat(document.getElementById("inputEduardoDailyRate").value) || 62;
  const halfRate = parseFloat(document.getElementById("inputEduardoHalfRate").value) || 31;

  const monthLogs = appData.eduardoWorkDays.filter(d => {
    const dt = new Date(d.date + "T12:00:00");
    return dt.getFullYear() === calSelectedYear && dt.getMonth() === calSelectedMonth;
  });

  monthLogs.sort((a, b) => a.date.localeCompare(b.date));

  const fullLogs = monthLogs.filter(d => d.type === "full");
  const halfLogs = monthLogs.filter(d => d.type === "half");

  const totalDaysEq = fullLogs.length + (halfLogs.length * 0.5);
  const totalAmount = (fullLogs.length * dailyRate) + (halfLogs.length * halfRate);

  let report = `*ELDORADO PESCA LTDA - RELATÓRIO DE DIÁRIAS*\n`;
  report += `*Funcionário:* EDUARDO\n`;
  report += `*Mês de Referência:* ${monthNames[calSelectedMonth]} de ${calSelectedYear}\n\n`;
  report += `*RESUMO DO FECHAMENTO:*\n`;
  report += `• Dias Inteiros (1.0): ${fullLogs.length} dias (${formatCurrency(fullLogs.length * dailyRate)})\n`;
  report += `• Meio Períodos (0.5): ${halfLogs.length} dias (${formatCurrency(halfLogs.length * halfRate)})\n`;
  report += `• Total Diárias Equivalentes: ${totalDaysEq.toFixed(1)} diárias\n`;
  report += `*VALOR TOTAL A PAGAR: ${formatCurrency(totalAmount)}*\n\n`;
  report += `*DETALHAMENTO DIA A DIA:*\n`;

  monthLogs.forEach(d => {
    const typeTxt = d.type === "full" ? "Dia Inteiro" : "Meio Período";
    const noteTxt = d.notes ? ` (${d.notes})` : "";
    report += `• ${formatDate(d.date)}: ${typeTxt}${noteTxt}\n`;
  });

  document.getElementById("textareaEduardoReceipt").value = report;
  openModal("modalEduardoReceipt");
}

/* ==========================================================================
   TAB 4: CONFIGURAÇÕES & BACKUPS
   ========================================================================== */
function renderSettingsView() {
  if (appData.settings.eduardoDailyRate) {
    document.getElementById("inputEduardoDailyRate").value = appData.settings.eduardoDailyRate.toFixed(2);
  }
  if (appData.settings.eduardoHalfRate) {
    document.getElementById("inputEduardoHalfRate").value = appData.settings.eduardoHalfRate.toFixed(2);
  }
}

async function updateEduardoRatesInDatabase() {
  const dailyRate = parseFloat(document.getElementById("inputEduardoDailyRate").value) || 62;
  const halfRate = parseFloat(document.getElementById("inputEduardoHalfRate").value) || 31;

  appData.settings.eduardoDailyRate = dailyRate;
  appData.settings.eduardoHalfRate = halfRate;

  await saveState({
    type: "UPDATE_SETTINGS",
    tableName: "settings",
    recordId: "eduardoRates",
    payload: {
      key: "eduardoRates",
      value: {
        eduardoDailyRate: dailyRate,
        eduardoHalfRate: halfRate
      }
    }
  });

  renderEduardoCalculations();
}

function exportFullBackup() {
  const jsonStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  const dateStr = getLocalDateStr();
  a.href = url;
  a.download = `backup_eldorado_pesca_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showToast("Backup JSON baixado com sucesso!", "success");
}
window.exportFullBackup = exportFullBackup;

function handleRestoreBackupFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const restored = JSON.parse(e.target.result);
      if (!restored || typeof restored !== 'object') {
        throw new Error("Arquivo de backup inválido.");
      }
      appData = sanitizeAppData(restored);
      
      const orgId = window.authManager ? window.authManager.getOrganizationId() : null;
      if (orgId && window.localDB) {
        await window.localDB.saveFullAppData(appData, orgId);
      }

      if (Array.isArray(appData.raffles) && appData.raffles.length > 0) {
        for (const r of appData.raffles) {
          await saveState({
            type: "CREATE_RAFFLE",
            tableName: "raffles",
            recordId: r.id,
            payload: r
          });
        }
      }

      if (appData.raffles && appData.raffles.length > 0) {
        activeRaffleId = appData.raffles[0].id;
      }

      renderAll();
      showToast(`Backup restaurado com sucesso! ${appData.raffles?.length || 0} ações carregadas.`, "success");
    } catch (err) {
      console.error('[Backup] Erro ao restaurar:', err);
      showToast("Erro ao restaurar backup: " + err.message, "error");
    }
  };
  reader.readAsText(file);
}
window.handleRestoreBackupFile = handleRestoreBackupFile;

/* ==========================================================================
   Quick Batch Operations
   ========================================================================== */
async function markAllReservedAsPaid() {
  const raffle = getActiveRaffle();
  if (!raffle) return;
  let updatedList = [];
  raffle.numbers.forEach(n => {
    if (n.status === "reserved" && n.name) {
      n.status = "paid";
      n.paidAt = new Date().toISOString();
      updatedList.push(n);
    }
  });

  if (updatedList.length > 0) {
    await saveState({
      type: "BATCH_SET_NUMBERS",
      tableName: "raffle_numbers",
      recordId: raffle.id,
      payload: {
        raffleId: raffle.id,
        numbersList: updatedList
      }
    });

    renderRaffleView();
    showToast(`${updatedList.length} números marcados como Pagos!`, "success");
  } else {
    showToast("Nenhum número reservado encontrado.", "warning");
  }
}

/* ==========================================================================
   Modal Form: Criar Nova Rifa / Prêmios Dinâmicos & Próximo Número Automático
   ========================================================================== */
function getNextRaffleTitle() {
  let highestNum = 0;
  if (appData.raffles && appData.raffles.length > 0) {
    appData.raffles.forEach(r => {
      const match = (r.title || r.number || "").match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > highestNum) highestNum = num;
      }
    });
  }
  if (highestNum === 0) highestNum = 107;
  const nextNum = highestNum + 1;
  return `${nextNum}° AÇÃO ELDORADO PESCA`;
}

function openNewRaffleModal() {
  document.getElementById("modalRaffleFormTitle").textContent = "Nova Ação / Rifa";
  document.getElementById("rfEditId").value = "";
  document.getElementById("rfTitle").value = getNextRaffleTitle();
  document.getElementById("rfPrice").value = "";
  const rfTotal = document.getElementById("rfTotalNumbers");
  rfTotal.value = "";
  rfTotal.disabled = false;
  
  const saveBtn = document.getElementById("btnSaveRaffleForm");
  if (saveBtn) saveBtn.textContent = "Criar e Iniciar Ação";

  // Render clean dynamic prizes list (3 blank rows by default)
  const dynamicList = document.getElementById("dynamicPrizesList");
  dynamicList.innerHTML = "";
  addDynamicPrizeRow(1, "");
  addDynamicPrizeRow(2, "");
  addDynamicPrizeRow(3, "");

  openModal("modalRaffleForm");
}

function openEditRaffleDetailsModal() {
  const raffle = getActiveRaffle();
  if (!raffle) {
    showToast("Nenhuma ação ativa selecionada para editar.", "warning");
    return;
  }

  document.getElementById("modalRaffleFormTitle").textContent = `Editar Ação: ${raffle.title}`;
  document.getElementById("rfEditId").value = raffle.id;
  document.getElementById("rfTitle").value = raffle.title || "";
  document.getElementById("rfPrice").value = raffle.pricePerNumber || "";
  const rfTotal = document.getElementById("rfTotalNumbers");
  rfTotal.value = raffle.totalNumbers || (raffle.numbers ? raffle.numbers.length : 60);
  rfTotal.disabled = true; // Quantidade de cotas preservada para não corromper números existentes

  const saveBtn = document.getElementById("btnSaveRaffleForm");
  if (saveBtn) saveBtn.textContent = "Salvar Alterações da Ação";

  // Carrega prêmios existentes da rifa
  const dynamicList = document.getElementById("dynamicPrizesList");
  dynamicList.innerHTML = "";
  if (raffle.prizes && raffle.prizes.length > 0) {
    raffle.prizes.forEach((p, idx) => {
      addDynamicPrizeRow(p.position || (idx + 1), p.description || "");
    });
  } else {
    addDynamicPrizeRow(1, "");
    addDynamicPrizeRow(2, "");
    addDynamicPrizeRow(3, "");
  }

  openModal("modalRaffleForm");
}

function addDynamicPrizeRow(posOrVal, maybeVal) {
  let pos = typeof posOrVal === 'number' ? posOrVal : null;
  let val = typeof posOrVal === 'string' ? posOrVal : (maybeVal || "");
  const dynamicList = document.getElementById("dynamicPrizesList");
  const rowCount = dynamicList.children.length + 1;
  const currentPos = pos || rowCount;

  const row = document.createElement("div");
  row.className = "prize-dynamic-row";
  row.style.cssText = "display: flex; gap: 0.5rem; align-items: center;";

  row.innerHTML = `
    <span style="font-size: 0.82rem; font-weight: 700; color: var(--primary-gold); min-width: 60px;">${currentPos}º Prêmio:</span>
    <input type="text" class="form-input dynamic-prize-input" placeholder="Ex: Produto Físico OU R$ 500,00 em Vale Compras" value="${escapeHtml(val)}" style="flex-grow: 1;">
    <button type="button" class="btn btn-secondary btn-sm" onclick="removeDynamicPrizeRow(this)" style="padding: 0.35rem 0.6rem; color: #ef4444;">✕</button>
  `;

  dynamicList.appendChild(row);
}

function removeDynamicPrizeRow(btn) {
  const row = btn.closest(".prize-dynamic-row");
  if (row) row.remove();
  
  // Re-index prize labels
  const dynamicList = document.getElementById("dynamicPrizesList");
  Array.from(dynamicList.children).forEach((r, idx) => {
    const span = r.querySelector("span");
    if (span) span.textContent = `${idx + 1}º Prêmio:`;
  });
}

async function saveRaffleForm() {
  const editId = document.getElementById("rfEditId").value;
  const rawTitle = document.getElementById("rfTitle").value.trim();
  const title = rawTitle.replace(/\s*\((?:ativa|ativas|finalizada|finalizadas)\)/gi, "").trim();
  const price = parseFloat(document.getElementById("rfPrice").value);
  const totalNums = parseInt(document.getElementById("rfTotalNumbers").value, 10);

  if (!title) {
    showToast("Informe o título da ação (Ex: 108° AÇÃO ELDORADO PESCA).", "warning");
    return;
  }
  if (isNaN(price) || price <= 0) {
    showToast("Informe um valor válido por número.", "warning");
    return;
  }

  // Gather dynamic prizes (opcional: a ação pode ser criada sem prêmios e ter prêmios adicionados depois)
  const dynamicInputs = document.querySelectorAll(".dynamic-prize-input");
  const prizesArray = [];
  dynamicInputs.forEach((input, idx) => {
    const text = input.value.trim();
    if (text) {
      prizesArray.push({
        position: idx + 1,
        description: text,
        winnerNumber: null,
        winnerName: null
      });
    }
  });

  // Se estiver EDITANDO a rifa ativa
  if (editId) {
    const targetRaffle = (appData.raffles || []).find(r => String(r.id) === String(editId));
    if (!targetRaffle) {
      showToast("Ação não encontrada para atualização.", "error");
      return;
    }

    targetRaffle.title = title;
    targetRaffle.pricePerNumber = price;
    
    // Preserva ganhadores já sorteados se existirem
    const winnerMap = {};
    (targetRaffle.prizes || []).forEach(p => {
      if (p.winnerNumber) {
        winnerMap[p.position] = { winnerNumber: p.winnerNumber, winnerName: p.winnerName };
      }
    });

    prizesArray.forEach(p => {
      if (winnerMap[p.position]) {
        p.winnerNumber = winnerMap[p.position].winnerNumber;
        p.winnerName = winnerMap[p.position].winnerName;
      }
    });

    targetRaffle.prizes = prizesArray;

    if (typeof normalizeRaffle === 'function') {
      const normalized = normalizeRaffle(targetRaffle);
      Object.assign(targetRaffle, normalized);
    }

    await saveState({
      type: "UPDATE_RAFFLE",
      tableName: "raffles",
      recordId: targetRaffle.id,
      payload: targetRaffle
    });

    renderRaffleDropdown();
    renderRaffleView();
    closeModal("modalRaffleForm");
    const prizeCountText = prizesArray.length > 0 ? ` com ${prizesArray.length} prêmio(s)` : ' (sem prêmios)';
    showToast(`Ação "${title}" atualizada com sucesso${prizeCountText}!`, "success");
    return;
  }

  // Caso contrário: CRIAR NOVA RIFA
  if (isNaN(totalNums) || totalNums <= 0) {
    showToast("Informe a quantidade total de números.", "warning");
    return;
  }

  const numbersArray = [];
  for (let i = 1; i <= totalNums; i++) {
    numbersArray.push({
      num: i,
      name: "",
      status: "available",
      reservedAt: null
    });
  }

  let newRaffle = {
    id: "rifa-" + Date.now(),
    number: title.split(" ")[0] || "Nova",
    title: title,
    subtitle: "AÇÃO RÁPIDA",
    pricePerNumber: price,
    totalNumbers: totalNums,
    reservationTimeoutHours: 2,
    pixKey: "42999162340",
    pixOwner: "ELDORADO PESCA LTDA",
    shippingNote: "Frete a parte - Envio para todo o Brasil.",
    liveDrawNote: `Sorteio ao vivo no Instagram @lojaeldoradopesca`,
    privateContact: "42 9 99162340",
    rules: "",
    prizes: prizesArray,
    createdAt: new Date().toISOString(),
    status: "active",
    numbers: numbersArray
  };

  if (typeof normalizeRaffle === 'function') {
    newRaffle = normalizeRaffle(newRaffle);
  }

  appData.raffles.unshift(newRaffle);
  activeRaffleId = newRaffle.id;
  await saveState({
    type: "CREATE_RAFFLE",
    tableName: "raffles",
    recordId: newRaffle.id,
    payload: newRaffle
  });
  renderRaffleDropdown();
  renderRaffleView();
  closeModal("modalRaffleForm");
  const prizeCountText = prizesArray.length > 0 ? ` com ${prizesArray.length} prêmios!` : '!';
  showToast(`Ação "${title}" criada com sucesso${prizeCountText}`, "success");
}

/* ==========================================================================
   Excluir Rifa / Ação (Preservando Ganhadores em Vales e Prêmios)
   ========================================================================== */
function openDeleteRaffleModal() {
  const raffle = getActiveRaffle();
  if (!raffle) {
    showToast("Nenhuma rifa selecionada para excluir.", "warning");
    return;
  }

  const titleEl = document.getElementById("deleteRaffleTitle");
  if (titleEl) {
    titleEl.textContent = raffle.title || "esta ação";
  }

  openModal("modalDeleteRaffle");
}

async function confirmDeleteRaffle() {
  const raffle = getActiveRaffle();
  if (!raffle) {
    closeModal("modalDeleteRaffle");
    return;
  }

  const raffleId = raffle.id;
  const raffleTitle = raffle.title || "Ação";

  // Remove the raffle from local state. NOTE: appData.valesAndPrizes and appData.fishingBookings remain 100% UNTOUCHED!
  appData.raffles = (appData.raffles || []).filter(r => String(r.id) !== String(raffleId));

  // Switch to next active raffle or first available
  if (appData.raffles.length > 0) {
    const nextActive = appData.raffles.find(r => r.status === "active") || appData.raffles[0];
    activeRaffleId = nextActive.id;
  } else {
    activeRaffleId = null;
  }

  if (window.localDB && typeof window.localDB.deleteRecord === 'function') {
    await window.localDB.deleteRecord('raffles', raffleId);
  }

  await saveState({
    type: "DELETE_RAFFLE",
    tableName: "raffles",
    recordId: raffleId,
    payload: { id: raffleId }
  });

  renderAll();
  closeModal("modalDeleteRaffle");
  showToast(`Rifa "${raffleTitle}" excluída com sucesso! Os ganhadores e vales foram mantidos.`, "success");
}

/* ==========================================================================
   UI Event Handlers & Setup
   ========================================================================== */
function setupEventListeners() {
  // Navigation Tabs (Lazy Rendering sob demanda)
  document.querySelectorAll(".nav-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      
      btn.classList.add("active");
      const targetTab = btn.dataset.tab;
      document.getElementById(targetTab).classList.add("active");
      activeTab = targetTab;
      renderTab(targetTab);
    });
  });

  // Event Delegation para o Grid de Cotas (Alta Performance - Zero Listener Leak)
  const gridEl = document.getElementById("raffleNumbersGrid");
  if (gridEl) {
    gridEl.addEventListener("click", (e) => {
      const tile = e.target.closest(".num-tile");
      if (!tile) return;
      const num = parseInt(tile.dataset.num, 10);
      const index = parseInt(tile.dataset.index, 10);
      if (isNaN(num)) return;

      if (isGridMultiSelectMode) {
        if (gridSelectedCotas.has(num)) {
          gridSelectedCotas.delete(num);
          tile.classList.remove("multi-selected");
        } else {
          gridSelectedCotas.add(num);
          tile.classList.add("multi-selected");
        }
        updateGridMultiSelectBar();
      } else {
        openEditNumberModal(index);
      }
    });
  }

  // Raffle Dropdown Switcher (Histórico)
  const selectRaffleEl = document.getElementById("selectActiveRaffle");
  if (selectRaffleEl) {
    selectRaffleEl.addEventListener("change", (e) => {
      onSelectActiveRaffle(e.target.value);
    });
  }

  // Header quick backup
  const btnQuickBackup = document.getElementById("btnQuickBackup");
  if (btnQuickBackup) btnQuickBackup.addEventListener("click", triggerQuickBackupDownload);
  const brandBtn = document.getElementById("brandHeaderBtn");
  if (brandBtn) {
    brandBtn.addEventListener("click", () => {
      document.getElementById("tabBtnRifas").click();
    });
  }

  // Raffle Search & Buttons
  document.getElementById("inputSearchRaffle").addEventListener("input", renderRaffleNumbersGrid);
  document.getElementById("btnExportWhatsApp").addEventListener("click", openExportWhatsAppModal);
  document.getElementById("btnImportWhatsApp").addEventListener("click", openImportWhatsAppModal);
  document.getElementById("btnNewRaffle").addEventListener("click", openNewRaffleModal);
  
  // Delete Raffle Buttons
  const btnDeleteRaffle = document.getElementById("btnDeleteRaffle");
  if (btnDeleteRaffle) btnDeleteRaffle.addEventListener("click", openDeleteRaffleModal);
  const btnDeleteRaffleSide = document.getElementById("btnDeleteRaffleSide");
  if (btnDeleteRaffleSide) btnDeleteRaffleSide.addEventListener("click", openDeleteRaffleModal);
  const btnConfirmDelete = document.getElementById("btnConfirmDeleteRaffle");
  if (btnConfirmDelete) btnConfirmDelete.addEventListener("click", confirmDeleteRaffle);

  document.getElementById("btnAddDynamicPrize").addEventListener("click", () => addDynamicPrizeRow());
  const btnAddFishingPrize = document.getElementById("btnAddFishingPrizeRow");
  if (btnAddFishingPrize) {
    btnAddFishingPrize.addEventListener("click", () => {
      addDynamicPrizeRow("DIÁRIA DE PESCA NO LAGO OU R$ 450,00 EM VALE COMPRAS");
    });
  }

  document.getElementById("btnMarkAllPaid").addEventListener("click", markAllReservedAsPaid);
  document.getElementById("btnEditRaffleDetails").addEventListener("click", openEditRaffleDetailsModal);

  // Number Edit Modal & Assign Winner
  document.getElementById("btnSaveNumberModal").addEventListener("click", saveNumberModal);
  document.getElementById("btnConfirmWinner").addEventListener("click", assignPrizeWinner);

  // WhatsApp Modals
  document.getElementById("btnProcessImportWhatsApp").addEventListener("click", processWhatsAppImport);
  document.getElementById("btnDoCopyExportWhatsApp").addEventListener("click", doCopyExportWhatsApp);
  
  // WhatsApp Available Numbers Listeners
  const btnExportAvail = document.getElementById("btnExportAvailableWhatsApp");
  if (btnExportAvail) btnExportAvail.addEventListener("click", () => openExportAvailableWhatsAppModal());
  const btnSideAvail = document.getElementById("btnSideExportAvailable");
  if (btnSideAvail) btnSideAvail.addEventListener("click", () => openExportAvailableWhatsAppModal());
  const btnDoCopyAvail = document.getElementById("btnDoCopyAvailableWhatsApp");
  if (btnDoCopyAvail) btnDoCopyAvail.addEventListener("click", doCopyAvailableWhatsApp);
  const btnDoSendAvail = document.getElementById("btnDoSendAvailableWhatsApp");
  if (btnDoSendAvail) btnDoSendAvail.addEventListener("click", doSendAvailableWhatsApp);

  // Vales & Prêmios
  document.getElementById("inputSearchVales").addEventListener("input", renderValesView);
  document.getElementById("btnNewVale").addEventListener("click", openNewValeModal);
  document.getElementById("btnSaveNewVale").addEventListener("click", saveNewVale);
  document.getElementById("btnConfirmAbater").addEventListener("click", confirmAbaterProduto);
  document.getElementById("btnConfirmExchangePrize").addEventListener("click", confirmExchangePrize);

  // Eduardo Work Days
  document.getElementById("btnCalPrevMonth").addEventListener("click", () => {
    calSelectedMonth--;
    if (calSelectedMonth < 0) {
      calSelectedMonth = 11;
      calSelectedYear--;
    }
    renderEduardoView();
    updateGlobalStats();
  });

  document.getElementById("btnCalNextMonth").addEventListener("click", () => {
    calSelectedMonth++;
    if (calSelectedMonth > 11) {
      calSelectedMonth = 0;
      calSelectedYear++;
    }
    renderEduardoView();
    updateGlobalStats();
  });

  document.getElementById("btnCalToday").addEventListener("click", () => {
    const now = new Date();
    calSelectedYear = now.getFullYear();
    calSelectedMonth = now.getMonth();
    renderEduardoView();
    updateGlobalStats();
  });

  // Rates Change auto-saves to database
  document.getElementById("inputEduardoDailyRate").addEventListener("change", updateEduardoRatesInDatabase);
  document.getElementById("inputEduardoHalfRate").addEventListener("change", updateEduardoRatesInDatabase);

  document.getElementById("btnMarkTodayEduardo").addEventListener("click", () => openEduardoDayModal());
  document.getElementById("btnQuickLogEduardo").addEventListener("click", () => openEduardoDayModal());
  document.getElementById("btnSaveEduardoDay").addEventListener("click", saveEduardoDay);
  document.getElementById("btnDeleteEduardoDay").addEventListener("click", deleteEduardoDay);
  document.getElementById("btnExportEduardoReport").addEventListener("click", exportEduardoReport);
  document.getElementById("btnCopyEduardoReceipt").addEventListener("click", () => {
    const text = document.getElementById("textareaEduardoReceipt").value;
    navigator.clipboard.writeText(text).then(() => showToast("Recibo copiado para o WhatsApp!", "success"));
  });

  // Agenda & Calendário de Pesca (Eldorado Lake)
  const btnFishPrev = document.getElementById("btnFishCalPrevMonth");
  if (btnFishPrev) {
    btnFishPrev.addEventListener("click", () => {
      fishCalSelectedMonth--;
      if (fishCalSelectedMonth < 0) {
        fishCalSelectedMonth = 11;
        fishCalSelectedYear--;
      }
      renderFishingAgendaView();
    });
  }

  const btnFishNext = document.getElementById("btnFishCalNextMonth");
  if (btnFishNext) {
    btnFishNext.addEventListener("click", () => {
      fishCalSelectedMonth++;
      if (fishCalSelectedMonth > 11) {
        fishCalSelectedMonth = 0;
        fishCalSelectedYear++;
      }
      renderFishingAgendaView();
    });
  }

  const btnFishToday = document.getElementById("btnFishCalToday");
  if (btnFishToday) {
    btnFishToday.addEventListener("click", () => {
      const now = new Date();
      fishCalSelectedYear = now.getFullYear();
      fishCalSelectedMonth = now.getMonth();
      renderFishingAgendaView();
    });
  }

  const btnNewBooking = document.getElementById("btnNewFishingBooking");
  if (btnNewBooking) {
    btnNewBooking.addEventListener("click", () => openNewFishingBookingModal());
  }

  const searchFish = document.getElementById("inputSearchFishing");
  if (searchFish) {
    searchFish.addEventListener("input", renderFishingBookingsList);
  }

  const btnSaveBooking = document.getElementById("btnSaveFishingBooking");
  if (btnSaveBooking) {
    btnSaveBooking.addEventListener("click", saveFishingBooking);
  }

  const btnConfirmPay = document.getElementById("btnConfirmFishingPayment");
  if (btnConfirmPay) {
    btnConfirmPay.addEventListener("click", confirmFishingPayment);
  }

  const btnCopyFishWA = document.getElementById("btnCopyFishingWhatsApp");
  if (btnCopyFishWA) {
    btnCopyFishWA.addEventListener("click", doCopyFishingWhatsApp);
  }

  // Settings & Backups
  const btnSaveRaffle = document.getElementById("btnSaveRaffleForm");
  if (btnSaveRaffle) btnSaveRaffle.addEventListener("click", saveRaffleForm);
  const btnExport = document.getElementById("btnExportFullBackup");
  if (btnExport) btnExport.addEventListener("click", triggerQuickBackupDownload);
  const inputRestore = document.getElementById("inputRestoreBackupFile");
  if (inputRestore) inputRestore.addEventListener("change", handleRestoreBackupFile);
}

/* ==========================================================================
   Helper Utilities
   ========================================================================= */
function openModal(id) {
  // Fecha e esconde todos os outros modais para isolamento total
  document.querySelectorAll(".modal-backdrop, .modal-overlay").forEach(m => {
    if (m.id !== id) {
      m.classList.remove("open");
      m.style.display = "none";
    }
  });

  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("open");
    modal.style.display = "flex";

    // Foca automaticamente no primeiro campo editável de forma confiável
    setTimeout(() => {
      const firstInput = modal.querySelector("input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])");
      if (firstInput) {
        firstInput.focus();
        if (firstInput.select && firstInput.type !== 'date' && firstInput.type !== 'number') {
          try { firstInput.select(); } catch (e) {}
        }
      }
    }, 80);
  }
}

function closeModal(id) {
  if (id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove("open");
      modal.style.display = "none";
    }
  } else {
    document.querySelectorAll(".modal-backdrop, .modal-overlay").forEach(m => {
      m.classList.remove("open");
      m.style.display = "none";
    });
  }
}

// Fechamento infalível de modais ao clicar no botão X, botão Cancelar ou no fundo escuro
document.addEventListener("click", (e) => {
  if (!e.target) return;

  // 1. Clicou no backdrop escuro fora da janela
  if (e.target.classList && (e.target.classList.contains("modal-backdrop") || e.target.classList.contains("modal-overlay"))) {
    e.target.classList.remove("open");
    e.target.style.display = "none";
    return;
  }

  // 2. Clicou no botão de fechar (X)
  const closeBtn = e.target.closest(".modal-close-btn, .modal-close");
  if (closeBtn) {
    const parentModal = closeBtn.closest(".modal-backdrop, .modal-overlay");
    if (parentModal) {
      parentModal.classList.remove("open");
      parentModal.style.display = "none";
    } else {
      closeModal();
    }
  }
});

// Fechar modais ao pressionar a tecla ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeModal();
  }
});

function formatCurrency(val) {
  return "R$ " + (parseFloat(val) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m];
  });
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideToast 0.3s cubic-bezier(0.16, 1, 0.3, 1) reverse forwards";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

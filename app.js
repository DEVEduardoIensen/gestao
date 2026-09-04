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
  ranchoBookings: []
};

// UI State
let activeRaffleId = null;
let userSelectedRaffleExplicitly = false;
let activeTab = "tab-rifas";

// Helper: Seleciona sempre a ação de maior numeração (cota mais recente/atual)
function getHighestRaffle(raffles) {
  if (!Array.isArray(raffles) || raffles.length === 0) return null;
  // Filtra ações de teste
  const validRaffles = raffles.filter(r => {
    if (!r) return false;
    const title = (r.title || '').toLowerCase();
    const id = (r.id || '').toLowerCase();
    return !title.includes('teste') && !id.includes('test');
  });
  const pool = validRaffles.length > 0 ? validRaffles : raffles;

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
let calSelectedYear = new Date().getFullYear();
let calSelectedMonth = new Date().getMonth(); // 0-indexed (7 = August)
let fishCalSelectedYear = new Date().getFullYear();
let fishCalSelectedMonth = new Date().getMonth();
let ranchoCalSelectedYear = new Date().getFullYear();
let ranchoCalSelectedMonth = new Date().getMonth();
let isConnectedToBackend = false;

// Initialize Application on DOM Ready
function sanitizeAppData(data) {
  if (!data || typeof data !== 'object') data = {};
  if (!data.settings || typeof data.settings !== 'object') {
    data.settings = (typeof INITIAL_SAMPLE_DATA !== 'undefined' && INITIAL_SAMPLE_DATA.settings) ? INITIAL_SAMPLE_DATA.settings : { eduardoDailyRate: 62.00, eduardoHalfRate: 31.00 };
  }
  if (!Array.isArray(data.raffles)) {
    data.raffles = (typeof INITIAL_SAMPLE_DATA !== 'undefined' && Array.isArray(INITIAL_SAMPLE_DATA.raffles)) ? INITIAL_SAMPLE_DATA.raffles : [];
  } else {
    // Filtra e descarta rifas de teste da fila e do cache local
    data.raffles = data.raffles.filter(r => {
      if (!r) return false;
      const id = (r.id || '').toLowerCase();
      const title = (r.title || '').toLowerCase();
      return !id.includes('test') && !title.includes('teste');
    });
    data.raffles.forEach(r => {
      if (r && r.title) {
        r.title = r.title.replace(/\s*\((?:ativa|ativas|finalizada|finalizadas)\)/gi, '').trim();
      }
    });
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
    badge.title = "Supabase PostgreSQL conectado e sincronizado!";
    text.textContent = "Sincronizado";
  } else if (status === "syncing") {
    badge.className = "db-status-badge syncing";
    badge.title = "Enviando alterações pendentes para o Supabase...";
    text.textContent = "Sincronizando...";
  } else if (status === "conflict") {
    badge.className = "db-status-badge conflict";
    badge.title = "Atenção: Conflito detectado na sincronização! Clique para resolver.";
    text.textContent = "Conflito";
  } else {
    badge.className = "db-status-badge offline";
    badge.title = "Modo Offline ativo (IndexedDB). As alterações serão sincronizadas ao reconectar.";
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

  // 1. Recupera sessão do usuário se houver
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

  const orgId = (window.authManager && window.authManager.getOrganizationId()) || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID') || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.DEFAULT_ORG_ID : null);

  // 3. Renderiza IMEDIATAMENTE do cache local IndexedDB exclusivo deste tenant (< 30ms)
  let loadedFromLocal = false;
  if (window.localDB) {
    try {
      const localData = await window.localDB.loadFullAppData(orgId);
      if (localData && (localData.raffles || localData.valesAndPrizes || localData.fishingBookings || localData.ranchoBookings)) {
        appData = sanitizeAppData(localData);
        loadedFromLocal = true;
      }
    } catch (err) {
      console.warn('[Offline-First] Erro ao ler IndexedDB:', err);
    }
  }

  if (!loadedFromLocal) {
    const saved = localStorage.getItem("ELDORADO_PESCA_STORE_DATA_" + orgId);
    if (saved) {
      try {
        appData = sanitizeAppData(JSON.parse(saved));
        loadedFromLocal = true;
      } catch (e) {}
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
  }

  // Define rifa ativa imediatamente para renderização rápida (sempre a ação mais alta se não escolhida manualmente)
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
              const idx = sanitized.raffles.findIndex(r => r.id === op.payload.id);
              if (idx >= 0) sanitized.raffles[idx] = { ...sanitized.raffles[idx], ...op.payload };
              else sanitized.raffles.unshift(op.payload);
            } else if (op.type === 'DELETE_RAFFLE' && Array.isArray(sanitized.raffles)) {
              sanitized.raffles = sanitized.raffles.filter(r => r.id !== op.payload.id);
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

    if (window.localDB) {
      try {
        await window.localDB.saveFullAppData(appData, orgId);
      } catch (e) {
        console.warn('[mergeRemoteData] Falha ao persistir no IndexedDB:', e);
      }
    }

    try {
      localStorage.setItem("ELDORADO_PESCA_STORE_DATA_" + orgId, JSON.stringify(appData));
    } catch (e) {}

    renderAll();
    updateGlobalStats();
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

      // Força verificação imediata de atualizações no servidor/Vercel
      reg.update().catch(() => {});

      // Escuta novas versões sendo baixadas
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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

    // Checa atualizações ao voltar e arma o Background Sync ao sair ou bloquear o celular
    const armBackgroundSyncOnExit = () => {
      if ('serviceWorker' in navigator) {
        const arm = (reg) => {
          if (!reg) return;
          if ('sync' in reg) {
            reg.sync.register('eldorado-outbox-sync').catch(() => {});
            reg.sync.register('sync-outbox').catch(() => {});
          }
          if ('periodicSync' in reg) {
            reg.periodicSync.register('eldorado-periodic-sync', { minInterval: 15 * 60 * 1000 }).catch(() => {});
          }
        };
        navigator.serviceWorker.ready.then(arm).catch(() => {});
        if (typeof navigator.serviceWorker.getRegistration === 'function') {
          navigator.serviceWorker.getRegistration().then(arm).catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) reg.update().catch(() => {});
        });
      } else if (document.visibilityState === 'hidden') {
        armBackgroundSyncOnExit();
      }
    });
    window.addEventListener('pagehide', armBackgroundSyncOnExit);
    window.addEventListener('freeze', armBackgroundSyncOnExit);
  }

  // Escuta mudanças de status no SyncEngine
  if (window.syncEngine) {
    window.syncEngine.onStatusChange((status, conflicts) => {
      updateDbStatusBadge(status);
      updateSyncCenterModal(status, conflicts);
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
        const activeCache = 'eldorado-pwa-v2.8.2';
        await Promise.all(
          cacheNames.map(name => {
            if (name !== activeCache) {
              return caches.delete(name);
            }
          })
        );
      }

      showToast('O aplicativo já está na versão mais recente (v2.8.2 PRO)!', 'success');
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

async function updateSyncCenterModal(status, conflicts) {
  const statusText = document.getElementById('syncCenterStatusText');
  const queueContainer = document.getElementById('syncQueueListContainer');
  const conflictsSection = document.getElementById('syncConflictsSection');
  const conflictsList = document.getElementById('syncConflictsList');

  if (statusText) {
    statusText.textContent = status === 'synced' ? '🟢 Sincronizado' : (status === 'syncing' ? '🔵 Sincronizando...' : (status === 'conflict' ? '🔴 Conflito Detectado' : '🟡 Offline'));
  }

  const orgId = window.authManager ? window.authManager.getOrganizationId() : null;
  if (queueContainer && window.localDB) {
    const pendingOps = await window.localDB.getPendingOperations(orgId);
    if (pendingOps.length === 0) {
      queueContainer.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 1rem;">Nenhuma operação pendente. Todos os dados estão salvos na nuvem!</div>';
    } else {
      queueContainer.innerHTML = pendingOps.map(op => `
        <div class="sync-queue-item">
          <div>
            <span class="sync-queue-type">${escapeHtml(op.type)}</span>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${new Date(op.timestamp).toLocaleTimeString()} • ${escapeHtml(op.tableName || 'db')}</div>
          </div>
          <span class="sync-queue-status ${op.status}">${op.status.toUpperCase()}</span>
        </div>
      `).join('');
    }
  }

  if (conflictsSection && conflictsList) {
    if (Array.isArray(conflicts) && conflicts.length > 0) {
      conflictsSection.style.display = 'block';
      conflictsList.innerHTML = conflicts.map(c => `
        <div class="conflict-card">
          <div class="conflict-card-header">
            <span>⚠️ Conflito na Venda da Cota</span>
            <span style="font-size: 0.72rem; color: var(--text-dim);">${new Date(c.timestamp || Date.now()).toLocaleTimeString()}</span>
          </div>
          <div class="conflict-card-details">
            <div><strong>Rifa ID:</strong> ${escapeHtml(c.raffleId)}</div>
            <div><strong>Comprador Local:</strong> ${escapeHtml(c.buyerName || 'Sem nome')}</div>
            <div><strong>Cotas Conflitantes:</strong> ${(c.conflictingNumbers || []).map(cn => `#${cn.num} (Já vendida no servidor para: <strong>${escapeHtml(cn.current_owner || 'Outro comprador')}</strong>)`).join('<br>')}</div>
            <div style="font-size: 0.75rem; color: #ff9f43; margin-top: 0.35rem;">A venda foi bloqueada para proteger o comprador oficial no servidor.</div>
          </div>
          <div class="conflict-card-actions">
            <button class="btn btn-secondary btn-xs" onclick="resolveConflictFromUI('${c.opId}', 'dismiss')">Descartar da Fila</button>
            <button class="btn btn-gold btn-xs" onclick="resolveConflictFromUI('${c.opId}', 'accept_server')">Aceitar Estado do Servidor</button>
          </div>
        </div>
      `).join('');
    } else {
      conflictsSection.style.display = 'none';
    }
  }
}

async function resolveConflictFromUI(opId, action) {
  if (window.syncEngine) {
    await window.syncEngine.resolveConflict(opId, action);
    showToast(action === 'accept_server' ? 'Estado do servidor aceito.' : 'Conflito descartado da fila.', 'info');
  }
}

function getActiveRaffle() {
  if (!appData.raffles || appData.raffles.length === 0) return null;
  if (activeRaffleId) {
    const found = appData.raffles.find(r => String(r.id) === String(activeRaffleId));
    if (found) return found;
  }
  const highest = getHighestRaffle(appData.raffles);
  if (highest) {
    activeRaffleId = highest.id;
    return highest;
  }
  return appData.raffles[0];
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
    case "tab-rancho":
      renderRanchoView();
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
    renderRanchoView();
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
  } else {
    prizesListEl.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-dim);">Nenhum prêmio cadastrado.</div>`;
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
  gridEl.innerHTML = "";

  const numbersList = Array.isArray(raffle.numbers) ? raffle.numbers : [];
  if (numbersList.length === 0) {
    gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 2rem;">Nenhum número cadastrado nesta ação.</div>`;
    return;
  }

  numbersList.forEach((item, index) => {
    // Search Filter
    if (searchTerm) {
      const matchNum = item.num.toString().includes(searchTerm);
      const matchName = (item.name || "").toLowerCase().includes(searchTerm);
      if (!matchNum && !matchName) return;
    }

    const isSelected = gridSelectedCotas.has(item.num);
    const wonPrize = (raffle.prizes || []).find(p => p.winnerNumber === item.num);
    const winnerClass = wonPrize ? ` is-winner winner-pos-${wonPrize.position || 1}` : "";

    const tile = document.createElement("div");
    tile.className = `num-tile ${item.status}${winnerClass}` + (isSelected ? " multi-selected" : "");
    tile.dataset.index = index;
    tile.dataset.num = item.num;

    let statusTag = "";
    if (item.status === "paid") {
      statusTag = `<span class="num-status-tag" title="Pago" style="color: var(--status-paid-text);">Pago</span>`;
    } else if (item.status === "reserved") {
      statusTag = `<span class="num-status-tag tag-reserved" title="Reservado" style="color: var(--primary-gold);"><span class="status-text-full">Reservado</span><span class="status-text-short">Res.</span></span>`;
    }

    if (wonPrize) {
      tile.title = `${wonPrize.position || 1}º Lugar: ${item.name || 'Ganhador'}`;
    }

    tile.innerHTML = `
      <div class="num-tile-top">
        <span class="num-badge">#${item.num}</span>
        ${statusTag}
      </div>
      <div class="num-name" title="${item.name ? escapeHtml(item.name) : 'Livre'}">
        ${item.name ? escapeHtml(item.name) : '—'}
      </div>
    `;

    gridEl.appendChild(tile);
  });
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
  let output = `*${raffle.title || '107° AÇÃO ELDORADO PESCA'}*\n\n`;
  output += `*${raffle.subtitle || 'AÇÃO RÁPIDA '}*\n\n`;
  output += `LEIAM COM ATENÇÃO, MUITA ATENÇÃO!\n\n`;
  output += `OS NUMEROS SÓ FICARÃO DISPONIVEIS ATÉ 2️⃣ HORAS ⏰ APÓS O FECHAMENTO DA AÇÃO, SE NÃO OUVER PAGAMENTO VAMOS DISPONIBILIZAR NOVAMENTE PARA OS DEMAIS. \n\n`;
  output += `*NAO COPIAR E COLAR, APENAS FALAR O NÚMERO.*\n\n`;

  // Prizes
  if (raffle.prizes && raffle.prizes.length > 0) {
    raffle.prizes.forEach((p, i) => {
      output += `💥*${p.position || (i + 1)}°* ${p.description}\n\n`;
    });
  }

  output += `‼️*R$ ${raffle.pricePerNumber ? raffle.pricePerNumber.toFixed(2).replace('.', ',') : '25,00'} cada número*‼️\n\n`;
  output += `*Pix 42999162340* \n`;
  output += `ELDORADO PESCA LTDA\n\n`;
  output += `Frete a parte - Envio para todo o Brasil.\n\n`;
  output += ` Sorteio ao vivo no Instagram @lojaeldoradopesca\n\n`;
  output += `Mandar os números no grupo, mas o comprovante no privado 42 9 99162340 \n\n`;
  output += `Sorteio será quando o último número for pago, avisarei aqui no grupo.\n\n`;

  // Numbers list 1 to N
  raffle.numbers.forEach(item => {
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
function removeLinkedFishingBookings(prizeId, customerName = null) {
  if (!prizeId && !customerName) return;
  const targetName = customerName ? customerName.trim().toUpperCase() : null;
  const toDelete = (appData.fishingBookings || []).filter(b => {
    if (prizeId && b.prizeId === prizeId) return true;
    if (targetName && b.bookingType === "raffle_prize" && (b.clientName || "").trim().toUpperCase() === targetName) return true;
    return false;
  });

  if (toDelete.length > 0) {
    appData.fishingBookings = (appData.fishingBookings || []).filter(b => !toDelete.some(del => del.id === b.id));
    toDelete.forEach(b => {
      saveState({
        type: "DELETE_FISHING_BOOKING",
        tableName: "fishing_bookings",
        recordId: b.id,
        payload: { id: b.id }
      });
    });
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
          <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações / Valor do Vale">
            Editar
          </button>
          <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
            Excluir
          </button>
        `;
      } else {
        actionsHtml = `
          <button class="btn btn-gold btn-sm" onclick="choosePrizeOption('${item.id}', 'premio_entregue')" title="Ganhador retirou o produto físico na loja">
            Entregar Prêmio
          </button>
          <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" style="border-color: #818cf8; color: #a5b4fc;" title="Escolheu ficar com o Vale-Compras de ${formatCurrency(valeAmount)}">
            Vale (${formatCurrency(valeAmount)})
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openExchangePrizeModal('${item.id}')" style="border-color: #8b5cf6; color: #c4b5fd;" title="Ganhador quer trocar por outro produto na loja">
            Troca
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações">
            Editar
          </button>
          <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
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
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações / Valor do Vale">
          Editar
        </button>
        <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
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
        <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
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
        <button class="btn btn-whatsapp btn-sm" onclick="generateValeWhatsAppReceipt('${item.id}')">
          WhatsApp
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações e Saldo">
          Editar
        </button>
        <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
          Excluir
        </button>
      `;
    } else {
      if (isExchanged) {
        actionsHtml = `
          <button class="btn btn-secondary btn-sm" onclick="openExchangePrizeModal('${item.id}')" style="border-color: #a855f7; color: #e9d5ff;" title="Editar informações da troca">
            ✏️ Editar Troca
          </button>
          <button class="btn btn-danger btn-sm" onclick="undoCurrentExchangePrizeDirect('${item.id}')" title="Desfazer troca caso o cliente tenha se arrependido e retornar prêmio para Aguardando Retirada">
            ↩️ Desfazer Troca
          </button>
        `;
      } else if (item.status === "pending_pickup") {
        actionsHtml = `
          <button class="btn btn-gold btn-sm" onclick="markPrizeDelivered('${item.id}')">
            Entregue
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
        <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
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
    removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "diaria") {
    item.type = "dual_choice";
    item.status = "pending_schedule";
    removeLinkedFishingBookings(item.id, oldName);
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
    removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "pending_pickup") {
    item.type = "premio_fisico";
    item.status = "pending_pickup";
    item.deliveredAt = null;
    item.exchangedItem = null;
    item.differencePaid = 0;
    item.exchangeNotes = null;
    item.exchangedAt = null;
    removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "delivered") {
    item.status = "delivered";
    item.deliveredAt = item.deliveredAt || new Date().toISOString();
    if (oldStatus !== "scheduled") {
      removeLinkedFishingBookings(item.id, oldName);
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
    removeLinkedFishingBookings(valeId, oldName);

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
    removeLinkedFishingBookings(valeId, oldName);

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
    removeLinkedFishingBookings(valeId, oldName);

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
    removeLinkedFishingBookings(valeId, oldName);

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
    removeLinkedFishingBookings(valeId, oldName);

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

  navigator.clipboard.writeText(msg).then(() => {
    showToast("Extrato copiado para o WhatsApp!", "success");
  });
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
    removeLinkedFishingBookings(id, name);

    appData.valesAndPrizes = appData.valesAndPrizes.filter(v => v.id !== id);

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
      <button class="btn btn-secondary btn-sm" onclick="deleteFishingBooking('${b.id}')" title="Excluir" style="margin-left: auto;">
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
      <button class="btn btn-secondary btn-sm" onclick="deleteRanchoBooking('${b.id}')" title="Excluir" style="margin-left: auto;">
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

  // Gather dynamic prizes
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

  if (prizesArray.length === 0) {
    showToast("Adicione pelo menos um prêmio para a ação.", "warning");
    return;
  }

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

    await saveState({
      type: "UPDATE_RAFFLE",
      tableName: "raffles",
      recordId: targetRaffle.id,
      payload: targetRaffle
    });

    renderRaffleDropdown();
    renderRaffleView();
    closeModal("modalRaffleForm");
    showToast(`Ação "${title}" atualizada com sucesso!`, "success");
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

  const newRaffle = {
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
  showToast(`Ação "${title}" criada com sucesso com ${prizesArray.length} prêmios!`, "success");
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

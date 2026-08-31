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
let activeRaffleId = "rifa-107";
let activeTab = "tab-rifas";
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
document.addEventListener("DOMContentLoaded", async () => {
  await initAppState();
  setupEventListeners();
  renderAll();
});

/* ==========================================================================
   State & Persistence Management
   ========================================================================== */
function updateDbStatusBadge(isOnline) {
  const badge = document.getElementById("dbStatusBadge");
  const text = document.getElementById("dbStatusText");
  if (!badge || !text) return;

  if (isOnline) {
    badge.className = "db-status-badge online";
    badge.title = "Banco de Dados SQLite nativo ativo e sincronizado!";
    text.textContent = "SQLite Conectado";
  } else {
    badge.className = "db-status-badge offline";
    badge.title = "Atenção: Modo Local (offline). Abra pelo atalho da Área de Trabalho para conectar ao SQLite!";
    text.textContent = "Modo Local (Offline)";
  }
}

async function initAppState() {
  try {
    const res = await fetch("/api/data");
    if (res.ok) {
      const serverData = await res.json();
      appData = serverData;
      if (!appData.fishingBookings) appData.fishingBookings = [];
      if (!appData.ranchoBookings) appData.ranchoBookings = [];
      isConnectedToBackend = true;
      console.log("Conectado ao Banco de Dados SQLite nativo!");
      updateDbStatusBadge(true);
    } else {
      throw new Error("Backend API unavailable");
    }
  } catch (err) {
    console.log("Modo local ativo.");
    isConnectedToBackend = false;
    updateDbStatusBadge(false);
    const saved = localStorage.getItem("ELDORADO_PESCA_STORE_DATA");
    if (saved) {
      try {
        appData = JSON.parse(saved);
        if (!appData.settings) appData.settings = INITIAL_SAMPLE_DATA.settings;
        if (!appData.raffles || appData.raffles.length === 0) appData.raffles = INITIAL_SAMPLE_DATA.raffles;
        if (!appData.valesAndPrizes) appData.valesAndPrizes = INITIAL_SAMPLE_DATA.valesAndPrizes;
        if (!appData.eduardoWorkDays) appData.eduardoWorkDays = INITIAL_SAMPLE_DATA.eduardoWorkDays;
        if (!appData.fishingBookings) appData.fishingBookings = INITIAL_SAMPLE_DATA.fishingBookings || [];
        if (!appData.ranchoBookings) appData.ranchoBookings = INITIAL_SAMPLE_DATA.ranchoBookings || [];
      } catch (e) {
        appData = JSON.parse(JSON.stringify(INITIAL_SAMPLE_DATA));
      }
    } else {
      appData = JSON.parse(JSON.stringify(INITIAL_SAMPLE_DATA));
    }
  }

  if (appData.raffles && appData.raffles.length > 0) {
    const active = appData.raffles.find(r => r.status === 'active') || appData.raffles[0];
    activeRaffleId = active.id;
  }
}

async function saveState() {
  localStorage.setItem("ELDORADO_PESCA_STORE_DATA", JSON.stringify(appData));
  updateGlobalStats();
}

function getActiveRaffle() {
  if (!appData.raffles || appData.raffles.length === 0) return null;
  const found = appData.raffles.find(r => String(r.id) === String(activeRaffleId));
  if (found) return found;
  return appData.raffles[0];
}

function onSelectActiveRaffle(raffleId) {
  if (!raffleId) return;
  activeRaffleId = String(raffleId);
  renderRaffleView();
  updateGlobalStats();
}

/* ==========================================================================
   Render Orchestration
   ========================================================================== */
function renderAll() {
  updateGlobalStats();
  renderRaffleDropdown();
  renderRaffleView();
  renderValesView();
  renderFishingAgendaView();
  renderRanchoView();
  renderEduardoView();
}

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
    const statusLabel = r.status === "completed" ? " (Finalizada)" : " (Ativa)";
    opt.textContent = `${r.title} - ${r.totalNumbers} Cotas${statusLabel}`;
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
  if (titleEl) titleEl.textContent = raffle.title || "Ação Eldorado Pesca";
  if (badgeEl) badgeEl.textContent = raffle.subtitle || "AÇÃO RÁPIDA";
  if (priceEl) priceEl.textContent = formatCurrency(raffle.pricePerNumber || 25);
  if (rulesEl) rulesEl.textContent = `Frete a parte - Envio para todo o Brasil.`;
  if (countEl) countEl.textContent = `Total: ${raffle.totalNumbers} números`;

  if (actionsCard) {
    actionsCard.style.display = "block";
  }

  // Render Prizes Sidebar
  const prizesListEl = document.getElementById("rafflePrizesList");
  prizesListEl.innerHTML = "";

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

    const tile = document.createElement("div");
    tile.className = `num-tile ${item.status}`;
    tile.dataset.index = index;

    // Check if this number won any prize
    const wonPrize = (raffle.prizes || []).find(p => p.winnerNumber === item.num);

    let statusTag = "";
    if (wonPrize) {
      statusTag = `<span class="num-status-tag" style="color: var(--primary-gold); font-weight: 800;">${wonPrize.position}º Lugar</span>`;
    } else if (item.status === "paid") {
      statusTag = `<span class="num-status-tag" style="color: var(--status-paid-text);">✅ Pago</span>`;
    } else if (item.status === "reserved") {
      statusTag = `<span class="num-status-tag" style="color: var(--primary-gold);">Reservado</span>`;
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

    tile.addEventListener("click", () => openEditNumberModal(index));
    gridEl.appendChild(tile);
  });
}

/* Modal: Editar Número Individual & Definir Ganhador Físico */
function openEditNumberModal(index) {
  const raffle = getActiveRaffle();
  const item = raffle.numbers[index];
  if (!item) return;

  document.getElementById("editNumIndex").value = index;
  document.getElementById("modalNumTitle").textContent = `#${item.num}`;
  document.getElementById("editNumName").value = item.name || "";

  selectEditStatus(item.status || "available");

  // Populate dynamic prize dropdown
  const selectPrizeEl = document.getElementById("selectAssignPrize");
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

  openModal("modalEditNumber");
}

let currentEditStatus = "available";
function selectEditStatus(status) {
  currentEditStatus = status;
  
  const btnAvail = document.getElementById("btnStatusAvailable");
  const btnRes = document.getElementById("btnStatusReserved");
  const btnPaid = document.getElementById("btnStatusPaid");

  btnAvail.className = "status-toggle-btn" + (status === "available" ? " selected-available" : "");
  btnRes.className = "status-toggle-btn" + (status === "reserved" ? " selected-reserved" : "");
  btnPaid.className = "status-toggle-btn" + (status === "paid" ? " selected-paid" : "");
}

async function saveNumberModal() {
  const raffle = getActiveRaffle();
  const index = parseInt(document.getElementById("editNumIndex").value, 10);
  const name = document.getElementById("editNumName").value.trim().toUpperCase();

  if (isNaN(index) || !raffle.numbers[index]) return;

  const item = raffle.numbers[index];
  item.status = currentEditStatus;
  item.name = (currentEditStatus === "available") ? "" : name;
  item.reservedAt = (currentEditStatus === "reserved") ? new Date().toISOString() : null;
  item.paidAt = (currentEditStatus === "paid") ? new Date().toISOString() : null;

  if (isConnectedToBackend) {
    try {
      await fetch("/api/raffles/number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raffleId: raffle.id,
          num: item.num,
          name: item.name,
          status: item.status,
          reservedAt: item.reservedAt,
          paidAt: item.paidAt
        })
      });
    } catch (e) {
      console.warn("Backend sync failed, saved locally", e);
    }
  }

  saveState();
  renderRaffleNumbersGrid();
  closeModal("modalEditNumber");
  showToast(`Cota #${item.num} atualizada com sucesso!`, "success");
}

/* Sorteio Físico na Loja: Definir Cota como Ganhadora e Sincronizar com Vales & Prêmios */
async function assignPrizeWinner() {
  const raffle = getActiveRaffle();
  const index = parseInt(document.getElementById("editNumIndex").value, 10);
  const name = document.getElementById("editNumName").value.trim().toUpperCase();

  if (isNaN(index) || !raffle.numbers[index]) return;
  const item = raffle.numbers[index];

  const winnerName = name || item.name || `Cota #${item.num}`;
  const position = parseInt(document.getElementById("selectAssignPrize").value, 10) || 1;

  // Find prize description
  const prizeObj = (raffle.prizes || []).find(p => p.position === position) || { position: position, description: `${position}º Prêmio` };
  const prizeDesc = prizeObj.description;

  // Mark in local state
  prizeObj.winnerNumber = item.num;
  prizeObj.winnerName = winnerName;
  item.status = "paid";
  item.name = winnerName;

  // Check if dual choice (Diária OU Vale), vale compras, or physical prize
  const isDualChoice = /diaria.*ou.*vale|vale.*ou.*diaria|\bou\b/i.test(prizeDesc) && (/diaria|diária|pesca/i.test(prizeDesc) || /vale/i.test(prizeDesc));
  const isVale = !isDualChoice && /vale/i.test(prizeDesc);
  let initialAmount = 0;

  const matchAmount = prizeDesc.match(/(\d+[\.,]?\d*)/);
  if (matchAmount) {
    initialAmount = parseFloat(matchAmount[1].replace('.', '').replace(',', '.')) || 0;
  }

  let entryType = "premio_fisico";
  let entryStatus = "pending_pickup";

  if (isDualChoice) {
    entryType = "dual_choice";
    entryStatus = "pending_choice";
  } else if (isVale) {
    entryType = "vale_compras";
    entryStatus = "active";
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
    notes: isDualChoice ? "Ganhador pendente de escolha (Diária de Pesca ou Vale-Compras)" : "Ganhador sorteado na loja"
  };

  if (isConnectedToBackend) {
    try {
      await fetch("/api/raffles/winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raffleId: raffle.id,
          num: item.num,
          position: position,
          prizeDescription: prizeDesc,
          winnerName: winnerName
        })
      });
    } catch (e) {
      console.warn("Backend assign winner failed", e);
    }
  }

  appData.valesAndPrizes.unshift(newValeEntry);
  saveState();
  renderRaffleView();
  renderValesView();
  renderFishingAgendaView();
  closeModal("modalEditNumber");
  
  if (isDualChoice) {
    showToast(`Cota #${item.num} (${winnerName}) ganhou ${position}º Lugar! Pendente de escolha (Diária ou Vale) em Vales & Prêmios.`, "success");
  } else if (/diaria|diária|pesca|lago|rancho/i.test(prizeDesc)) {
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

  if (isConnectedToBackend && updatedList.length > 0) {
    try {
      await fetch("/api/raffles/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raffleId: raffle.id,
          numbers: updatedList
        })
      });
    } catch (e) {
      console.warn("Backend batch update failed, saved locally", e);
    }
  }

  saveState();
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
    if (isConnectedToBackend) {
      toDelete.forEach(b => {
        fetch(`/api/fishing/booking/${b.id}`, { method: "DELETE" }).catch(e => console.warn("Backend delete sync failed", e));
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
    if (isDualPending) {
      typeBadge = `<span class="badge-pill badge-choice">A Decidir (Diária ou Vale)</span>`;
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
            Ganhador ainda <strong>não decidiu</strong>. Escolha Diária ou Vale abaixo:
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
      actionsHtml = `
        <button class="btn btn-gold btn-sm" onclick="openNewFishingBookingFromPrize('${item.id}')" title="Escolheu Diária e vai agendar datas">
          Diária (Agendar)
        </button>
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" style="border-color: var(--primary-gold); color: var(--primary-gold);">
          Vale R$ 450
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações">
          Editar
        </button>
        <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
          Excluir
        </button>
      `;
    } else if (isDualSchedule) {
      actionsHtml = `
        <button class="btn btn-gold btn-sm" onclick="openNewFishingBookingFromPrize('${item.id}')" title="Agendar datas no calendário">
          Agendar Datas
        </button>
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" title="Trocar por vale-compras de R$ 450">
          Trocar p/ Vale
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações">
          Editar
        </button>
        <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
          Excluir
        </button>
      `;
    } else if (isScheduled) {
      actionsHtml = `
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('tabBtnAgenda').click()" style="border-color: #10b981; color: #34d399;" title="Ver na Agenda de Pesca">
          Ver na Agenda
        </button>
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" title="Cancelar agendamento e trocar por vale-compras de R$ 450">
          Trocar p/ Vale
        </button>
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações">
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
        <button class="btn btn-secondary btn-sm" onclick="openEditPrizeModal('${item.id}')" title="Editar Informações">
          Editar
        </button>
        <button class="btn btn-secondary btn-sm" onclick="deleteValeItem('${item.id}')" title="Excluir" style="margin-left: auto;">
          Excluir
        </button>
      `;
    } else {
      if (item.status === "pending_pickup") {
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
  } else if (item.status === "delivered") {
    choiceSelect.value = "delivered";
  } else {
    choiceSelect.value = "pending_choice";
  }

  openModal("modalEditValePrize");
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
    // Se mudou de ideia e voltou para 'A Decidir', remove automaticamente o agendamento da Agenda de Pesca
    removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "diaria") {
    item.type = "dual_choice";
    item.status = "pending_schedule";
    // Se colocou como 'Aguardando Agendamento / Escolhendo o dia', remove agendamento antigo para reagendar
    removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "scheduled") {
    item.type = "dual_choice";
    item.status = "scheduled";
    // Sincroniza nome e telefone no agendamento existente caso tenha mudado
    const linked = (appData.fishingBookings || []).find(b => b.prizeId === item.id || ((b.clientName || '').trim().toUpperCase() === oldName.trim().toUpperCase() && b.bookingType === 'raffle_prize'));
    if (linked) {
      linked.clientName = newName;
      linked.clientPhone = newPhone;
    }
  } else if (newChoice === "vale") {
    item.type = "vale_compras";
    item.status = "active";
    if (!item.currentBalance || item.currentBalance === 0) item.currentBalance = item.initialAmount || 450.00;
    // Se optou pelo vale de compras, remove qualquer agendamento da pesca imediatamente
    removeLinkedFishingBookings(item.id, oldName);
  } else if (newChoice === "delivered") {
    item.status = "delivered";
    item.deliveredAt = item.deliveredAt || new Date().toISOString();
    if (oldStatus !== "scheduled") {
      removeLinkedFishingBookings(item.id, oldName);
    }
  }

  if (isConnectedToBackend) {
    try {
      await fetch("/api/vales/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id,
          customerName: item.customerName,
          customerPhone: item.customerPhone,
          description: item.description,
          notes: item.notes,
          type: item.type,
          status: item.status,
          currentBalance: item.currentBalance,
          initialAmount: item.initialAmount,
          deliveredAt: item.deliveredAt
        })
      });
    } catch (e) {
      console.warn("Backend update failed", e);
    }
  }

  saveState();
  renderValesView();
  renderFishingAgendaView();
  updateGlobalStats();
  closeModal("modalEditValePrize");
  showToast("Registro e agenda sincronizados com sucesso!", "success");
}

async function choosePrizeOption(valeId, choice) {
  const item = appData.valesAndPrizes.find(v => v.id === valeId);
  if (!item) return;
  const oldName = item.customerName;

  if (choice === "vale") {
    const amount = item.initialAmount || 450.00;
    item.type = "vale_compras";
    item.status = "active";
    item.initialAmount = amount;
    item.currentBalance = amount;
    item.notes = `Ganhador optou pelo Vale-Compras de ${formatCurrency(amount)}`;

    // Remove automaticamente qualquer agendamento vinculado do calendário de pesca
    removeLinkedFishingBookings(valeId, oldName);

    if (isConnectedToBackend) {
      try {
        await fetch("/api/vales/choose-option", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeId: valeId, choice: "vale", amount: amount })
        });
      } catch (e) {
        console.warn("Backend sync failed", e);
      }
    }

    saveState();
    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast(`Opção de Vale-Compras confirmada para ${item.customerName}! Saldo de ${formatCurrency(amount)} liberado e removido do calendário de pesca.`, "success");
  } else if (choice === "diaria") {
    item.type = "dual_choice";
    item.status = "pending_schedule";
    item.notes = "Ganhador optou pela Diária de Pesca (Aguardando Agendamento)";

    // Remove agendamento anterior para escolha limpa de novas datas
    removeLinkedFishingBookings(valeId, oldName);

    if (isConnectedToBackend) {
      try {
        await fetch("/api/vales/choose-option", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeId: valeId, choice: "diaria" })
        });
      } catch (e) {
        console.warn("Backend sync failed", e);
      }
    }

    saveState();
    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast(`Opção de Diária de Pesca confirmada para ${item.customerName}! Status atualizado para "Escolhendo o Dia".`, "success");
  } else if (choice === "pending_choice") {
    item.type = "dual_choice";
    item.status = "pending_choice";
    item.notes = "Ganhador pendente de escolha (Diária de Pesca ou Vale-Compras)";

    // Remove agendamento anterior para sair do calendário
    removeLinkedFishingBookings(valeId, oldName);

    if (isConnectedToBackend) {
      try {
        await fetch("/api/vales/choose-option", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeId: valeId, choice: "pending_choice" })
        });
      } catch (e) {
        console.warn("Backend sync failed", e);
      }
    }

    saveState();
    renderValesView();
    renderFishingAgendaView();
    updateGlobalStats();
    showToast(`Status de ${item.customerName} atualizado para "A Decidir (Diária ou Vale)".`, "success");
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

  if (isConnectedToBackend) {
    try {
      const res = await fetch("/api/vales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEntry)
      });
      const data = await res.json();
      if (data.valeId) newEntry.id = data.valeId;
    } catch (e) {
      console.warn("Backend save vale failed", e);
    }
  }

  appData.valesAndPrizes.unshift(newEntry);
  saveState();
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

  if (isConnectedToBackend) {
    try {
      await fetch("/api/vales/abater", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valeId: valeId,
          date: dateVal,
          item: itemName,
          amount: abaterVal,
          registeredBy: "Loja"
        })
      });
    } catch (e) {
      console.warn("Backend abater failed", e);
    }
  }

  saveState();
  renderValesView();
  closeModal("modalAbaterProduto");
  showToast(`Baixa realizada! Novo saldo de ${item.customerName}: ${formatCurrency(newBalance)}`, "success");
}

/* Modal: REGISTRAR TROCA DE PRÊMIO POR OUTRO PRODUTO */
function openExchangePrizeModal(prizeId) {
  const item = appData.valesAndPrizes.find(v => v.id === prizeId);
  if (!item) return;

  document.getElementById("exchangePrizeId").value = prizeId;
  document.getElementById("exchangeClientName").textContent = item.customerName;
  document.getElementById("exchangeOriginalItem").textContent = item.description;
  document.getElementById("exchangeNewItemName").value = "";
  document.getElementById("exchangeDifferencePaid").value = "0.00";
  document.getElementById("exchangeDate").value = getLocalDateStr();
  document.getElementById("exchangeNotes").value = "";

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

  if (isConnectedToBackend) {
    try {
      await fetch("/api/vales/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          valeId: prizeId,
          exchangedItem: newItem,
          differencePaid: diffPaid,
          exchangeNotes: notes,
          exchangedAt: exDate
        })
      });
    } catch (e) {
      console.warn("Backend exchange failed", e);
    }
  }

  saveState();
  renderValesView();
  closeModal("modalExchangePrize");
  showToast(`Troca registrada com sucesso! ${item.customerName} levou: ${newItem}`, "success");
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

    if (isConnectedToBackend) {
      try {
        await fetch("/api/vales/deliver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valeId: prizeId })
        });
      } catch (e) {
        console.warn("Backend deliver prize failed", e);
      }
    }

    saveState();
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

    if (isConnectedToBackend) {
      try {
        await fetch(`/api/vales/${id}`, { method: "DELETE" });
      } catch (e) {
        console.warn("Backend delete vale failed", e);
      }
    }

    saveState();
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

    let actionButtonsHtml = "";
    if (item.status === "pending_choice" || item.type === "dual_choice") {
      actionButtonsHtml = `
        <button class="btn btn-gold btn-sm" onclick="openNewFishingBookingFromPrize('${item.id}')" title="Escolheu a diária de pesca e vai definir as datas">
          Diária de Pesca
        </button>
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" title="Escolheu o vale-compras na loja">
          Vale-Compras (R$ 450)
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
        <button class="btn btn-secondary btn-sm" onclick="choosePrizeOption('${item.id}', 'vale')" title="Trocar por vale-compras">
          Trocar p/ Vale (R$ 450)
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

    item.addEventListener("click", () => {
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

    if (isConnectedToBackend) {
      try {
        const res = await fetch("/api/fishing/booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bookingData)
        });
        const data = await res.json();
        if (data.bookingId) bookingData.id = data.bookingId;
      } catch (e) {
        console.warn("Backend save fishing booking failed", e);
      }
    }

    if (!appData.fishingBookings) appData.fishingBookings = [];
    const existingIdx = appData.fishingBookings.findIndex(b => b.id === bookingData.id || (prizeId && b.prizeId === prizeId));
    if (existingIdx >= 0) {
      appData.fishingBookings[existingIdx] = bookingData;
    } else {
      appData.fishingBookings.push(bookingData);
    }

    saveState();
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

    if (isConnectedToBackend) {
      try {
        await fetch(`/api/fishing/booking/${bookingId}`, { method: "DELETE" });
      } catch (e) {
        console.warn("Backend delete fishing booking failed", e);
      }
    }

    saveState();
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

    if (isConnectedToBackend) {
      try {
        await fetch("/api/fishing/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: id,
            addAmount: payVal,
            paymentMethod: "Pix",
            notes: b.notes
          })
        });
      } catch (e) {
        console.warn("Backend payment update failed", e);
      }
    }

    saveState();
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
  msg += `• Guia: *${b.guideName || 'Thiago Witeck (Titular)'}*\n`;
  msg += `• Estrutura: Embarcação completa com motor elétrico, gasolina inclusa e internet Starlink no rancho.\n\n`;

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

    item.addEventListener("click", () => openEditRanchoBookingModal(b.id));
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

  if (isConnectedToBackend) {
    try {
      const res = await fetch("/api/rancho/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData)
      });
      const data = await res.json();
      if (data.bookingId) bookingData.id = data.bookingId;
    } catch (e) {
      console.warn("Backend save rancho booking failed", e);
    }
  }

  saveState();
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

  if (isConnectedToBackend) {
    try {
      await fetch(`/api/rancho/booking/${id}`, { method: "DELETE" });
    } catch (e) {
      console.warn("Backend delete rancho booking failed", e);
    }
  }

  saveState();
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

  if (isConnectedToBackend) {
    try {
      await fetch("/api/rancho/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id,
          addAmount: payVal,
          paymentMethod: "Pix",
          notes: b.notes
        })
      });
    } catch (e) {
      console.warn("Backend rancho payment update failed", e);
    }
  }

  saveState();
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

  if (isConnectedToBackend) {
    try {
      await fetch("/api/eduardo/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateVal,
          type: currentEduardoType,
          hoursWeight: weight,
          amountDue: amountDue,
          notes: notesVal
        })
      });
    } catch (e) {
      console.warn("Backend save eduardo day failed", e);
    }
  }

  saveState();
  renderEduardoView();
  closeModal("modalEduardoDay");
  showToast(`Ponto do dia ${formatDate(dateVal)} salvo com sucesso!`, "success");
}

async function deleteEduardoDay() {
  const dateVal = document.getElementById("eduardoInputDate").value;
  appData.eduardoWorkDays = appData.eduardoWorkDays.filter(d => d.date !== dateVal);
  
  if (isConnectedToBackend) {
    try {
      await fetch(`/api/eduardo/day/${dateVal}`, { method: "DELETE" });
    } catch (e) {
      console.warn("Backend delete eduardo day failed", e);
    }
  }

  saveState();
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

  if (isConnectedToBackend) {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eduardoDailyRate: dailyRate,
          eduardoHalfRate: halfRate
        })
      });
    } catch (e) {
      console.warn("Backend save rate failed", e);
    }
  }

  saveState();
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

  showToast("Backup baixado com sucesso!", "success");
}

function handleRestoreBackupFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const restored = JSON.parse(e.target.result);
      if (!restored.raffles || !restored.valesAndPrizes) {
        throw new Error("Arquivo de backup inválido.");
      }
      appData = restored;
      saveState();
      renderAll();
      showToast("Backup restaurado com sucesso!", "success");
    } catch (err) {
      showToast("Erro ao restaurar backup: " + err.message, "warning");
    }
  };
  reader.readAsText(file);
}

/* ==========================================================================
   Quick Batch Operations
   ========================================================================== */
async function markAllReservedAsPaid() {
  const raffle = getActiveRaffle();
  let updatedList = [];
  raffle.numbers.forEach(n => {
    if (n.status === "reserved" && n.name) {
      n.status = "paid";
      n.paidAt = new Date().toISOString();
      updatedList.push(n);
    }
  });

  if (updatedList.length > 0) {
    if (isConnectedToBackend) {
      try {
        await fetch("/api/raffles/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raffleId: raffle.id, numbers: updatedList })
        });
      } catch (e) {
        console.warn("Backend batch update failed", e);
      }
    }

    saveState();
    renderRaffleView();
    showToast(`${updatedList.length} números marcados como Pagos ✅!`, "success");
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
  document.getElementById("rfTitle").value = getNextRaffleTitle();
  document.getElementById("rfPrice").value = "";
  document.getElementById("rfTotalNumbers").value = "";
  
  // Render clean dynamic prizes list (3 blank rows by default)
  const dynamicList = document.getElementById("dynamicPrizesList");
  dynamicList.innerHTML = "";
  addDynamicPrizeRow(1, "");
  addDynamicPrizeRow(2, "");
  addDynamicPrizeRow(3, "");

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
    <input type="text" class="form-input dynamic-prize-input" placeholder="Ex: Vara, Carretilha ou Vale Compras" value="${escapeHtml(val)}" style="flex-grow: 1;">
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
  const title = document.getElementById("rfTitle").value.trim();
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
  if (isNaN(totalNums) || totalNums <= 0) {
    showToast("Informe a quantidade total de números.", "warning");
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

  if (isConnectedToBackend) {
    try {
      const res = await fetch("/api/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRaffle)
      });
      const data = await res.json();
      if (data.raffleId) newRaffle.id = data.raffleId;
    } catch (e) {
      console.warn("Backend save raffle failed", e);
    }
  }

  appData.raffles.unshift(newRaffle);
  activeRaffleId = newRaffle.id;
  saveState();
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

  if (isConnectedToBackend) {
    try {
      const res = await fetch(`/api/raffles/${encodeURIComponent(raffleId)}`, {
        method: "DELETE"
      });
      if (!res.ok) {
        throw new Error(`Status ${res.status}`);
      }
    } catch (e) {
      console.warn("Backend delete raffle failed, deleting locally", e);
    }
  }

  // Remove the raffle from local state. NOTE: appData.valesAndPrizes and appData.fishingBookings remain 100% UNTOUCHED!
  appData.raffles = (appData.raffles || []).filter(r => String(r.id) !== String(raffleId));

  // Switch to next active raffle or first available
  if (appData.raffles.length > 0) {
    const nextActive = appData.raffles.find(r => r.status === "active") || appData.raffles[0];
    activeRaffleId = nextActive.id;
  } else {
    activeRaffleId = null;
  }

  saveState();
  renderAll();
  closeModal("modalDeleteRaffle");
  showToast(`Rifa "${raffleTitle}" excluída com sucesso! Os ganhadores e vales foram mantidos.`, "success");
}

/* ==========================================================================
   UI Event Handlers & Setup
   ========================================================================== */
function setupEventListeners() {
  // Navigation Tabs
  document.querySelectorAll(".nav-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      
      btn.classList.add("active");
      const targetTab = btn.dataset.tab;
      document.getElementById(targetTab).classList.add("active");
      activeTab = targetTab;
    });
  });

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
      addDynamicPrizeRow("DIÁRIA PRA DUAS PESSOAS + COMBUSTÍVEL OU VALE COMPRAS DE 450,00 NA LOJA");
    });
  }

  document.getElementById("btnMarkAllPaid").addEventListener("click", markAllReservedAsPaid);
  document.getElementById("btnEditRaffleDetails").addEventListener("click", openNewRaffleModal);

  // Number Edit Modal & Assign Winner
  document.getElementById("btnSaveNumberModal").addEventListener("click", saveNumberModal);
  document.getElementById("btnConfirmWinner").addEventListener("click", assignPrizeWinner);

  // WhatsApp Modals
  document.getElementById("btnProcessImportWhatsApp").addEventListener("click", processWhatsAppImport);
  document.getElementById("btnDoCopyExportWhatsApp").addEventListener("click", doCopyExportWhatsApp);

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
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("open");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("open");
}

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

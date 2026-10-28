/* ==========================================================================
   GodoyFin - Aplicação Principal de Controle Financeiro (Gabriel & Mirela)
   - Leitura 100% dinâmica por mês (sem valores estáticos fixados)
   - 3 Visões de Salários: Individual Gabriel, Individual Mirela e Soma do Casal
   - Layout Horizontal Lado a Lado (Despesas Gabriel | Despesas Mirela & Setores)
   ========================================================================== */

const STORAGE_KEY = 'godoyfin_state_v2';

const SECTORS = [
  {
    id: 'mercado',
    name: 'Mercado, Casa & Contas',
    shortName: 'Casa & Mercado',
    subtitle: 'Apartamento, Condomínio, Luz, Internet, Mercado, Tim, Rufino',
    emoji: '🏠',
    color: '#10b981',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    defaultLimit: 2500
  },
  {
    id: 'compras',
    name: 'Cartões, Bancos & Compras',
    shortName: 'Cartões & Compras',
    subtitle: 'Bradesco, Cartão Gabriel, Nubank, Amazon, Mercado Livre',
    emoji: '💳',
    color: '#8b5cf6',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
    defaultLimit: 1800
  },
  {
    id: 'delivery',
    name: 'Delivery & Alimentação',
    shortName: 'Delivery',
    subtitle: 'iFood, Rappi, Restaurantes, Padarias',
    emoji: '🍔',
    color: '#ef4444',
    badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20',
    defaultLimit: 600
  },
  {
    id: 'transporte',
    name: 'Transporte & Mobilidade',
    shortName: 'Transporte',
    subtitle: 'Uber, 99, Combustível, Pedágio',
    emoji: '🚗',
    color: '#475569',
    badgeClass: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20',
    defaultLimit: 450
  },
  {
    id: 'saude',
    name: 'Saúde & Cuidados',
    shortName: 'Saúde',
    subtitle: 'Farmácia, Consultas, Academia, Bem-estar',
    emoji: '💊',
    color: '#06b6d4',
    badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20',
    defaultLimit: 400
  }
];

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Estado global da aplicação (sem valores estáticos fixados; tudo dinâmico por mês)
let appState = {
  currentMonth: new Date().toISOString().slice(0, 7),
  activeSectorFilter: 'all',
  barChartMode: 'daily', // 'daily' | 'compare'
  itemsDisplayMode: 'horizontal', // 'horizontal' | 'table'
  darkMode: true,
  // Salários dinâmicos por mês { 'YYYY-MM': { gabriel: number, mirela: number } }
  monthlySalaries: {},
  sectorLimits: {
    mercado: 2500.00,
    compras: 1800.00,
    delivery: 600.00,
    transporte: 450.00,
    saude: 400.00
  },
  subscriptions: [],
  transactions: [],
  dismissedRecurringByMonth: {},
  personBoardState: {
    gabriel: { sectorFilter: 'all', collapsedSectors: {} },
    mirela: { sectorFilter: 'all', collapsedSectors: {} }
  },
  tableFilters: {
    mercado: { search: '', sort: 'recent', payment: 'all', collapsed: false },
    compras: { search: '', sort: 'recent', payment: 'all', collapsed: false },
    delivery: { search: '', sort: 'recent', payment: 'all', collapsed: false },
    transporte: { search: '', sort: 'recent', payment: 'all', collapsed: false },
    saude: { search: '', sort: 'recent', payment: 'all', collapsed: false }
  }
};

let donutChartInstance = null;
let barChartInstance = null;
let editingSubscriptionId = null;

let pendingReceiptData = {
  editingId: null,
  imageDataUrl: null,
  imageSignature: null,
  rawText: ''
};

let pendingInvoiceReview = {
  titular: 'GABRIEL GODOY LIMA',
  reversalsCount: 0,
  groupFees: false,
  items: [],
  unmergedFeeItems: []
};

/* ==========================================================================
   Persistência Local
   ========================================================================== */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      appState = {
        ...appState,
        ...parsed,
        monthlySalaries: parsed.monthlySalaries || {},
        dismissedRecurringByMonth: parsed.dismissedRecurringByMonth || {},
        personBoardState: {
          gabriel: {
            sectorFilter: parsed.personBoardState?.gabriel?.sectorFilter || 'all',
            collapsedSectors: parsed.personBoardState?.gabriel?.collapsedSectors || {}
          },
          mirela: {
            sectorFilter: parsed.personBoardState?.mirela?.sectorFilter || 'all',
            collapsedSectors: parsed.personBoardState?.mirela?.collapsedSectors || {}
          }
        },
        sectorLimits: { ...appState.sectorLimits, ...(parsed.sectorLimits || {}) },
        tableFilters: { ...appState.tableFilters, ...(parsed.tableFilters || {}) }
      };

      // Normaliza retroativamente assinaturas e transações já salvas
      if (Array.isArray(appState.subscriptions)) {
        appState.subscriptions = appState.subscriptions.map(sub => ({
          ...sub,
          merchant: String(sub.merchant || '').replace(/\s*\(50%\s*Casal\)\s*$/i, '').trim(),
          owner: (sub.owner || 'casal').toLowerCase().trim(),
          amount: parseAmountValue(sub.amount)
        }));
      }
      if (Array.isArray(appState.transactions)) {
        appState.transactions = appState.transactions.map(tx => {
          let cleanMerchant = String(tx.merchant || '').replace(/\s*\(50%\s*Casal\)\s*$/i, '').trim();
          // Corrige itens antigos salvos com nome "0,00", "BRL" ou vazios vindos de linhas quebradas do PDF
          if (!cleanMerchant || /^(?:R\$\s*)?0[.,]00$/i.test(cleanMerchant) || /^[\d.,\s+-]+$/.test(cleanMerchant) || /^(?:BRL|USD|US\$)$/i.test(cleanMerchant)) {
            cleanMerchant = 'Taxas & IOF da Fatura';
          }
          let normOwner = (tx.owner || 'casal').toLowerCase().trim();
          let normAmount = parseAmountValue(tx.amount);

          // Se houver uma assinatura fixa com o mesmo nome ou ID, sincroniza retroativamente
          const matchedSub = (appState.subscriptions || []).find(
            s => (tx.subscriptionId && s.id === tx.subscriptionId) ||
                 (s.merchant && s.merchant.toLowerCase() === cleanMerchant.toLowerCase())
          );
          if (matchedSub) {
            normOwner = matchedSub.owner || normOwner;
            if (normAmount <= 0 && matchedSub.amount > 0) {
              normAmount = matchedSub.amount;
            }
          }

          return {
            ...tx,
            merchant: cleanMerchant,
            owner: normOwner,
            amount: normAmount
          };
        });
      }
      saveState();
    } else {
      saveState();
    }
  } catch (e) {
    console.error('Erro ao carregar dados do LocalStorage:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.warn('Limite de armazenamento atingido ao salvar imagens grandes:', e);
  }
}

/**
 * Atualiza a interface de status de sincronização na nuvem, Loading Skeleton e Banner de aviso (.env)
 */
function updateCloudStatusUI({ status, message }) {
  const bannerUnconf = document.getElementById('db-unconfigured-banner');
  const unconfText = document.getElementById('db-unconfigured-text');
  const skeletonEl = document.getElementById('cloud-loading-skeleton');
  const loadingMsgEl = document.getElementById('cloud-loading-message');
  const badgeDot = document.getElementById('cloud-sync-dot');
  const badgeText = document.getElementById('cloud-sync-text');

  if (status === 'loading') {
    if (skeletonEl) skeletonEl.classList.remove('hidden');
    if (loadingMsgEl && message) loadingMsgEl.textContent = message;
    if (bannerUnconf) bannerUnconf.classList.add('hidden');
    if (badgeDot) badgeDot.className = 'w-2 h-2 rounded-full bg-purple-400 animate-ping';
    if (badgeText) badgeText.textContent = 'Sincronizando nuvem...';
    return;
  }

  if (skeletonEl) skeletonEl.classList.add('hidden');

  if (status === 'connected') {
    if (bannerUnconf) bannerUnconf.classList.add('hidden');
    if (badgeDot) badgeDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    if (badgeText) badgeText.textContent = '⚡ Supabase ativo (Tempo Real)';
    return;
  }

  if (status === 'unconfigured' || status === 'error') {
    if (bannerUnconf) bannerUnconf.classList.remove('hidden');
    if (unconfText) {
      unconfText.textContent =
        message || 'Banco de Dados não configurado. Adicione suas chaves do Supabase no arquivo .env';
    }
    if (badgeDot) badgeDot.className = 'w-2 h-2 rounded-full bg-amber-400';
    if (badgeText) badgeText.textContent = '⚠️ Modo Local (.env pendente)';
  }
}

/**
 * Inicializa a sincronização em Tempo Real (Supabase) com fallback automático para localStorage
 */
function initCloudPersistence() {
  const tryInit = () => {
    if (window.CloudDB && typeof window.CloudDB.initCloudDatabase === 'function') {
      window.CloudDB.initCloudDatabase({
        onStatusChange: (statusInfo) => {
          updateCloudStatusUI(statusInfo);
        },
        onStateChange: async (cloudData, { isFirstLoad }) => {
          const cloudEmpty =
            (!cloudData.transactions || cloudData.transactions.length === 0) &&
            (!cloudData.subscriptions || cloudData.subscriptions.length === 0) &&
            Object.keys(cloudData.monthlySalaries || {}).length === 0;

          const localHasData =
            (appState.transactions && appState.transactions.length > 0) ||
            (appState.subscriptions && appState.subscriptions.length > 0) ||
            Object.keys(appState.monthlySalaries || {}).length > 0;

          // Se o Supabase acabou de conectar pela 1ª vez e está vazio, mas há dados locais, envia para a nuvem automaticamente!
          if (isFirstLoad && cloudEmpty && localHasData) {
            await window.CloudDB.syncFullStateToCloud(appState);
            showToast('Seus dados locais foram migrados automaticamente para o Supabase!', 'success');
            return;
          }

          if (cloudData.meta) {
            if (cloudData.meta.sectorLimits) {
              appState.sectorLimits = { ...appState.sectorLimits, ...cloudData.meta.sectorLimits };
            }
            if (cloudData.meta.dismissedRecurringByMonth) {
              appState.dismissedRecurringByMonth = cloudData.meta.dismissedRecurringByMonth;
            }
          }

          if (cloudData.monthlySalaries) {
            appState.monthlySalaries = cloudData.monthlySalaries;
          }
          if (Array.isArray(cloudData.subscriptions)) {
            appState.subscriptions = cloudData.subscriptions;
          }
          if (Array.isArray(cloudData.transactions)) {
            appState.transactions = cloudData.transactions;
          }

          saveState();
          renderAll();
        }
      });
      return true;
    }
    return false;
  };

  if (tryInit()) return;

  // Se o módulo do Supabase ainda estiver carregando, aguarda de forma assíncrona antes de exibir aviso
  let attempts = 0;
  const pollInterval = setInterval(() => {
    attempts++;
    if (tryInit()) {
      clearInterval(pollInterval);
    } else if (attempts >= 40) {
      clearInterval(pollInterval);
      updateCloudStatusUI({
        status: 'unconfigured',
        message: 'Banco de Dados não configurado. Adicione suas chaves do Supabase no arquivo .env'
      });
    }
  }, 50);

  window.addEventListener('clouddb-ready', () => {
    clearInterval(pollInterval);
    tryInit();
  }, { once: true });
}

/* ==========================================================================
   Formatação e Utilitários
   ========================================================================== */

function parseAmountValue(raw) {
  if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  let str = String(raw).replace(/R\$\s?/gi, '').trim();
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const num = parseFloat(str);
  return isFinite(num) ? num : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(parseAmountValue(value));
}

function formatDateBR(isoDate = '') {
  if (!isoDate || !isoDate.includes('-')) return isoDate;
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function formatMonthLabel(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTH_NAMES[idx] || m} ${y}`;
}

function getPreviousMonth(yyyyMM) {
  const [y, m] = yyyyMM.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getSectorMeta(sectorId) {
  return SECTORS.find(s => s.id === sectorId) || SECTORS[0];
}

function getOwnerMeta(owner = 'casal') {
  if (owner === 'gabriel') {
    return { id: 'gabriel', label: 'Gabriel', emoji: '👦', badge: 'bg-blue-500/15 text-blue-500 border border-blue-500/30' };
  }
  if (owner === 'mirela') {
    return { id: 'mirela', label: 'Mirela', emoji: '👩', badge: 'bg-pink-500/15 text-pink-500 border border-pink-500/30' };
  }
  return { id: 'casal', label: 'Casal', emoji: '💑', badge: 'bg-purple-500/15 text-purple-500 border border-purple-500/30' };
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white border-emerald-500',
    warning: 'bg-amber-500 text-slate-950 border-amber-400 font-semibold',
    danger: 'bg-red-600 text-white border-red-500',
    info: 'bg-purple-700 text-white border-purple-500'
  };

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm transition-all duration-300 transform translate-y-2 opacity-0 ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

/* ==========================================================================
   Assinaturas e Gastos Fixos Recorrentes (Lançamento Automático Mensal)
   ========================================================================== */

function ensureRecurringTransactionsForMonth(yyyyMM) {
  let changed = false;
  const toUpsertCloud = [];
  const toDeleteCloud = [];
  const dismissedList = appState.dismissedRecurringByMonth?.[yyyyMM] || [];
  for (const sub of appState.subscriptions) {
    const recurringTxId = `rec_${sub.id}_${yyyyMM}`;
    const existingIdx = appState.transactions.findIndex(t => t.id === recurringTxId);

    if (!sub.active || dismissedList.includes(sub.id)) {
      if (existingIdx !== -1) {
        appState.transactions.splice(existingIdx, 1);
        toDeleteCloud.push(recurringTxId);
        changed = true;
      }
      continue;
    }

    const dayStr = String(Math.min(28, Math.max(1, Number(sub.day) || 5))).padStart(2, '0');
    const cleanMerchant = String(sub.merchant || '').replace(/\s*\(50%\s*Casal\)\s*$/i, '').trim();
    const normOwner = (sub.owner || 'casal').toLowerCase().trim();
    const numAmount = parseAmountValue(sub.amount);

    if (existingIdx === -1) {
      const recTx = {
        id: recurringTxId,
        date: `${yyyyMM}-${dayStr}`,
        time: '08:00',
        merchant: cleanMerchant,
        owner: normOwner,
        sector: sub.sector || 'mercado',
        paymentMethod: sub.paymentMethod || 'PIX',
        amount: numAmount,
        imageDataUrl: null,
        imageSignature: null,
        isRecurring: true,
        subscriptionId: sub.id
      };
      appState.transactions.push(recTx);
      toUpsertCloud.push(recTx);
      changed = true;
    } else {
      const curr = appState.transactions[existingIdx];
      const expectedDate = `${yyyyMM}-${dayStr}`;
      if (
        curr.merchant !== cleanMerchant ||
        curr.owner !== normOwner ||
        parseAmountValue(curr.amount) !== numAmount ||
        curr.sector !== (sub.sector || 'mercado') ||
        curr.paymentMethod !== (sub.paymentMethod || 'PIX') ||
        curr.date !== expectedDate
      ) {
        const updatedRecTx = {
          ...curr,
          date: expectedDate,
          merchant: cleanMerchant,
          owner: normOwner,
          sector: sub.sector || 'mercado',
          paymentMethod: sub.paymentMethod || 'PIX',
          amount: numAmount,
          isRecurring: true,
          subscriptionId: sub.id
        };
        appState.transactions[existingIdx] = updatedRecTx;
        toUpsertCloud.push(updatedRecTx);
        changed = true;
      }
    }
  }
  if (changed) {
    saveState();
    if (window.CloudDB && window.CloudDB.isConfigured()) {
      if (toUpsertCloud.length > 0) window.CloudDB.upsertMultipleTransactions(toUpsertCloud);
      if (toDeleteCloud.length > 0) window.CloudDB.deleteMultipleTransactionsByIds(toDeleteCloud);
    }
  }
}

/* ==========================================================================
   Cálculos Dinâmicos do Mês (Gabriel, Mirela e Casal Juntos - Divisão 50/50)
   ========================================================================== */

function getMonthSalaries(yyyyMM = appState.currentMonth) {
  const entry = appState.monthlySalaries?.[yyyyMM] || { gabriel: 0, mirela: 0 };
  const gabriel = parseAmountValue(entry.gabriel);
  const mirela = parseAmountValue(entry.mirela);
  return {
    gabriel,
    mirela,
    coupleTotal: gabriel + mirela
  };
}

function getMonthTransactions(yyyyMM = appState.currentMonth) {
  return appState.transactions.filter(t => t.date && t.date.startsWith(yyyyMM));
}

function calculateMonthlySummary(yyyyMM = appState.currentMonth) {
  const txs = getMonthTransactions(yyyyMM);
  const salaries = getMonthSalaries(yyyyMM);

  let totalExpense = 0;
  let expensesGabriel = 0;
  let expensesMirela = 0;
  let expensesCasalShared = 0;

  const gabrielTransactions = [];
  const mirelaTransactions = [];

  const bySector = {};
  SECTORS.forEach(s => {
    bySector[s.id] = {
      ...s,
      total: 0,
      count: 0,
      limit: Number(appState.sectorLimits[s.id] ?? s.defaultLimit),
      transactions: []
    };
  });

  for (const tx of txs) {
    const val = parseAmountValue(tx.amount);
    const cleanMerchant = String(tx.merchant || '').replace(/\s*\(50%\s*Casal\)\s*$/i, '').trim();
    const normOwner = (tx.owner || 'casal').toLowerCase().trim();

    totalExpense += val;

    if (normOwner === 'gabriel') {
      expensesGabriel += val;
      gabrielTransactions.push({
        ...tx,
        amount: val,
        displayAmount: val,
        displayMerchant: cleanMerchant,
        isSharedCouple: false
      });
    } else if (normOwner === 'mirela') {
      expensesMirela += val;
      mirelaTransactions.push({
        ...tx,
        amount: val,
        displayAmount: val,
        displayMerchant: cleanMerchant,
        isSharedCouple: false
      });
    } else {
      // Despesa marcada como "Casal": divide 50/50 entre Gabriel e Mirela
      const halfVal = val / 2;
      expensesCasalShared += val;
      expensesGabriel += halfVal;
      expensesMirela += halfVal;

      const sharedItem = {
        ...tx,
        owner: 'casal',
        amount: val,
        displayAmount: halfVal,
        fullCoupleAmount: val,
        displayMerchant: `${cleanMerchant} (50% Casal)`,
        isSharedCouple: true
      };
      gabrielTransactions.push(sharedItem);
      mirelaTransactions.push(sharedItem);
    }

    const secId = bySector[tx.sector] ? tx.sector : 'compras';
    bySector[secId].total += val;
    bySector[secId].count += 1;
    bySector[secId].transactions.push({
      ...tx,
      merchant: cleanMerchant,
      owner: normOwner === 'gabriel' || normOwner === 'mirela' ? normOwner : 'casal',
      amount: val
    });
  }

  let topVillain = null;
  for (const sec of Object.values(bySector)) {
    if (sec.total > 0 && (!topVillain || sec.total > topVillain.total)) {
      topVillain = sec;
    }
  }

  return {
    salaryGabriel: salaries.gabriel,
    salaryMirela: salaries.mirela,
    income: salaries.coupleTotal,
    expensesGabriel,
    expensesMirela,
    expensesCasalShared,
    balanceGabriel: salaries.gabriel - expensesGabriel,
    balanceMirela: salaries.mirela - expensesMirela,
    totalExpense,
    balance: salaries.coupleTotal - totalExpense,
    gabrielTransactions,
    mirelaTransactions,
    bySector,
    topVillain,
    txCount: txs.length
  };
}

/* ==========================================================================
   Detecção de Prints e Compras Duplicadas
   ========================================================================== */

function checkDuplicateTransaction({ amount, date, merchant, owner = 'casal', imageSignature, editingId = null }) {
  const normMerchant = (merchant || '').toLowerCase().trim();
  const numAmount = Number(amount) || 0;

  return appState.transactions.find(tx => {
    if (editingId && tx.id === editingId) return false;

    if (imageSignature && tx.imageSignature && imageSignature === tx.imageSignature) {
      return true;
    }

    const sameAmount = Math.abs((Number(tx.amount) || 0) - numAmount) < 0.01;
    const sameDate = tx.date === date;
    const sameOwner = (tx.owner || 'casal') === (owner || 'casal');
    const txMerchant = (tx.merchant || '').toLowerCase().trim();
    const similarMerchant =
      normMerchant.length > 2 &&
      (txMerchant.includes(normMerchant) || normMerchant.includes(txMerchant));

    return sameAmount && sameDate && sameOwner && similarMerchant;
  });
}

/* ==========================================================================
   Renderização Completa da Interface
   ========================================================================== */

function applyTheme() {
  const root = document.documentElement;
  if (appState.darkMode) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  const themeBtnText = document.getElementById('theme-toggle-label');
  if (themeBtnText) {
    themeBtnText.textContent = appState.darkMode ? 'Modo Claro' : 'Modo Escuro';
  }
}

function renderAll() {
  applyTheme();
  ensureRecurringTransactionsForMonth(appState.currentMonth);

  const summary = calculateMonthlySummary(appState.currentMonth);
  const prevMonth = getPreviousMonth(appState.currentMonth);
  const prevSummary = calculateMonthlySummary(prevMonth);

  const monthLabelEl = document.getElementById('current-month-label');
  if (monthLabelEl) {
    monthLabelEl.textContent = formatMonthLabel(appState.currentMonth);
  }

  // 1. Renderiza Seção de Salários (Individual Gabriel + Individual Mirela + Casal Juntos)
  renderSalariesAndTopCards(summary, prevSummary);

  // 2. Renderiza Quadro Horizontal Lado a Lado: DESPESAS GABRIEL | DESPESAS MIRELA
  renderCoupleHorizontalBoards(summary);

  // 3. Renderiza Abas Rápidas de Setor
  renderSectorFilterTabs(summary);

  // 4. Renderiza Tabelas de Setores na HORIZONTAL
  renderSectorTables(summary);

  // 5. Renderiza Gráficos Interativos
  renderCharts(summary, prevSummary);

  // 6. Renderiza Seção de Assinaturas e Gastos Fixos Recorrentes
  renderSubscriptionsSection();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/* ==========================================================================
   2. ABA/SEÇÃO DE SALÁRIOS (Individual Gabriel + Individual Mirela + Casal Juntos)
   ========================================================================== */

function renderSalariesAndTopCards(summary, prevSummary) {
  // Card 1: Meu Salário (Gabriel)
  const gabSalEl = document.getElementById('card-gabriel-salary');
  const gabExpEl = document.getElementById('card-gabriel-expenses');
  const gabBalEl = document.getElementById('card-gabriel-balance');

  if (gabSalEl) gabSalEl.textContent = formatCurrency(summary.salaryGabriel);
  if (gabExpEl) gabExpEl.textContent = formatCurrency(summary.expensesGabriel);
  if (gabBalEl) {
    gabBalEl.textContent = formatCurrency(summary.balanceGabriel);
    gabBalEl.className = summary.balanceGabriel >= 0
      ? 'font-extrabold text-emerald-500'
      : 'font-extrabold text-red-500';
  }

  // Card 2: Salário Dela (Mirela)
  const mirSalEl = document.getElementById('card-mirela-salary');
  const mirExpEl = document.getElementById('card-mirela-expenses');
  const mirBalEl = document.getElementById('card-mirela-balance');

  if (mirSalEl) mirSalEl.textContent = formatCurrency(summary.salaryMirela);
  if (mirExpEl) mirExpEl.textContent = formatCurrency(summary.expensesMirela);
  if (mirBalEl) {
    mirBalEl.textContent = formatCurrency(summary.balanceMirela);
    mirBalEl.className = summary.balanceMirela >= 0
      ? 'font-extrabold text-emerald-500'
      : 'font-extrabold text-red-500';
  }

  // Card 3: Salário dos 2 Juntos (Renda Total do Casal)
  const coupleIncomeEl = document.getElementById('card-couple-income');
  const coupleExpenseEl = document.getElementById('card-couple-expense');
  const coupleBalanceEl = document.getElementById('card-couple-balance');
  const coupleStatusEl = document.getElementById('card-couple-status');

  if (coupleIncomeEl) coupleIncomeEl.textContent = formatCurrency(summary.income);
  if (coupleExpenseEl) coupleExpenseEl.textContent = formatCurrency(summary.totalExpense);
  if (coupleBalanceEl) {
    coupleBalanceEl.textContent = formatCurrency(summary.balance);
    coupleBalanceEl.className = summary.balance >= 0
      ? 'text-xl sm:text-2xl font-extrabold text-emerald-500 tracking-tight'
      : 'text-xl sm:text-2xl font-extrabold text-red-500 tracking-tight';
  }
  if (coupleStatusEl) {
    const committedPct = summary.income > 0 ? Math.min(999, (summary.totalExpense / summary.income) * 100) : 0;
    coupleStatusEl.textContent = summary.income > 0
      ? `${committedPct.toFixed(0)}% da renda do casal comprometida`
      : 'Clique em Editar nos cards de salário para definir a renda';
  }

  // Card 4: Maior Vilão do Mês
  const villainTitleEl = document.getElementById('card-villain-title');
  const villainDescEl = document.getElementById('card-villain-desc');
  if (villainTitleEl && villainDescEl) {
    if (summary.topVillain) {
      const share = summary.totalExpense > 0
        ? ((summary.topVillain.total / summary.totalExpense) * 100).toFixed(0)
        : 0;
      villainTitleEl.textContent = `${summary.topVillain.emoji} ${summary.topVillain.shortName}: ${formatCurrency(summary.topVillain.total)}`;
      villainDescEl.textContent = `${share}% dos gastos combinados no mês (${summary.txCount} itens)`;
    } else {
      villainTitleEl.textContent = 'Sem gastos no mês';
      villainDescEl.textContent = 'Adicione um print (OCR) ou registre um gasto manual';
    }
  }
}

/* ==========================================================================
   3. QUADRO LADO A LADO NA HORIZONTAL: DESPESAS GABRIEL | DESPESAS MIRELA
   ========================================================================== */

function renderCoupleHorizontalBoards(summary) {
  const container = document.getElementById('couple-horizontal-boards');
  if (!container) return;

  const formatShortDayMonth = (isoDate = '') => {
    if (!isoDate || !isoDate.includes('-')) return '--/--';
    const parts = isoDate.split('-');
    return `${parts[2] || '01'}/${parts[1] || '01'}`;
  };

  const buildPersonBoardHtml = (personKey, title, emoji, accentBorder, salaryVal, totalSpent, balanceVal, txs) => {
    const computedTotalSpent = txs.reduce((acc, tx) => acc + parseAmountValue(tx.displayAmount ?? tx.amount), 0);
    const finalTotalSpent = computedTotalSpent > 0 ? computedTotalSpent : parseAmountValue(totalSpent);
    const finalBalanceVal = parseAmountValue(salaryVal) - finalTotalSpent;

    const personState = appState.personBoardState?.[personKey] || { sectorFilter: 'all', collapsedSectors: {} };
    const activeSectorFilter = personState.sectorFilter || 'all';
    const collapsedSectors = personState.collapsedSectors || {};

    // Agrupa as despesas por Setor/Categoria
    const sectorGroups = SECTORS.map(sec => {
      const items = txs.filter(tx => (tx.sector || 'mercado') === sec.id);
      const subtotal = items.reduce((acc, tx) => acc + parseAmountValue(tx.displayAmount ?? tx.amount), 0);
      return {
        sector: sec,
        items,
        subtotal
      };
    }).filter(g => g.items.length > 0);

    // Se o filtro ativo for de uma categoria que ficou vazia, volta para 'all'
    const effectiveFilter =
      activeSectorFilter !== 'all' && !sectorGroups.some(g => g.sector.id === activeSectorFilter)
        ? 'all'
        : activeSectorFilter;

    const visibleGroups =
      effectiveFilter === 'all'
        ? sectorGroups
        : sectorGroups.filter(g => g.sector.id === effectiveFilter);

    return `
      <div class="card-surface flex-1 min-w-[340px] flex flex-col justify-between overflow-hidden">
        <div>
          <!-- Cabeçalho do Bloco Individual -->
          <div class="px-4 py-3.5 border-b border-slate-200/70 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-lg shrink-0">
                ${emoji}
              </div>
              <div>
                <h3 class="font-extrabold text-sm sm:text-base tracking-tight uppercase">${title}</h3>
                <div class="text-xs text-slate-400">
                  Salário no mês: <strong class="text-emerald-500">${formatCurrency(salaryVal)}</strong>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-1.5 no-print">
              <button onclick="openQuickManualModal('mercado', '${personKey}')"
                class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-purple-600/15 hover:bg-purple-600/25 text-purple-600 dark:text-purple-300 transition flex items-center gap-1">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>+ Despesa</span>
              </button>
              <button onclick="clearPersonMonthExpenses('${personKey}')"
                title="Apagar todas as despesas de ${title} neste mês"
                class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 border border-red-500/25 transition flex items-center gap-1">
                <span>🗑️ Limpar Tudo</span>
              </button>
            </div>
          </div>

          ${txs.length === 0 ? `
            <div class="p-8 text-center text-xs sm:text-sm text-slate-400">
              Nenhuma despesa registrada em <strong>${title}</strong> para ${formatMonthLabel(appState.currentMonth)}.
              <div class="mt-3 flex items-center justify-center gap-2 no-print">
                <button onclick="openScanModal()" class="px-3 py-1.5 rounded-xl text-xs font-bold cta-scan-btn">
                  + Adicionar Print
                </button>
                <button onclick="openQuickManualModal('mercado', '${personKey}')" class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:opacity-90 transition">
                  + Adicionar Gasto
                </button>
              </div>
            </div>
          ` : `
            <!-- Filtro Rápido (Pills) por Categoria no Topo do Card -->
            <div class="px-3.5 py-2 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200/60 dark:border-white/[0.05] flex items-center gap-1.5 overflow-x-auto no-print">
              <button onclick="setPersonSectorFilter('${personKey}', 'all')"
                class="px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                  effectiveFilter === 'all'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-slate-700'
                }">
                Todas (${txs.length})
              </button>
              ${sectorGroups.map(g => {
                const isSelected = effectiveFilter === g.sector.id;
                return `
                  <button onclick="setPersonSectorFilter('${personKey}', '${g.sector.id}')"
                    class="px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex items-center gap-1 ${
                      isSelected
                        ? 'bg-purple-700 text-white shadow-sm'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-slate-700'
                    }">
                    <span>${g.sector.emoji}</span>
                    <span>${g.sector.shortName} (${g.items.length})</span>
                  </button>
                `;
              }).join('')}
            </div>

            <!-- Corpo com Scroll Interno Fixo (max-height: 480px) e Acordeões de Categoria -->
            <div class="person-board-scroll-body p-2.5 space-y-2">
              ${visibleGroups.map(group => {
                const sec = group.sector;
                const isCollapsed = Boolean(collapsedSectors[sec.id]);
                const countLabel = `${group.items.length} ${group.items.length === 1 ? 'item' : 'itens'}`;
                return `
                  <div class="rounded-xl border border-slate-200/80 dark:border-slate-800/90 bg-slate-50/40 dark:bg-slate-900/40 overflow-hidden">
                    <!-- Barra de Categoria Expansível (Acordeão) -->
                    <button type="button"
                      onclick="togglePersonCategoryAccordion('${personKey}', '${sec.id}')"
                      class="w-full px-3 py-2 flex items-center justify-between gap-2 text-left bg-slate-100/80 dark:bg-slate-800/60 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm shrink-0">${sec.emoji}</span>
                        <span class="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                          ${sec.name}
                        </span>
                        <span class="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-200/90 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 shrink-0">
                          ${countLabel}
                        </span>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <span class="text-xs font-extrabold text-red-500">${formatCurrency(group.subtotal)}</span>
                        <i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" class="w-3.5 h-3.5 text-slate-400"></i>
                      </div>
                    </button>

                    <!-- Linhas Horizontais Ultra-Compactas (max 36px por linha) -->
                    ${isCollapsed ? '' : `
                      <div class="divide-y divide-slate-200/50 dark:divide-slate-800/60">
                        ${group.items.map(tx => {
                          const labelMerchant = tx.displayMerchant || tx.merchant;
                          const shownAmount = tx.displayAmount ?? tx.amount;
                          const shortDate = formatShortDayMonth(tx.date);
                          const payLabel = tx.paymentMethod === 'Cartão de Crédito' ? 'Crédito' : (tx.paymentMethod || 'PIX');
                          return `
                            <div class="compact-expense-row px-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-200/40 dark:hover:bg-slate-800/40 transition">
                              <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                                <span class="text-[10px] font-mono text-slate-400 shrink-0 w-9">${shortDate}</span>
                                <span class="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap overflow-x-auto no-scrollbar flex-1" title="${escapeHtml(labelMerchant)}">
                                  ${escapeHtml(labelMerchant)}
                                </span>
                              </div>
                              <div class="flex items-center gap-2 shrink-0">
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hidden sm:inline-block">
                                  ${escapeHtml(payLabel)}
                                </span>
                                <span class="font-extrabold text-red-500 whitespace-nowrap text-right min-w-[68px]">
                                  ${formatCurrency(shownAmount)}
                                </span>
                                <div class="flex items-center gap-0.5 no-print">
                                  ${tx.imageDataUrl ? `
                                    <button onclick="openReceiptLightbox('${tx.id}')" class="p-1 rounded hover:bg-purple-500/20 text-purple-400" title="Ver Print">
                                      <i data-lucide="image" class="w-3 h-3"></i>
                                    </button>
                                  ` : ''}
                                  <button onclick="editTransaction('${tx.id}')" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white" title="Editar">
                                    <i data-lucide="pencil" class="w-3 h-3"></i>
                                  </button>
                                  <button onclick="deleteTransaction('${tx.id}')" class="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-500" title="Excluir">
                                    <i data-lucide="trash-2" class="w-3 h-3"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          `;
                        }).join('')}
                      </div>
                    `}
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Rodapé Igual à Planilha: TOTAL DE GASTOS + SALDO LIVRE INDIVIDUAL -->
        <div class="px-5 py-3.5 bg-slate-100/90 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span class="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              TOTAL DE GASTOS (${txs.length} ${txs.length === 1 ? 'item' : 'itens'})
            </span>
            <span class="text-lg font-extrabold text-red-500">${formatCurrency(finalTotalSpent)}</span>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-400 block">Saldo Livre Individual</span>
            <span class="text-base font-extrabold ${finalBalanceVal >= 0 ? 'text-emerald-500' : 'text-red-500'}">
              ${formatCurrency(finalBalanceVal)}
            </span>
          </div>
        </div>
      </div>
    `;
  };

  container.innerHTML =
    buildPersonBoardHtml(
      'gabriel',
      'DESPESAS GABRIEL',
      '👦',
      'border-t-blue-500',
      summary.salaryGabriel,
      summary.expensesGabriel,
      summary.balanceGabriel,
      summary.gabrielTransactions
    ) +
    buildPersonBoardHtml(
      'mirela',
      'DESPESAS MIRELA',
      '👩',
      'border-t-pink-500',
      summary.salaryMirela,
      summary.expensesMirela,
      summary.balanceMirela,
      summary.mirelaTransactions
    );
}

/* ==========================================================================
   Tabelas de Setores Dispostas na HORIZONTAL (Lado a Lado)
   ========================================================================== */

function renderSectorFilterTabs(summary) {
  const container = document.getElementById('sector-tabs-bar');
  if (!container) return;

  const allActive = appState.activeSectorFilter === 'all';
  let html = `
    <button onclick="setSectorTab('all')"
      class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
        allActive
          ? 'bg-purple-700 text-white shadow-md'
          : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-slate-700'
      }">
      <span>📊 Todos os Setores</span>
      <span class="px-2 py-0.5 rounded-full text-[11px] ${allActive ? 'bg-white/20 text-white' : 'bg-slate-300 dark:bg-slate-700'}">${summary.txCount}</span>
    </button>
  `;

  for (const s of SECTORS) {
    const secSummary = summary.bySector[s.id];
    const isActive = appState.activeSectorFilter === s.id;
    html += `
      <button onclick="setSectorTab('${s.id}')"
        class="px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
          isActive
            ? 'bg-purple-700 text-white shadow-md'
            : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-slate-700'
        }">
        <span>${s.emoji} ${s.shortName}</span>
        <span class="text-xs opacity-85">(${formatCurrency(secSummary.total)})</span>
      </button>
    `;
  }

  container.innerHTML = html;
}

function renderSectorTables(summary) {
  const wrapper = document.getElementById('sector-tables-container');
  if (!wrapper) return;

  const visibleSectors = appState.activeSectorFilter === 'all'
    ? SECTORS
    : SECTORS.filter(s => s.id === appState.activeSectorFilter);

  wrapper.className = appState.activeSectorFilter === 'all'
    ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'
    : 'grid grid-cols-1 max-w-3xl gap-6';

  wrapper.innerHTML = visibleSectors.map(sector => {
    const secData = summary.bySector[sector.id];
    const filterState = appState.tableFilters[sector.id] || { search: '', sort: 'recent', payment: 'all', collapsed: false };
    const limit = Number(secData.limit) || sector.defaultLimit;
    const spent = secData.total;
    const limitPct = limit > 0 ? (spent / limit) * 100 : 0;
    const shareOfTotalMonth = summary.totalExpense > 0 ? (spent / summary.totalExpense) * 100 : 0;

    let barColorClass = 'bg-emerald-500';
    let statusBadgeHtml = `<span class="text-[11px] font-semibold text-emerald-500">Dentro da meta (${limitPct.toFixed(0)}%)</span>`;

    if (limitPct >= 100) {
      barColorClass = 'bg-red-500';
      statusBadgeHtml = `<span class="text-[11px] font-bold text-red-500">⚠️ Teto Excedido (${limitPct.toFixed(0)}%)</span>`;
    } else if (limitPct >= 80) {
      barColorClass = 'bg-amber-500';
      statusBadgeHtml = `<span class="text-[11px] font-bold text-amber-500">⚡ Próximo do limite (${limitPct.toFixed(0)}%)</span>`;
    }

    let rows = [...secData.transactions];
    if (filterState.search.trim() !== '') {
      const q = filterState.search.toLowerCase().trim();
      rows = rows.filter(r =>
        (r.merchant || '').toLowerCase().includes(q) ||
        (r.owner || '').toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    }

    rows.sort((a, b) => {
      if (filterState.sort === 'highest') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (filterState.sort === 'lowest') return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      if (filterState.sort === 'az') return (a.merchant || '').localeCompare(b.merchant || '');
      const dtA = `${a.date || ''} ${a.time || '00:00'}`;
      const dtB = `${b.date || ''} ${b.time || '00:00'}`;
      return dtB.localeCompare(dtA);
    });

    const filteredSubtotal = rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

    return `
      <div class="card-surface flex flex-col justify-between overflow-hidden w-full" id="sector-card-${sector.id}">
        <div>
          <!-- Cabeçalho Compacto do Setor + Barra de Meta -->
          <div class="p-4 border-b border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                     style="background-color: ${sector.color}18; border: 1px solid ${sector.color}40;">
                  ${sector.emoji}
                </div>
                <div class="min-w-0">
                  <h3 class="text-sm sm:text-base font-extrabold truncate">${sector.name}</h3>
                  <p class="text-[11px] text-slate-400 truncate">${sector.subtitle}</p>
                </div>
              </div>

              <div class="text-right shrink-0">
                <div class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  ${formatCurrency(spent)}
                </div>
                <button onclick="openBudgetModal('${sector.id}')"
                  class="text-[11px] text-purple-500 hover:underline font-semibold no-print">
                  Meta: ${formatCurrency(limit)}
                </button>
              </div>
            </div>

            <!-- Barra de Teto de Gastos -->
            <div class="mt-3">
              <div class="flex items-center justify-between text-[11px] mb-1">
                ${statusBadgeHtml}
                <span class="text-slate-400">${shareOfTotalMonth.toFixed(1)}% do mês</span>
              </div>
              <div class="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full ${barColorClass} budget-progress-bar rounded-full"
                     style="width: ${Math.min(100, limitPct).toFixed(1)}%"></div>
              </div>
            </div>
          </div>

          <!-- Filtro Rápido do Setor -->
          <div class="px-4 py-2 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 no-print">
            <input type="text"
              value="${filterState.search.replace(/"/g, '&quot;')}"
              oninput="updateSectorSearch('${sector.id}', this.value)"
              placeholder="Filtrar em ${sector.shortName}..."
              class="flex-1 min-w-0 px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500" />
            <select onchange="updateSectorSort('${sector.id}', this.value)"
              class="px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
              <option value="recent" ${filterState.sort === 'recent' ? 'selected' : ''}>Recentes</option>
              <option value="highest" ${filterState.sort === 'highest' ? 'selected' : ''}>Maior R$</option>
              <option value="lowest" ${filterState.sort === 'lowest' ? 'selected' : ''}>Menor R$</option>
              <option value="az" ${filterState.sort === 'az' ? 'selected' : ''}>A-Z</option>
            </select>
            <button onclick="openQuickManualModal('${sector.id}')"
              title="Adicionar despesa em ${sector.shortName}"
              class="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-600/15 text-purple-500 hover:bg-purple-600/25 transition shrink-0">
              +
            </button>
          </div>

          <!-- Lista Vertical Compacta com Scroll Vertical Interno Limitado -->
          ${rows.length === 0 ? `
            <div class="p-6 text-center text-xs text-slate-400">
              Sem gastos em <strong>${sector.shortName}</strong> neste mês.
            </div>
          ` : `
            <div class="max-h-[300px] overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-800/70">
              ${rows.map(tx => {
                const ownerMeta = getOwnerMeta(tx.owner);
                const fullAmt = parseAmountValue(tx.amount);
                const shortDate = formatShortDayMonth(tx.date);
                const payLabel = tx.paymentMethod === 'Cartão de Crédito'
                  ? 'Crédito'
                  : tx.paymentMethod === 'Cartão de Débito'
                  ? 'Débito'
                  : (tx.paymentMethod || 'PIX');
                const ownerBadgeLabel = ownerMeta.id === 'casal'
                  ? `${ownerMeta.emoji} Casal`
                  : `${ownerMeta.emoji} ${ownerMeta.label}`;
                const ownerTooltip = ownerMeta.id === 'casal'
                  ? `Casal • ${formatCurrency(fullAmt / 2)} cada`
                  : ownerMeta.label;
                return `
                  <div class="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition">
                    <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${ownerMeta.badge}" title="${ownerTooltip}">
                        ${ownerBadgeLabel}
                      </span>
                      <span class="font-semibold text-slate-900 dark:text-slate-100 truncate flex-1" title="${escapeHtml(tx.merchant)}">
                        ${escapeHtml(tx.merchant)}
                      </span>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <span class="text-[10px] text-slate-400 whitespace-nowrap">
                        ${shortDate} • ${escapeHtml(payLabel)}
                      </span>
                      <span class="font-extrabold text-red-500 whitespace-nowrap text-right min-w-[68px]">
                        ${formatCurrency(fullAmt)}
                      </span>
                      <div class="flex items-center gap-0.5 no-print">
                        ${tx.imageDataUrl ? `
                          <button onclick="openReceiptLightbox('${tx.id}')" class="p-1 rounded hover:bg-purple-500/20 text-purple-400 transition" title="Ver Print">
                            <i data-lucide="image" class="w-3.5 h-3.5"></i>
                          </button>
                        ` : ''}
                        <button onclick="editTransaction('${tx.id}')" class="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition" title="Editar">
                          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                        </button>
                        <button onclick="deleteTransaction('${tx.id}')" class="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-500 transition" title="Excluir">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>

        <!-- Rodapé do Setor -->
        <div class="px-4 py-2.5 bg-slate-50/90 dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
          <span class="text-slate-500 dark:text-slate-400">Subtotal (${rows.length} ${rows.length === 1 ? 'item' : 'itens'})</span>
          <span class="text-sm font-extrabold text-slate-900 dark:text-white">${formatCurrency(filteredSubtotal)}</span>
        </div>
      </div>
    `;
  }).join('');
}

window.setItemsDisplayMode = function(mode) {
  appState.itemsDisplayMode = mode;
  const btnHoriz = document.getElementById('btn-display-horizontal');
  const btnTable = document.getElementById('btn-display-table');
  if (btnHoriz && btnTable) {
    btnHoriz.className = mode === 'horizontal'
      ? 'px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-700 text-white transition'
      : 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition';
    btnTable.className = mode === 'table'
      ? 'px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-700 text-white transition'
      : 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition';
  }
  renderAll();
};

/* ==========================================================================
   Gráficos Interativos (Chart.js)
   ========================================================================== */

function renderCharts(summary, prevSummary) {
  if (typeof Chart === 'undefined') return;

  const textColor = appState.darkMode ? '#cbd5e1' : '#334155';
  const gridColor = appState.darkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.08)';

  const donutCtx = document.getElementById('sectorDonutChart');
  if (donutCtx) {
    const labels = SECTORS.map(s => `${s.emoji} ${s.shortName}`);
    const dataVals = SECTORS.map(s => Number(summary.bySector[s.id]?.total.toFixed(2)) || 0);
    const colors = SECTORS.map(s => s.id === 'transporte' && appState.darkMode ? '#64748b' : s.color);

    if (donutChartInstance) donutChartInstance.destroy();
    const hasData = dataVals.some(v => v > 0);

    donutChartInstance = new Chart(donutCtx, {
      type: 'doughnut',
      data: {
        labels: hasData ? labels : ['Sem gastos no mês'],
        datasets: [{
          data: hasData ? dataVals : [1],
          backgroundColor: hasData ? colors : ['#334155'],
          borderWidth: 2,
          borderColor: appState.darkMode ? '#111827' : '#ffffff',
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: textColor,
              padding: 12,
              usePointStyle: true,
              font: { size: 11, weight: '600' }
            }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (!hasData) return ' R$ 0,00';
                const val = ctx.parsed || 0;
                const pct = summary.totalExpense > 0 ? ((val / summary.totalExpense) * 100).toFixed(1) : 0;
                return ` ${formatCurrency(val)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }

  const barCtx = document.getElementById('evolutionBarChart');
  if (barCtx) {
    if (barChartInstance) barChartInstance.destroy();

    if (appState.barChartMode === 'compare') {
      const labels = SECTORS.map(s => s.shortName);
      const currentData = SECTORS.map(s => Number((summary.bySector[s.id]?.total || 0).toFixed(2)));
      const prevData = SECTORS.map(s => Number((prevSummary.bySector[s.id]?.total || 0).toFixed(2)));

      barChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: formatMonthLabel(getPreviousMonth(appState.currentMonth)),
              data: prevData,
              backgroundColor: 'rgba(148, 163, 184, 0.45)',
              borderRadius: 6
            },
            {
              label: formatMonthLabel(appState.currentMonth),
              data: currentData,
              backgroundColor: '#820ad1',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: textColor }, grid: { display: false } },
            y: {
              ticks: { color: textColor, callback: (v) => 'R$ ' + v },
              grid: { color: gridColor }
            }
          },
          plugins: {
            legend: { labels: { color: textColor } }
          }
        }
      });
    } else {
      // Comparativo Gabriel vs Mirela por Setor no Mês Atual (incluindo 50% de cada gasto do Casal)
      const labels = SECTORS.map(s => s.shortName);
      const gabrielBySec = SECTORS.map(s =>
        summary.bySector[s.id].transactions.reduce((acc, t) => {
          const amt = parseAmountValue(t.amount);
          if (t.owner === 'gabriel') return acc + amt;
          if (t.owner !== 'mirela') return acc + (amt / 2);
          return acc;
        }, 0)
      );
      const mirelaBySec = SECTORS.map(s =>
        summary.bySector[s.id].transactions.reduce((acc, t) => {
          const amt = parseAmountValue(t.amount);
          if (t.owner === 'mirela') return acc + amt;
          if (t.owner !== 'gabriel') return acc + (amt / 2);
          return acc;
        }, 0)
      );

      barChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: '👦 Despesas Gabriel',
              data: gabrielBySec.map(v => Number(v.toFixed(2))),
              backgroundColor: '#3b82f6',
              borderRadius: 6
            },
            {
              label: '👩 Despesas Mirela',
              data: mirelaBySec.map(v => Number(v.toFixed(2))),
              backgroundColor: '#ec4899',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: textColor }, grid: { display: false } },
            y: {
              ticks: { color: textColor, callback: (v) => 'R$ ' + v },
              grid: { color: gridColor }
            }
          },
          plugins: {
            legend: { labels: { color: textColor } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
              }
            }
          }
        }
      });
    }
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ==========================================================================
   Gestão de Assinaturas e Gastos Fixos Recorrentes
   ========================================================================== */

function renderSubscriptionsSection() {
  const tbody = document.getElementById('subscriptions-tbody');
  const cardsContainer = document.getElementById('subscriptions-mobile-cards');
  const totalFixedEl = document.getElementById('subscriptions-total-badge');
  if (!tbody) return;

  const activeTotal = appState.subscriptions
    .filter(s => s.active)
    .reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

  if (totalFixedEl) {
    totalFixedEl.textContent = `Total Fixo Mensal: ${formatCurrency(activeTotal)}`;
  }

  if (appState.subscriptions.length === 0) {
    const emptyMsg = `Nenhuma assinatura ou despesa fixa cadastrada. Use os campos acima para adicionar cobranças fixas mensais.`;
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-6 text-slate-400 text-sm">
          ${emptyMsg}
        </td>
      </tr>
    `;
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div class="text-center py-6 px-4 text-slate-400 text-sm bg-slate-50/50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
          ${emptyMsg}
        </div>
      `;
    }
    return;
  }

  // Desktop Table Rows
  tbody.innerHTML = appState.subscriptions.map(sub => {
    const sec = getSectorMeta(sub.sector);
    const ownerMeta = getOwnerMeta(sub.owner);
    const fullAmt = parseAmountValue(sub.amount);
    const ownerBadgeLabel = ownerMeta.id === 'casal'
      ? `${ownerMeta.emoji} Casal • ${formatCurrency(fullAmt / 2)} cada`
      : `${ownerMeta.emoji} ${ownerMeta.label}`;
    const isEditing = editingSubscriptionId === sub.id;
    return `
      <tr class="${isEditing ? 'bg-purple-500/10' : ''}">
        <td class="font-semibold">Dia ${String(sub.day).padStart(2, '0')}</td>
        <td>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${ownerMeta.badge}">${ownerBadgeLabel}</span>
          <span class="font-bold text-slate-900 dark:text-white ml-1.5">${escapeHtml(sub.merchant)}</span>
        </td>
        <td><span class="badge-sector ${sec.badgeClass}">${sec.emoji} ${sec.shortName}</span></td>
        <td>${escapeHtml(sub.paymentMethod)}</td>
        <td class="text-right font-bold">${formatCurrency(fullAmt)}</td>
        <td class="text-right no-print">
          <div class="inline-flex items-center gap-1.5">
            <button onclick="toggleSubscriptionActive('${sub.id}')"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                sub.active
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
              }">
              ${sub.active ? 'Ativo' : 'Pausado'}
            </button>
            <button onclick="editSubscription('${sub.id}')"
              title="Editar Gasto Fixo"
              class="px-2 py-1 rounded-lg text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-500 transition inline-flex items-center gap-1">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
              <span>Editar</span>
            </button>
            <button onclick="deleteSubscription('${sub.id}')"
              title="Excluir Gasto Fixo"
              class="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-400 hover:text-red-500 transition">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Mobile Card View (< 768px)
  if (cardsContainer) {
    cardsContainer.innerHTML = appState.subscriptions.map(sub => {
      const sec = getSectorMeta(sub.sector);
      const ownerMeta = getOwnerMeta(sub.owner);
      const fullAmt = parseAmountValue(sub.amount);
      const ownerBadgeLabel = ownerMeta.id === 'casal'
        ? `${ownerMeta.emoji} Casal • ${formatCurrency(fullAmt / 2)} cada`
        : `${ownerMeta.emoji} ${ownerMeta.label}`;
      const isEditing = editingSubscriptionId === sub.id;

      return `
        <div class="p-3.5 rounded-xl border ${
          isEditing
            ? 'border-purple-500 bg-purple-500/10 shadow-sm'
            : 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 shadow-xs'
        } flex flex-col gap-2 transition">
          <!-- Linha 1: Nome da despesa em destaque (bold) e valor no lado direito -->
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold text-slate-900 dark:text-white text-sm truncate">${escapeHtml(sub.merchant)}</span>
            <span class="font-extrabold text-slate-900 dark:text-white text-sm shrink-0">${formatCurrency(fullAmt)}</span>
          </div>

          <!-- Linha 2: A badge de responsável -->
          <div class="flex items-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${ownerMeta.badge}">${ownerBadgeLabel}</span>
          </div>

          <!-- Linha 3: Dia de vencimento agrupado com badges de Setor e Pagamento -->
          <div class="flex flex-wrap items-center gap-1.5 text-xs">
            <span class="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 font-semibold text-[11px] text-slate-700 dark:text-slate-200">
              Dia ${String(sub.day).padStart(2, '0')}
            </span>
            <span class="badge-sector ${sec.badgeClass} text-[10px]">${sec.emoji} ${sec.shortName}</span>
            <span class="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-700/60 text-[10px] font-medium text-slate-600 dark:text-slate-300">
              ${escapeHtml(sub.paymentMethod)}
            </span>
          </div>

          <!-- Linha 4: Os botões de ação (Editar e Excluir) alinhados à direita no fundo -->
          <div class="flex items-center justify-between pt-2 mt-0.5 border-t border-slate-200/60 dark:border-slate-700/60 no-print">
            <button onclick="toggleSubscriptionActive('${sub.id}')"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                sub.active
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
              }">
              ${sub.active ? '● Ativo' : '○ Pausado'}
            </button>
            <div class="flex items-center gap-1.5">
              <button onclick="editSubscription('${sub.id}')"
                title="Editar Gasto Fixo"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-500/15 hover:bg-purple-500/25 text-purple-500 transition inline-flex items-center gap-1">
                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                <span>Editar</span>
              </button>
              <button onclick="deleteSubscription('${sub.id}')"
                title="Excluir Gasto Fixo"
                class="p-1.5 rounded-lg hover:bg-red-500/15 text-slate-400 hover:text-red-500 transition">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (window.lucide) window.lucide.createIcons();
}

/* ==========================================================================
   Interações de Navegação, Filtros e Modais
   ========================================================================== */

window.changeMonth = function(delta) {
  const [y, m] = appState.currentMonth.split('-').map(Number);
  const nextDate = new Date(y, m - 1 + delta, 1);
  appState.currentMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    window.CloudDB.saveMonthMeta(appState);
  }
  renderAll();
};

window.toggleDarkMode = function() {
  appState.darkMode = !appState.darkMode;
  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    window.CloudDB.saveMonthMeta(appState);
  }
  renderAll();
};

window.setBarChartMode = function(mode) {
  appState.barChartMode = mode;
  const btnDaily = document.getElementById('btn-chart-daily');
  const btnCompare = document.getElementById('btn-chart-compare');
  if (btnDaily && btnCompare) {
    btnDaily.className = mode === 'daily'
      ? 'px-3 py-1 rounded-lg text-xs font-semibold bg-purple-700 text-white'
      : 'px-3 py-1 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
    btnCompare.className = mode === 'compare'
      ? 'px-3 py-1 rounded-lg text-xs font-semibold bg-purple-700 text-white'
      : 'px-3 py-1 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
  }
  renderAll();
};

window.setSectorTab = function(sectorId) {
  appState.activeSectorFilter = sectorId;
  renderAll();
};

window.updateSectorSearch = function(sectorId, val) {
  if (!appState.tableFilters[sectorId]) return;
  appState.tableFilters[sectorId].search = val;
  const summary = calculateMonthlySummary(appState.currentMonth);
  renderSectorTables(summary);
  if (window.lucide) window.lucide.createIcons();
  const card = document.getElementById(`sector-card-${sectorId}`);
  if (card) {
    const input = card.querySelector('input[type="text"]');
    if (input) {
      input.focus();
      input.setSelectionRange(val.length, val.length);
    }
  }
};

window.updateSectorSort = function(sectorId, val) {
  if (!appState.tableFilters[sectorId]) return;
  appState.tableFilters[sectorId].sort = val;
  renderAll();
};

window.scrollToSection = function(sectionId) {
  const el = document.getElementById(sectionId);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ==========================================================================
   Fluxo Principal: Upload / Colar Print (Ctrl+V) + OCR + Modal de Confirmação
   ========================================================================== */

window.openScanModal = function() {
  pendingReceiptData = {
    editingId: null,
    imageDataUrl: null,
    imageSignature: null,
    rawText: ''
  };
  document.getElementById('scan-step-upload').classList.remove('hidden');
  document.getElementById('scan-step-processing').classList.add('hidden');
  document.getElementById('scan-step-confirm').classList.add('hidden');
  document.getElementById('duplicate-alert-banner').classList.add('hidden');
  document.getElementById('scan-modal').classList.remove('hidden');
};

window.closeScanModal = function() {
  document.getElementById('scan-modal').classList.add('hidden');
};

async function processUploadedImageDataUrl(dataUrl) {
  pendingReceiptData.imageDataUrl = dataUrl;
  pendingReceiptData.imageSignature = window.OCRService.computeImageSignature(dataUrl);

  document.getElementById('scan-step-upload').classList.add('hidden');
  document.getElementById('scan-step-processing').classList.remove('hidden');
  document.getElementById('scan-step-confirm').classList.add('hidden');

  const previewProcessingImg = document.getElementById('scan-processing-img');
  if (previewProcessingImg) {
    if (dataUrl.startsWith('data:application/pdf')) {
      previewProcessingImg.src =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 260'%3E%3Crect width='200' height='260' fill='%230f172a'/%3E%3Crect x='35' y='30' width='130' height='175' rx='14' fill='%231e293b' stroke='%238b5cf6' stroke-width='3'/%3E%3Ctext x='100' y='115' text-anchor='middle' font-family='Arial' font-weight='bold' font-size='28' fill='%23a855f7'%3EPDF%3C/text%3E%3Ctext x='100' y='145' text-anchor='middle' font-family='Arial' font-size='12' fill='%2394a3b8'%3EFatura Cart%C3%A3o%3C/text%3E%3C/svg%3E";
    } else {
      previewProcessingImg.src = dataUrl;
    }
  }

  const progressBar = document.getElementById('ocr-progress-bar');
  const progressText = document.getElementById('ocr-progress-status');

  try {
    const extracted = await window.OCRService.recognizeReceiptFromImage(
      dataUrl,
      (pct, msg) => {
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText) progressText.textContent = msg;
      },
      appState.currentMonth
    );

    // Cenário Fatura de Cartão de Crédito (PDF ou Print de Fatura com múltiplos itens)
    if (extracted && extracted.tipo === 'fatura_cartao' && Array.isArray(extracted.items)) {
      closeScanModal();
      openInvoiceReviewModal(extracted);
      return;
    }

    // Cenário B: Print de Tabela Mensal (Gabriel & Mirela) lido por OCR/Gemini Vision
    if (extracted && extracted.tipo === 'planilha_casal') {
      const targetMonth = appState.currentMonth;
      if (!appState.monthlySalaries) appState.monthlySalaries = {};
      const currentSal = appState.monthlySalaries[targetMonth] || { gabriel: 0, mirela: 0 };
      appState.monthlySalaries[targetMonth] = {
        gabriel: extracted.salarioGabriel > 0 ? Number(extracted.salarioGabriel) : currentSal.gabriel,
        mirela: extracted.salarioMirela > 0 ? Number(extracted.salarioMirela) : currentSal.mirela
      };

      let addedCount = 0;
      const newOcrTxs = [];
      const pushOCRItem = (rawItem, ownerKey) => {
        const amount = Number(rawItem.valor) || 0;
        const merchant = (rawItem.descricao || '').trim();
        if (!merchant || amount <= 0) return;
        const date = `${targetMonth}-05`;
        const sector = window.OCRService.normalizeGeminiSector(rawItem.setor, merchant);
        if (!checkDuplicateTransaction({ amount, date, merchant, owner: ownerKey })) {
          const txObj = {
            id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            amount,
            date,
            time: '12:00',
            merchant,
            owner: ownerKey,
            sector,
            paymentMethod: 'PIX',
            imageDataUrl: pendingReceiptData.imageDataUrl,
            imageSignature: null,
            isRecurring: false
          };
          appState.transactions.unshift(txObj);
          newOcrTxs.push(txObj);
          addedCount++;
        }
      };

      for (const gItem of (extracted.despesasGabriel || [])) pushOCRItem(gItem, 'gabriel');
      for (const mItem of (extracted.despesasMirela || [])) pushOCRItem(mItem, 'mirela');

      saveState();
      if (window.CloudDB && window.CloudDB.isConfigured()) {
        const updatedSal = appState.monthlySalaries[targetMonth];
        window.CloudDB.saveMonthlySalary(targetMonth, updatedSal.gabriel, updatedSal.mirela);
        if (newOcrTxs.length > 0) {
          window.CloudDB.upsertMultipleTransactions(newOcrTxs);
        }
      }
      closeScanModal();
      renderAll();
      showToast(`Print lido com sucesso! ${addedCount} despesas adicionadas no mês.`);
      return;
    }

    // Cenário A: Print de Compra Única
    pendingReceiptData.rawText = extracted.rawText || '';
    openConfirmStepWithData(extracted);
  } catch (err) {
    console.error('Erro no OCR:', err);
    showToast('Preencha ou ajuste os campos abaixo.', 'warning');
    openConfirmStepWithData({
      amount: '',
      date: `${appState.currentMonth}-${String(new Date().getDate()).padStart(2, '0')}`,
      time: new Date().toTimeString().slice(0, 5),
      merchant: '',
      owner: 'gabriel',
      sector: 'delivery',
      paymentMethod: 'PIX',
      rawText: ''
    });
  }
}

function openConfirmStepWithData(data) {
  document.getElementById('scan-step-upload').classList.add('hidden');
  document.getElementById('scan-step-processing').classList.add('hidden');
  document.getElementById('scan-step-confirm').classList.remove('hidden');

  const thumb = document.getElementById('confirm-receipt-thumb');
  const thumbWrapper = document.getElementById('confirm-thumb-wrapper');
  if (pendingReceiptData.imageDataUrl) {
    thumb.src = pendingReceiptData.imageDataUrl;
    thumbWrapper.classList.remove('hidden');
  } else {
    thumbWrapper.classList.add('hidden');
  }

  document.getElementById('confirm-amount').value = data.amount ? Number(data.amount).toFixed(2) : '';
  document.getElementById('confirm-date').value = data.date || `${appState.currentMonth}-05`;
  document.getElementById('confirm-time').value = data.time || '12:00';
  document.getElementById('confirm-merchant').value = data.merchant || '';
  document.getElementById('confirm-sector').value = data.sector || 'mercado';
  document.getElementById('confirm-payment').value = data.paymentMethod || 'PIX';
  const ownerSelect = document.getElementById('confirm-owner');
  if (ownerSelect) {
    ownerSelect.value = data.owner || 'gabriel';
  }

  validateDuplicateOnConfirmForm();
}

window.validateDuplicateOnConfirmForm = function() {
  const amount = parseFloat(document.getElementById('confirm-amount').value) || 0;
  const date = document.getElementById('confirm-date').value;
  const merchant = document.getElementById('confirm-merchant').value;
  const owner = document.getElementById('confirm-owner')?.value || 'gabriel';

  const dup = checkDuplicateTransaction({
    amount,
    date,
    merchant,
    owner,
    imageSignature: pendingReceiptData.imageSignature,
    editingId: pendingReceiptData.editingId
  });

  const banner = document.getElementById('duplicate-alert-banner');
  if (dup) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
};

window.autoClassifyConfirmMerchant = function(merchantVal) {
  if (window.OCRService && merchantVal.trim().length >= 2) {
    const suggested = window.OCRService.classifyMerchantSector(merchantVal, '');
    document.getElementById('confirm-sector').value = suggested;
  }
  validateDuplicateOnConfirmForm();
};

window.saveConfirmedTransaction = function(e) {
  if (e) e.preventDefault();

  const amount = parseAmountValue(document.getElementById('confirm-amount').value);
  const date = document.getElementById('confirm-date').value;
  const time = document.getElementById('confirm-time').value || '12:00';
  const rawMerchant = document.getElementById('confirm-merchant').value.trim() || 'Despesa Registrada';
  const merchant = rawMerchant.replace(/\s*\(50%\s*Casal\)\s*$/i, '').trim();
  const sector = document.getElementById('confirm-sector').value;
  const paymentMethod = document.getElementById('confirm-payment').value;
  const owner = document.getElementById('confirm-owner')?.value || 'gabriel';

  if (isNaN(amount) || amount <= 0) {
    showToast('Informe um valor válido maior que R$ 0,00.', 'danger');
    return;
  }

  if (pendingReceiptData.editingId) {
    const idx = appState.transactions.findIndex(t => t.id === pendingReceiptData.editingId);
    if (idx !== -1) {
      const existingTx = appState.transactions[idx];
      appState.transactions[idx] = {
        ...existingTx,
        amount,
        date,
        time,
        merchant,
        owner,
        sector,
        paymentMethod,
        imageDataUrl: pendingReceiptData.imageDataUrl ?? existingTx.imageDataUrl,
        imageSignature: pendingReceiptData.imageSignature ?? existingTx.imageSignature
      };

      // Se for uma despesa recorrente vinculada a uma assinatura fixa, sincroniza a assinatura também
      if (existingTx.subscriptionId) {
        const subIdx = appState.subscriptions.findIndex(s => s.id === existingTx.subscriptionId);
        if (subIdx !== -1) {
          const dayNum = parseInt((date || '').split('-')[2], 10);
          appState.subscriptions[subIdx] = {
            ...appState.subscriptions[subIdx],
            merchant,
            amount,
            owner,
            sector,
            paymentMethod,
            day: !isNaN(dayNum) ? Math.min(28, Math.max(1, dayNum)) : appState.subscriptions[subIdx].day
          };
        }
      }

      if (window.CloudDB && window.CloudDB.isConfigured()) {
        window.CloudDB.upsertTransaction(appState.transactions[idx]);
        if (existingTx.subscriptionId) {
          const updatedSub = appState.subscriptions.find(s => s.id === existingTx.subscriptionId);
          if (updatedSub) window.CloudDB.upsertSubscription(updatedSub);
        }
      }

      showToast('Lançamento atualizado com sucesso!');
    }
  } else {
    const newTx = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      amount,
      date,
      time,
      merchant,
      owner,
      sector,
      paymentMethod,
      imageDataUrl: pendingReceiptData.imageDataUrl,
      imageSignature: pendingReceiptData.imageSignature,
      isRecurring: false
    };
    appState.transactions.unshift(newTx);

    const txMonth = date.slice(0, 7);
    if (txMonth && txMonth.length === 7 && txMonth !== appState.currentMonth) {
      appState.currentMonth = txMonth;
    }

    if (window.CloudDB && window.CloudDB.isConfigured()) {
      window.CloudDB.upsertTransaction(newTx);
      window.CloudDB.saveMonthMeta(appState);
    }
    showToast(`Gasto de ${formatCurrency(amount)} (${merchant}) registrado!`);
  }

  saveState();
  closeScanModal();
  renderAll();
};

window.triggerDemoReceiptOCR = function(presetType) {
  if (presetType === 'fatura_bradesco') {
    const demoInvoice = window.OCRService.generateSampleBradescoStatementResult(appState.currentMonth);
    closeScanModal();
    openInvoiceReviewModal(demoInvoice);
    showToast('Fatura Bradesco carregada! Revise os itens abaixo antes de confirmar.', 'info');
    return;
  }
  const sampleDataUrl = window.OCRService.generateSampleReceiptDataUrl(presetType, appState.currentMonth);
  processUploadedImageDataUrl(sampleDataUrl);
};

/* ==========================================================================
   Pop-up Interativo de Revisão da Fatura PDF / Cartão (Bradesco Cartões)
   ========================================================================== */

window.openInvoiceReviewModal = function(invoiceData) {
  const itemsCopy = (invoiceData.items || []).map(it => ({ ...it }));
  pendingInvoiceReview = {
    titular: invoiceData.titular || 'GABRIEL GODOY LIMA',
    reversalsCount: Number(invoiceData.reversalsCount) || 0,
    groupFees: false,
    items: itemsCopy,
    unmergedFeeItems: []
  };

  const groupCheckbox = document.getElementById('invoice-group-fees-checkbox');
  if (groupCheckbox) groupCheckbox.checked = false;

  const holderBadge = document.getElementById('invoice-review-holder-badge');
  if (holderBadge) {
    holderBadge.textContent = `Titular: ${pendingInvoiceReview.titular}`;
  }

  const revBadge = document.getElementById('invoice-review-reversal-badge');
  if (revBadge) {
    if (pendingInvoiceReview.reversalsCount > 0) {
      revBadge.classList.remove('hidden');
      revBadge.textContent = `🔄 ${pendingInvoiceReview.reversalsCount} estorno(s) abatido(s) automaticamente`;
    } else {
      revBadge.classList.add('hidden');
    }
  }

  renderInvoiceReviewModalLists();
  document.getElementById('invoice-review-modal').classList.remove('hidden');
};

window.closeInvoiceReviewModal = function() {
  document.getElementById('invoice-review-modal').classList.add('hidden');
};

function buildInvoiceReviewRowHtml(item) {
  const sectorOptionsHtml = SECTORS.map(sec => `
    <option value="${sec.id}" ${item.sector === sec.id ? 'selected' : ''}>
      ${sec.emoji} ${sec.shortName}
    </option>
  `).join('');

  const dateShort = formatDateBR(item.date).slice(0, 5);

  return `
    <div id="inv-row-${item.id}" class="p-3 rounded-xl border transition ${
      item.included
        ? item.needsReview
          ? 'bg-white dark:bg-slate-900 border-amber-500/40'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
        : 'bg-slate-100/50 dark:bg-slate-900/30 border-slate-200/50 dark:border-slate-800/50 opacity-60'
    }">
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Checkbox Incluir / Ignorar -->
        <label class="inline-flex items-center gap-2 cursor-pointer select-none shrink-0">
          <input type="checkbox" ${item.included ? 'checked' : ''}
            onchange="updateInvoiceReviewItem('${item.id}', 'included', this.checked)"
            class="w-4 h-4 accent-purple-600 rounded cursor-pointer" />
          <span class="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
            ${dateShort}
          </span>
        </label>

        <!-- Nome / Descrição Editável -->
        <div class="flex-1 min-w-[180px]">
          <input type="text"
            value="${escapeHtml(item.merchant)}"
            oninput="updateInvoiceReviewItem('${item.id}', 'merchant', this.value)"
            placeholder="Nome fácil de identificar..."
            class="w-full px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500" />
          <div class="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-slate-400">
            <span>Fatura: <code class="font-mono">${escapeHtml(item.originalDescription)}</code></span>
            ${item.isReversed ? `
              <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                🔄 ${escapeHtml(item.reversalNote || 'Compra estornada na fatura')}
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Dropdown de Setor / Categoria -->
        <select onchange="updateInvoiceReviewItem('${item.id}', 'sector', this.value)"
          class="w-full sm:w-auto min-w-[155px] px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500">
          ${sectorOptionsHtml}
        </select>

        <!-- Dropdown de Responsável (Gabriel / Mirela / Casal 50-50) -->
        <select onchange="updateInvoiceReviewItem('${item.id}', 'owner', this.value)"
          class="w-full sm:w-auto min-w-[135px] px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500">
          <option value="gabriel" ${item.owner === 'gabriel' ? 'selected' : ''}>👦 Gabriel</option>
          <option value="mirela" ${item.owner === 'mirela' ? 'selected' : ''}>👩 Mirela</option>
          <option value="casal" ${item.owner === 'casal' ? 'selected' : ''}>💑 Casal (50/50)</option>
        </select>

        <!-- Valor em R$ -->
        <div class="text-right min-w-[95px] ml-auto">
          <div class="text-sm font-extrabold ${item.included ? 'text-red-500' : 'text-slate-400 line-through'}">
            ${formatCurrency(item.amount)}
          </div>
          ${item.owner === 'casal' && item.included ? `
            <span class="block text-[10px] font-bold text-purple-400">
              ${formatCurrency(item.amount / 2)} cada
            </span>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderInvoiceReviewModalLists() {
  const needsReviewListEl = document.getElementById('invoice-needs-review-list');
  const autoClassifiedListEl = document.getElementById('invoice-auto-classified-list');
  const needsReviewSectionEl = document.getElementById('invoice-needs-review-section');
  const needsReviewCountEl = document.getElementById('invoice-needs-review-count');
  const autoClassifiedCountEl = document.getElementById('invoice-auto-classified-count');

  const needsReviewItems = pendingInvoiceReview.items.filter(i => i.needsReview);
  const autoItems = pendingInvoiceReview.items.filter(i => !i.needsReview);

  if (needsReviewCountEl) needsReviewCountEl.textContent = needsReviewItems.length;
  if (autoClassifiedCountEl) autoClassifiedCountEl.textContent = autoItems.length;

  if (needsReviewSectionEl) {
    if (needsReviewItems.length === 0) {
      needsReviewSectionEl.classList.add('hidden');
    } else {
      needsReviewSectionEl.classList.remove('hidden');
    }
  }

  if (needsReviewListEl) {
    needsReviewListEl.innerHTML = needsReviewItems.map(buildInvoiceReviewRowHtml).join('');
  }

  if (autoClassifiedListEl) {
    autoClassifiedListEl.innerHTML = autoItems.length > 0
      ? autoItems.map(buildInvoiceReviewRowHtml).join('')
      : `<div class="text-xs text-slate-400 text-center py-4">Nenhum item classificado automaticamente.</div>`;
  }

  updateInvoiceReviewSummaryTotals();
  if (window.lucide) window.lucide.createIcons();
}

function updateInvoiceReviewSummaryTotals() {
  const selected = pendingInvoiceReview.items.filter(i => i.included);
  const totalSelected = selected.reduce((acc, i) => acc + parseAmountValue(i.amount), 0);

  const countEl = document.getElementById('invoice-review-selected-count');
  const totalEl = document.getElementById('invoice-review-selected-total');

  if (countEl) countEl.textContent = `${selected.length} de ${pendingInvoiceReview.items.length} itens`;
  if (totalEl) totalEl.textContent = formatCurrency(totalSelected);
}

window.updateInvoiceReviewItem = function(itemId, field, value) {
  const idx = pendingInvoiceReview.items.findIndex(i => i.id === itemId);
  if (idx === -1) return;

  if (field === 'included') {
    pendingInvoiceReview.items[idx].included = Boolean(value);
    renderInvoiceReviewModalLists();
    return;
  }

  if (field === 'merchant') {
    pendingInvoiceReview.items[idx].merchant = value;
    return;
  }

  if (field === 'sector') {
    pendingInvoiceReview.items[idx].sector = value;
    updateInvoiceReviewSummaryTotals();
    return;
  }

  if (field === 'owner') {
    pendingInvoiceReview.items[idx].owner = value;
    renderInvoiceReviewModalLists();
    return;
  }
};

window.toggleAllInvoiceItems = function(checked) {
  pendingInvoiceReview.items.forEach(item => {
    item.included = item.isReversed ? false : Boolean(checked);
  });
  renderInvoiceReviewModalLists();
};

window.toggleInvoiceGroupFees = function(shouldGroup) {
  pendingInvoiceReview.groupFees = Boolean(shouldGroup);

  if (shouldGroup) {
    const feeItems = pendingInvoiceReview.items.filter(i => i.isFeeOrTax && i.included);
    if (feeItems.length <= 1) {
      showToast('Há menos de 2 itens de taxas/encargos ativos na fatura para agrupar.', 'info');
      return;
    }
    pendingInvoiceReview.unmergedFeeItems = feeItems.map(f => ({ ...f }));
    const sumFees = feeItems.reduce((acc, f) => acc + parseAmountValue(f.amount), 0);
    const firstDate = feeItems[0].date;

    pendingInvoiceReview.items = pendingInvoiceReview.items.filter(i => !(i.isFeeOrTax && i.included));
    pendingInvoiceReview.items.push({
      id: 'inv_grouped_fees_' + Date.now(),
      date: firstDate,
      originalDescription: feeItems.map(f => f.originalDescription).join(' + '),
      merchant: 'Taxas, Parcelamentos & Encargos Cartão',
      amount: sumFees,
      owner: 'gabriel',
      sector: 'compras',
      paymentMethod: 'Cartão de Crédito',
      needsReview: false,
      isFeeOrTax: true,
      isGroupedFee: true,
      isReversed: false,
      included: true
    });
    renderInvoiceReviewModalLists();
    showToast(`${feeItems.length} taxas/encargos agrupados em 1 único lançamento (${formatCurrency(sumFees)})!`, 'info');
  } else if (pendingInvoiceReview.unmergedFeeItems.length > 0) {
    pendingInvoiceReview.items = pendingInvoiceReview.items.filter(i => !i.isGroupedFee);
    pendingInvoiceReview.items.push(...pendingInvoiceReview.unmergedFeeItems);
    pendingInvoiceReview.unmergedFeeItems = [];
    renderInvoiceReviewModalLists();
  }
};

window.confirmAndSaveInvoiceItems = function() {
  const approved = pendingInvoiceReview.items.filter(i => i.included && parseAmountValue(i.amount) > 0);
  if (approved.length === 0) {
    showToast('Selecione pelo menos 1 item da fatura para lançar.', 'warning');
    return;
  }

  let addedCount = 0;
  let totalAddedAmount = 0;
  const newInvoiceTxs = [];

  for (const item of approved) {
    const cleanMerchant = String(item.merchant || item.originalDescription || 'Compra Cartão')
      .replace(/\s*\(50%\s*Casal\)\s*$/i, '')
      .trim();
    const amount = parseAmountValue(item.amount);
    const owner = (item.owner || 'gabriel').toLowerCase().trim();
    const sector = item.sector || 'compras';
    const dayPart = (item.date || '').split('-')[2] || '10';
    const targetDate = `${appState.currentMonth}-${dayPart}`;

    const txObj = {
      id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      amount,
      date: targetDate,
      time: '12:00',
      merchant: cleanMerchant,
      owner,
      sector,
      paymentMethod: 'Cartão de Crédito',
      imageDataUrl: null,
      imageSignature: null,
      isRecurring: false
    };
    appState.transactions.unshift(txObj);
    newInvoiceTxs.push(txObj);

    addedCount++;
    totalAddedAmount += amount;
  }

  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    window.CloudDB.upsertMultipleTransactions(newInvoiceTxs);
  }
  closeInvoiceReviewModal();
  renderAll();
  showToast(
    `Fatura importada! ${addedCount} lançamentos (${formatCurrency(totalAddedAmount)}) distribuídos nas despesas.`,
    'success'
  );
};

/* ==========================================================================
   Entrada Manual Rápida, Edição e Exclusão
   ========================================================================== */

window.openQuickManualModal = function(defaultSector = 'mercado', defaultOwner = 'gabriel') {
  pendingReceiptData = {
    editingId: null,
    imageDataUrl: null,
    imageSignature: null,
    rawText: ''
  };
  document.getElementById('scan-modal').classList.remove('hidden');
  openConfirmStepWithData({
    amount: '',
    date: `${appState.currentMonth}-${String(new Date().getDate()).padStart(2, '0')}`,
    time: new Date().toTimeString().slice(0, 5),
    merchant: '',
    owner: defaultOwner,
    sector: defaultSector,
    paymentMethod: 'PIX'
  });
  setTimeout(() => {
    const merchantInput = document.getElementById('confirm-merchant');
    if (merchantInput) merchantInput.focus();
  }, 80);
};

window.editTransaction = function(txId) {
  const tx = appState.transactions.find(t => t.id === txId);
  if (!tx) return;

  pendingReceiptData = {
    editingId: tx.id,
    imageDataUrl: tx.imageDataUrl || null,
    imageSignature: tx.imageSignature || null,
    rawText: ''
  };

  document.getElementById('scan-modal').classList.remove('hidden');
  openConfirmStepWithData({
    ...tx,
    merchant: String(tx.merchant || '').replace(/\s*\(50%\s*Casal\)\s*$/i, '').trim(),
    amount: parseAmountValue(tx.amount)
  });
};

window.deleteTransaction = function(txId) {
  const idx = appState.transactions.findIndex(t => t.id === txId);
  if (idx === -1) return;
  const removed = appState.transactions[idx];
  appState.transactions.splice(idx, 1);

  // Se for um lançamento gerado por gasto fixo recorrente, remove também da lista de fixos para não recriar
  if (removed.isRecurring && removed.subscriptionId) {
    appState.subscriptions = appState.subscriptions.filter(s => s.id !== removed.subscriptionId);
  }

  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    window.CloudDB.deleteTransactionById(txId);
    if (removed.isRecurring && removed.subscriptionId) {
      window.CloudDB.deleteSubscriptionById(removed.subscriptionId);
    }
  }
  renderAll();
  showToast(`Despesa "${removed.merchant}" removida.`, 'info');
};

/* ==========================================================================
   Lightbox para Visualizar o Print Original Anexado
   ========================================================================== */

window.openReceiptLightbox = function(txId) {
  const tx = appState.transactions.find(t => t.id === txId);
  if (!tx || !tx.imageDataUrl) return;

  document.getElementById('lightbox-img').src = tx.imageDataUrl;
  document.getElementById('lightbox-caption').textContent =
    `${tx.merchant} • ${formatCurrency(tx.amount)} • ${formatDateBR(tx.date)}`;
  document.getElementById('receipt-lightbox').classList.remove('hidden');
};

window.closeReceiptLightbox = function() {
  document.getElementById('receipt-lightbox').classList.add('hidden');
};

/* ==========================================================================
   Configuração de Salários Dinâmicos do Mês (Gabriel & Mirela), Teto e Fixos
   ========================================================================== */

window.openIncomeModal = function() {
  const currentSalaries = getMonthSalaries(appState.currentMonth);
  document.getElementById('income-gabriel-input').value = currentSalaries.gabriel || '';
  document.getElementById('income-mirela-input').value = currentSalaries.mirela || '';
  document.getElementById('income-modal-month').textContent = formatMonthLabel(appState.currentMonth);
  updateIncomeModalSumPreview();
  document.getElementById('income-modal').classList.remove('hidden');
};

window.updateIncomeModalSumPreview = function() {
  const g = parseFloat(document.getElementById('income-gabriel-input')?.value) || 0;
  const m = parseFloat(document.getElementById('income-mirela-input')?.value) || 0;
  const sumEl = document.getElementById('income-modal-couple-sum');
  if (sumEl) {
    sumEl.textContent = formatCurrency(g + m);
  }
};

window.saveMonthlyIncome = function(e) {
  if (e) e.preventDefault();
  const gabrielVal = Math.max(0, parseFloat(document.getElementById('income-gabriel-input').value) || 0);
  const mirelaVal = Math.max(0, parseFloat(document.getElementById('income-mirela-input').value) || 0);

  if (!appState.monthlySalaries) appState.monthlySalaries = {};
  appState.monthlySalaries[appState.currentMonth] = {
    gabriel: gabrielVal,
    mirela: mirelaVal
  };

  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    window.CloudDB.saveMonthlySalary(appState.currentMonth, gabrielVal, mirelaVal);
  }
  renderAll();
  document.getElementById('income-modal').classList.add('hidden');
  showToast(`Salários de ${formatMonthLabel(appState.currentMonth)} atualizados!`);
};

window.openBudgetModal = function(sectorId) {
  const sec = getSectorMeta(sectorId);
  const currentLimit = appState.sectorLimits[sectorId] ?? sec.defaultLimit;
  document.getElementById('budget-modal-sector-id').value = sectorId;
  document.getElementById('budget-modal-title').textContent = `${sec.emoji} Teto de Gastos: ${sec.name}`;
  document.getElementById('budget-modal-input').value = Number(currentLimit).toFixed(2);
  document.getElementById('budget-modal').classList.remove('hidden');
};

window.saveSectorBudget = function(e) {
  if (e) e.preventDefault();
  const sectorId = document.getElementById('budget-modal-sector-id').value;
  const val = parseFloat(document.getElementById('budget-modal-input').value);
  if (sectorId && !isNaN(val) && val > 0) {
    appState.sectorLimits[sectorId] = val;
    saveState();
    if (window.CloudDB && window.CloudDB.isConfigured()) {
      window.CloudDB.saveMonthMeta(appState);
    }
    renderAll();
    document.getElementById('budget-modal').classList.add('hidden');
    showToast('Teto de gastos atualizado com sucesso!');
  }
};

window.editSubscription = function(subId) {
  const sub = appState.subscriptions.find(s => s.id === subId);
  if (!sub) return;

  editingSubscriptionId = sub.id;

  const merchantInput = document.getElementById('sub-merchant');
  const ownerInput = document.getElementById('sub-owner');
  const amountInput = document.getElementById('sub-amount');
  const dayInput = document.getElementById('sub-day');
  const sectorInput = document.getElementById('sub-sector');
  const paymentInput = document.getElementById('sub-payment');
  const submitBtn = document.getElementById('sub-submit-btn');
  const cancelBtn = document.getElementById('sub-cancel-btn');

  if (merchantInput) merchantInput.value = String(sub.merchant || '').replace(/\s*\(50%\s*Casal\)\s*$/i, '').trim();
  if (ownerInput) ownerInput.value = (sub.owner || 'casal').toLowerCase().trim();
  if (amountInput) amountInput.value = parseAmountValue(sub.amount).toFixed(2);
  if (dayInput) dayInput.value = Math.min(28, Math.max(1, Number(sub.day) || 5));
  if (sectorInput) sectorInput.value = sub.sector || 'mercado';
  if (paymentInput) paymentInput.value = sub.paymentMethod || 'PIX';

  if (submitBtn) {
    submitBtn.textContent = '💾 Salvar Alterações';
    submitBtn.className = 'w-full md:w-auto px-4 py-2.5 md:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shrink-0 whitespace-nowrap transition flex items-center justify-center';
  }
  if (cancelBtn) {
    cancelBtn.classList.remove('hidden');
    cancelBtn.className = 'w-full md:w-auto px-3.5 py-2.5 md:py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold shrink-0 whitespace-nowrap transition flex items-center justify-center';
  }

  renderSubscriptionsSection();
  if (window.lucide) window.lucide.createIcons();

  const subForm = document.getElementById('subscription-form');
  if (subForm) {
    subForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (merchantInput) {
    merchantInput.focus();
    merchantInput.select();
  }
};

window.cancelSubscriptionEdit = function() {
  editingSubscriptionId = null;
  const form = document.getElementById('subscription-form');
  if (form) form.reset();

  const dayInput = document.getElementById('sub-day');
  if (dayInput) dayInput.value = 5;

  const submitBtn = document.getElementById('sub-submit-btn');
  const cancelBtn = document.getElementById('sub-cancel-btn');
  if (submitBtn) {
    submitBtn.textContent = '+ Fixar';
    submitBtn.className = 'w-full md:w-auto px-4 py-2.5 md:py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold shrink-0 whitespace-nowrap transition flex items-center justify-center';
  }
  if (cancelBtn) {
    cancelBtn.classList.add('hidden');
  }

  renderSubscriptionsSection();
  if (window.lucide) window.lucide.createIcons();
};

window.addSubscription = function(e) {
  if (e) e.preventDefault();
  const rawMerchant = document.getElementById('sub-merchant').value.trim();
  const merchant = rawMerchant.replace(/\s*\(50%\s*Casal\)\s*$/i, '').trim();
  const amount = parseAmountValue(document.getElementById('sub-amount').value);
  const day = Math.min(28, Math.max(1, parseInt(document.getElementById('sub-day').value, 10) || 5));
  const owner = (document.getElementById('sub-owner')?.value || 'gabriel').toLowerCase().trim();
  const sector = document.getElementById('sub-sector').value || 'mercado';
  const paymentMethod = document.getElementById('sub-payment').value || 'PIX';

  if (!merchant || isNaN(amount) || amount <= 0) {
    showToast('Preencha a descrição e o valor do gasto recorrente.', 'danger');
    return;
  }

  if (editingSubscriptionId) {
    const idx = appState.subscriptions.findIndex(s => s.id === editingSubscriptionId);
    if (idx !== -1) {
      const oldSub = appState.subscriptions[idx];
      const updatedSubObj = {
        ...oldSub,
        merchant,
        owner,
        amount,
        day,
        sector,
        paymentMethod
      };
      appState.subscriptions[idx] = updatedSubObj;

      // Atualiza também quaisquer lançamentos recorrentes vinculados a esta assinatura (sem duplicar)
      const dayStr = String(day).padStart(2, '0');
      const updatedRecTxs = [];
      appState.transactions = appState.transactions.map(tx => {
        if (tx.subscriptionId === editingSubscriptionId || tx.id.startsWith(`rec_${editingSubscriptionId}_`)) {
          const txMonth = (tx.date || appState.currentMonth).slice(0, 7);
          const nextRec = {
            ...tx,
            date: `${txMonth}-${dayStr}`,
            merchant,
            owner,
            amount,
            sector,
            paymentMethod,
            isRecurring: true,
            subscriptionId: editingSubscriptionId
          };
          updatedRecTxs.push(nextRec);
          return nextRec;
        }
        return tx;
      });

      const updatedName = merchant;
      cancelSubscriptionEdit();
      ensureRecurringTransactionsForMonth(appState.currentMonth);
      saveState();
      if (window.CloudDB && window.CloudDB.isConfigured()) {
        window.CloudDB.upsertSubscription(updatedSubObj);
        if (updatedRecTxs.length > 0) {
          window.CloudDB.upsertMultipleTransactions(updatedRecTxs);
        }
      }
      renderAll();
      showToast(`Gasto fixo "${updatedName}" atualizado com sucesso!`);
      return;
    }
    editingSubscriptionId = null;
  }

  const newSub = {
    id: 'sub_' + Date.now(),
    merchant,
    owner,
    amount,
    day,
    sector,
    paymentMethod,
    active: true
  };

  appState.subscriptions.push(newSub);
  if (appState.dismissedRecurringByMonth?.[appState.currentMonth]) {
    appState.dismissedRecurringByMonth[appState.currentMonth] =
      appState.dismissedRecurringByMonth[appState.currentMonth].filter(id => id !== newSub.id);
  }
  ensureRecurringTransactionsForMonth(appState.currentMonth);
  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    window.CloudDB.upsertSubscription(newSub);
    window.CloudDB.saveMonthMeta(appState);
  }
  renderAll();
  e.target.reset();
  const dayInput = document.getElementById('sub-day');
  if (dayInput) dayInput.value = 5;
  showToast(`Gasto fixo "${merchant}" cadastrado!`);
};

window.toggleSubscriptionActive = function(subId) {
  const sub = appState.subscriptions.find(s => s.id === subId);
  if (!sub) return;
  sub.active = !sub.active;
  if (sub.active && appState.dismissedRecurringByMonth?.[appState.currentMonth]) {
    appState.dismissedRecurringByMonth[appState.currentMonth] =
      appState.dismissedRecurringByMonth[appState.currentMonth].filter(id => id !== subId);
  }
  ensureRecurringTransactionsForMonth(appState.currentMonth);
  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    window.CloudDB.upsertSubscription(sub);
    window.CloudDB.saveMonthMeta(appState);
  }
  renderAll();
};

window.deleteSubscription = function(subId) {
  if (editingSubscriptionId === subId) {
    cancelSubscriptionEdit();
  }
  const removedRecTxIds = appState.transactions
    .filter(t => t.subscriptionId === subId || t.id.startsWith(`rec_${subId}_`))
    .map(t => t.id);

  appState.subscriptions = appState.subscriptions.filter(s => s.id !== subId);
  appState.transactions = appState.transactions.filter(
    t => t.subscriptionId !== subId && !t.id.startsWith(`rec_${subId}_`)
  );
  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    window.CloudDB.deleteSubscriptionById(subId);
    if (removedRecTxIds.length > 0) {
      window.CloudDB.deleteMultipleTransactionsByIds(removedRecTxIds);
    }
  }
  renderAll();
  showToast('Gasto fixo removido.', 'info');
};

window.setPersonSectorFilter = function(personKey, sectorId) {
  if (!appState.personBoardState) {
    appState.personBoardState = {
      gabriel: { sectorFilter: 'all', collapsedSectors: {} },
      mirela: { sectorFilter: 'all', collapsedSectors: {} }
    };
  }
  if (!appState.personBoardState[personKey]) {
    appState.personBoardState[personKey] = { sectorFilter: 'all', collapsedSectors: {} };
  }
  appState.personBoardState[personKey].sectorFilter = sectorId || 'all';
  saveState();
  renderAll();
};

window.togglePersonCategoryAccordion = function(personKey, sectorId) {
  if (!appState.personBoardState) {
    appState.personBoardState = {
      gabriel: { sectorFilter: 'all', collapsedSectors: {} },
      mirela: { sectorFilter: 'all', collapsedSectors: {} }
    };
  }
  if (!appState.personBoardState[personKey]) {
    appState.personBoardState[personKey] = { sectorFilter: 'all', collapsedSectors: {} };
  }
  if (!appState.personBoardState[personKey].collapsedSectors) {
    appState.personBoardState[personKey].collapsedSectors = {};
  }
  const curr = Boolean(appState.personBoardState[personKey].collapsedSectors[sectorId]);
  appState.personBoardState[personKey].collapsedSectors[sectorId] = !curr;
  saveState();
  renderAll();
};

window.clearPersonMonthExpenses = function(personKey) {
  const targetOwner = (personKey || 'gabriel').toLowerCase();
  const otherOwner = targetOwner === 'gabriel' ? 'mirela' : 'gabriel';
  const labelPerson = targetOwner === 'gabriel' ? 'Gabriel' : 'Mirela';
  const month = appState.currentMonth;

  const monthTxs = getMonthTransactions(month);
  const hasPersonTxs = monthTxs.some(tx => {
    const o = (tx.owner || 'casal').toLowerCase();
    return o === targetOwner || o === 'casal';
  });

  if (!hasPersonTxs) {
    showToast(`Não há despesas de ${labelPerson} em ${formatMonthLabel(month)} para limpar.`, 'info');
    return;
  }

  if (!appState.dismissedRecurringByMonth) appState.dismissedRecurringByMonth = {};
  if (!Array.isArray(appState.dismissedRecurringByMonth[month])) {
    appState.dismissedRecurringByMonth[month] = [];
  }

  const updatedTransactions = [];
  const deletedCloudIds = [];
  const upsertedCloudTxs = [];

  for (const tx of appState.transactions) {
    if (!tx.date || !tx.date.startsWith(month)) {
      updatedTransactions.push(tx);
      continue;
    }

    const txOwner = (tx.owner || 'casal').toLowerCase().trim();
    if (txOwner === targetOwner) {
      if (tx.isRecurring && tx.subscriptionId) {
        if (!appState.dismissedRecurringByMonth[month].includes(tx.subscriptionId)) {
          appState.dismissedRecurringByMonth[month].push(tx.subscriptionId);
        }
      }
      deletedCloudIds.push(tx.id);
      continue;
    }

    if (txOwner === 'casal') {
      if (tx.isRecurring && tx.subscriptionId) {
        if (!appState.dismissedRecurringByMonth[month].includes(tx.subscriptionId)) {
          appState.dismissedRecurringByMonth[month].push(tx.subscriptionId);
        }
        deletedCloudIds.push(tx.id);
      }
      // Mantém apenas a metade (50%) da outra pessoa para esvaziar completamente a lista de targetOwner
      const halfAmount = parseAmountValue(tx.amount) / 2;
      const halfTx = {
        ...tx,
        id: tx.isRecurring ? `tx_half_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : tx.id,
        owner: otherOwner,
        amount: halfAmount,
        isRecurring: false,
        subscriptionId: null
      };
      updatedTransactions.push(halfTx);
      upsertedCloudTxs.push(halfTx);
      continue;
    }

    updatedTransactions.push(tx);
  }

  appState.transactions = updatedTransactions;
  if (appState.personBoardState?.[targetOwner]) {
    appState.personBoardState[targetOwner].sectorFilter = 'all';
  }
  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    if (deletedCloudIds.length > 0) window.CloudDB.deleteMultipleTransactionsByIds(deletedCloudIds);
    if (upsertedCloudTxs.length > 0) window.CloudDB.upsertMultipleTransactions(upsertedCloudTxs);
    window.CloudDB.saveMonthMeta(appState);
  }
  renderAll();
  showToast(`Todas as despesas de ${labelPerson} em ${formatMonthLabel(month)} foram removidas!`, 'info');
};

window.clearCurrentMonthData = function() {
  const month = appState.currentMonth;
  if (!appState.dismissedRecurringByMonth) appState.dismissedRecurringByMonth = {};
  appState.dismissedRecurringByMonth[month] = (appState.subscriptions || []).map(s => s.id);

  const deletedIds = appState.transactions
    .filter(t => t.date && t.date.startsWith(month))
    .map(t => t.id);

  appState.transactions = appState.transactions.filter(t => !t.date || !t.date.startsWith(month));
  if (appState.personBoardState) {
    appState.personBoardState.gabriel = { sectorFilter: 'all', collapsedSectors: {} };
    appState.personBoardState.mirela = { sectorFilter: 'all', collapsedSectors: {} };
  }
  saveState();
  if (window.CloudDB && window.CloudDB.isConfigured()) {
    if (deletedIds.length > 0) window.CloudDB.deleteMultipleTransactionsByIds(deletedIds);
    window.CloudDB.saveMonthMeta(appState);
  }
  renderAll();
  showToast(`Todos os gastos de ${formatMonthLabel(month)} foram zerados!`, 'info');
};

/* ==========================================================================
   Exportação para Excel (CSV), Relatório PDF e Backup JSON
   ========================================================================== */

window.exportMonthCSV = function() {
  const txs = getMonthTransactions(appState.currentMonth);
  const salaries = getMonthSalaries(appState.currentMonth);

  if (txs.length === 0 && salaries.coupleTotal === 0) {
    showToast('Não há dados neste mês para exportar.', 'warning');
    return;
  }

  const headers = ['Data', 'Responsável', 'Setor', 'Despesa / Estabelecimento', 'Forma de Pagamento', 'Valor (R$)'];
  const rows = txs.map(t => {
    const sec = getSectorMeta(t.sector);
    const ownerMeta = getOwnerMeta(t.owner);
    return [
      formatDateBR(t.date),
      ownerMeta.label,
      sec.name,
      `"${(t.merchant || '').replace(/"/g, '""')}"`,
      t.paymentMethod || 'PIX',
      Number(t.amount || 0).toFixed(2).replace('.', ',')
    ].join(';');
  });

  const salaryHeader = [
    `SALÁRIO GABRIEL;${salaries.gabriel.toFixed(2).replace('.', ',')};;SALÁRIO MIRELA;${salaries.mirela.toFixed(2).replace('.', ',')};SOMA CASAL;${salaries.coupleTotal.toFixed(2).replace('.', ',')}`,
    ''
  ];

  const csvContent = '\uFEFF' + salaryHeader.join('\n') + '\n' + headers.join(';') + '\n' + rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `Nosso_Bolso_Gabriel_Mirela_${appState.currentMonth}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('Planilha Excel (CSV) exportada com sucesso!');
};

window.exportPDFReport = function() {
  const menu = document.getElementById('export-dropdown-menu');
  if (menu) menu.classList.add('hidden');
  appState.activeSectorFilter = 'all';
  renderAll();
  setTimeout(() => {
    window.print();
  }, 250);
};

window.toggleExportMenu = function(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('export-dropdown-menu');
  if (menu) menu.classList.toggle('hidden');
};

document.addEventListener('click', () => {
  const menu = document.getElementById('export-dropdown-menu');
  if (menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
});

window.exportBackupJSON = function() {
  const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Nosso_Bolso_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup completo salvo com sucesso!');
};

window.importBackupJSON = function(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && Array.isArray(imported.transactions)) {
        appState = { ...appState, ...imported };
        saveState();
        if (window.CloudDB && window.CloudDB.isConfigured()) {
          await window.CloudDB.syncFullStateToCloud(appState);
        }
        renderAll();
        showToast('Backup restaurado e sincronizado com sucesso!');
      } else {
        showToast('Arquivo de backup inválido.', 'danger');
      }
    } catch (err) {
      showToast('Erro ao ler arquivo de backup.', 'danger');
    }
  };
  reader.readAsText(file);
};

const DB_ADMIN_USER = 'godoyggl';
const DB_ADMIN_PASS = '16110428Gg#';

function isDatabaseAdminUnlocked() {
  return sessionStorage.getItem('nossobolso_db_admin_unlocked') === 'true';
}

function updateDatabaseAdminUI() {
  const isUnlocked = isDatabaseAdminUnlocked();
  const lockedContainer = document.getElementById('sb-auth-locked-container');
  const unlockedContainer = document.getElementById('sb-auth-unlocked-container');
  const errorMsg = document.getElementById('sb-auth-error-msg');
  if (errorMsg) errorMsg.classList.add('hidden');

  if (isUnlocked) {
    if (lockedContainer) lockedContainer.classList.add('hidden');
    if (unlockedContainer) unlockedContainer.classList.remove('hidden');
  } else {
    if (lockedContainer) lockedContainer.classList.remove('hidden');
    if (unlockedContainer) unlockedContainer.classList.add('hidden');
    const pwdInput = document.getElementById('sb-auth-password');
    if (pwdInput) pwdInput.value = '';
  }
}

window.unlockDatabaseSettings = function() {
  const loginInput = document.getElementById('sb-auth-login')?.value.trim().toLowerCase();
  const passInput = document.getElementById('sb-auth-password')?.value;
  const errorMsg = document.getElementById('sb-auth-error-msg');

  if (loginInput === DB_ADMIN_USER && passInput === DB_ADMIN_PASS) {
    sessionStorage.setItem('nossobolso_db_admin_unlocked', 'true');
    if (errorMsg) errorMsg.classList.add('hidden');
    updateDatabaseAdminUI();
    showToast('Acesso de administrador liberado!', 'success');
  } else {
    if (errorMsg) errorMsg.classList.remove('hidden');
    showToast('Login ou senha incorretos. Acesso restrito.', 'danger');
  }
};

window.lockDatabaseSettings = function() {
  sessionStorage.removeItem('nossobolso_db_admin_unlocked');
  updateDatabaseAdminUI();
  showToast('Acesso ao Banco de Dados bloqueado com sucesso.', 'info');
};

window.openSettingsModal = function() {
  const currentKey = window.OCRService && typeof window.OCRService.getConfiguredGeminiApiKey === 'function'
    ? window.OCRService.getConfiguredGeminiApiKey()
    : (localStorage.getItem('godoyfin_gemini_api_key') || '');
  const geminiInput = document.getElementById('settings-gemini-key');
  if (geminiInput) geminiInput.value = currentKey;

  if (window.CloudDB && typeof window.CloudDB.getStoredSupabaseConfig === 'function') {
    const sbCfg = window.CloudDB.getStoredSupabaseConfig();
    const urlEl = document.getElementById('settings-sb-url');
    const anonEl = document.getElementById('settings-sb-anon-key');
    if (urlEl) urlEl.value = sbCfg.url || '';
    if (anonEl) anonEl.value = sbCfg.anonKey || '';
  }

  updateDatabaseAdminUI();
  document.getElementById('settings-modal').classList.remove('hidden');
};

window.saveSettingsModal = function(e) {
  if (e) e.preventDefault();
  const keyVal = document.getElementById('settings-gemini-key')?.value.trim() || '';
  localStorage.setItem('godoyfin_gemini_api_key', keyVal);

  // Apenas altera ou desconecta o banco se estiver autenticado como administrador
  if (isDatabaseAdminUnlocked()) {
    const sbUrl = document.getElementById('settings-sb-url')?.value.trim() || '';
    const sbAnonKey = document.getElementById('settings-sb-anon-key')?.value.trim() || '';

    if (window.CloudDB && typeof window.CloudDB.saveSupabaseConfigFromUI === 'function') {
      window.CloudDB.saveSupabaseConfigFromUI({
        VITE_SUPABASE_URL: sbUrl,
        VITE_SUPABASE_ANON_KEY: sbAnonKey
      });
    }
  }

  document.getElementById('settings-modal').classList.add('hidden');
  showToast('Configurações salvas!');
};

window.forceSyncLocalToCloud = async function() {
  if (!isDatabaseAdminUnlocked()) {
    showToast('Autentique-se como administrador para sincronizar dados com o banco.', 'warning');
    return;
  }
  if (!window.CloudDB || !window.CloudDB.isConfigured()) {
    showToast('Configure primeiro as chaves do Supabase (.env ou nos campos acima) antes de sincronizar.', 'warning');
    return;
  }
  const ok = await window.CloudDB.syncFullStateToCloud(appState);
  if (ok) {
    showToast('Todos os dados locais foram enviados para o Supabase com sucesso!', 'success');
  } else {
    showToast('Erro ao enviar dados para o Supabase. Verifique se o script SQL foi executado.', 'danger');
  }
};

/* ==========================================================================
   Eventos de Drag & Drop, Upload de Arquivo e Colar Print (Ctrl+V)
   ========================================================================== */

function setupUploadAndPasteListeners() {
  const fileInput = document.getElementById('receipt-file-input');
  const dropzone = document.getElementById('receipt-dropzone');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleImageFile(file);
      fileInput.value = '';
    });
  }

  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      const isPdfOrImage =
        file &&
        (file.type.startsWith('image/') ||
         file.type === 'application/pdf' ||
         /\.pdf$/i.test(file.name || ''));
      if (isPdfOrImage) {
        handleImageFile(file);
      } else {
        showToast('Envie uma Fatura PDF (.pdf) ou imagem de comprovante (PNG, JPG, WEBP).', 'warning');
      }
    });
  }

  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          document.getElementById('scan-modal').classList.remove('hidden');
          handleImageFile(file);
          showToast('Print colado da área de transferência! Lendo dados...', 'info');
          break;
        }
      }
    }
  });
}

function handleImageFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    processUploadedImageDataUrl(ev.target.result);
  };
  reader.readAsDataURL(file);
}

document.addEventListener('DOMContentLoaded', () => {
  document.title = 'Nosso Bolso';
  try {
    if (window.location.hash === '#nosso-bolso') {
      window.history.replaceState(null, 'Nosso Bolso', window.location.pathname + window.location.search);
    }
  } catch (e) {}
  loadState();
  setupUploadAndPasteListeners();
  renderAll();
  initCloudPersistence();
});

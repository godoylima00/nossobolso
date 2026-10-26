/**
 * ============================================================================
 * NOSSO BOLSO (GODOY-APP) — Camada de Persistência em Nuvem (Supabase Realtime)
 * Arquivo: src/lib/supabase.js
 * ============================================================================
 * Estrutura de Tabelas no Supabase:
 * 1. `meses`        -> Configurações globais (mês ativo, limites de tetos por setor).
 * 2. `salarios`     -> Salários mensais de Gabriel e Mirela vinculados ao mês.
 * 3. `despesas`     -> Todas as despesas avulsas e compras de cartão/fatura.
 * 4. `gastos_fixos` -> Assinaturas e despesas fixas recorrentes.
 *
 * Sincronização em Tempo Real:
 * - Utiliza Supabase Realtime Channels (`postgres_changes`) em todas as 4 tabelas
 *   para atualização instantânea entre PC e Celular sem recarregar a tela.
 * - Fallback automático para `localStorage` caso as chaves não estejam configuradas.
 */

(function () {
  const SUPABASE_CONFIG_STORAGE_KEY = 'nossobolso_supabase_config_v1';

  function getEnvVar(viteKey) {
    try {
      if (typeof importMetaEnv !== 'undefined' && importMetaEnv && importMetaEnv[viteKey]) {
        return String(importMetaEnv[viteKey]).trim();
      }
    } catch (_) {}

    try {
      if (typeof window !== 'undefined') {
        if (window.__VITE_ENV__ && window.__VITE_ENV__[viteKey]) {
          return String(window.__VITE_ENV__[viteKey]).trim();
        }
        if (window.GODOY_ENV && window.GODOY_ENV[viteKey]) {
          return String(window.GODOY_ENV[viteKey]).trim();
        }
      }
    } catch (_) {}

    try {
      const savedRaw = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed && parsed[viteKey]) {
          return String(parsed[viteKey]).trim();
        }
      }
    } catch (_) {}

    return '';
  }

  function buildSupabaseConfig() {
    return {
      url: getEnvVar('VITE_SUPABASE_URL') || getEnvVar('SUPABASE_URL'),
      anonKey: getEnvVar('VITE_SUPABASE_ANON_KEY') || getEnvVar('SUPABASE_ANON_KEY')
    };
  }

  function hasValidConfig(cfg) {
    return Boolean(
      cfg &&
      cfg.url &&
      cfg.anonKey &&
      cfg.url.startsWith('http') &&
      !cfg.url.includes('YOUR_') &&
      cfg.anonKey.length > 15
    );
  }

  function toMesAnoLabel(yyyyMM = '') {
    if (!yyyyMM || !yyyyMM.includes('-')) return yyyyMM;
    const parts = yyyyMM.split('-');
    if (parts[0].length === 4) {
      return `${parts[1]}-${parts[0]}`; // "10-2026"
    }
    return yyyyMM;
  }

  function fromMesAnoLabel(mesAno = '') {
    if (!mesAno || !mesAno.includes('-')) return mesAno;
    const parts = mesAno.split('-');
    if (parts[0].length === 2 && parts[1].length === 4) {
      return `${parts[1]}-${parts[0]}`; // "2026-10"
    }
    return mesAno;
  }

  let supabaseClient = null;
  let realtimeChannel = null;
  let isConfigured = false;
  let isConnected = false;
  let isInitialLoadDone = false;

  let onStateChangeCallback = null;
  let onStatusChangeCallback = null;

  const memoryCache = {
    meta: null,
    salariesByMonth: {},
    transactions: [],
    subscriptions: []
  };

  function notifyStatus(status, message = '') {
    if (typeof onStatusChangeCallback === 'function') {
      onStatusChangeCallback({
        isConfigured,
        isConnected,
        status, // 'loading' | 'connected' | 'unconfigured' | 'error'
        message
      });
    }
  }

  async function fetchAllTables() {
    if (!supabaseClient) return;
    try {
      notifyStatus('loading', 'Carregando dados do Supabase...');

      // 1. meses
      const { data: mesesData, error: errMeses } = await supabaseClient
        .from('meses')
        .select('*')
        .eq('id', 'config_global')
        .maybeSingle();

      if (!errMeses && mesesData) {
        memoryCache.meta = {
          currentMonth: fromMesAnoLabel(mesesData.mes_atual || mesesData.current_month || ''),
          sectorLimits: mesesData.sector_limits || null,
          dismissedRecurringByMonth: mesesData.dismissed_recurring || {},
          darkMode: typeof mesesData.dark_mode === 'boolean' ? mesesData.dark_mode : true
        };
      }

      // 2. salarios
      const { data: salariosData, error: errSal } = await supabaseClient
        .from('salarios')
        .select('*');

      if (!errSal && Array.isArray(salariosData)) {
        const salMap = {};
        salariosData.forEach(s => {
          const key = fromMesAnoLabel(s.mes_ano || s.referencia_iso);
          if (key) {
            salMap[key] = {
              gabriel: Number(s.gabriel) || 0,
              mirela: Number(s.mirela) || 0
            };
          }
        });
        memoryCache.salariesByMonth = salMap;
      }

      // 3. despesas
      const { data: despesasData, error: errDesp } = await supabaseClient
        .from('despesas')
        .select('*')
        .order('data', { ascending: false });

      if (!errDesp && Array.isArray(despesasData)) {
        memoryCache.transactions = despesasData.map(d => ({
          id: d.id,
          merchant: d.nome || 'Despesa',
          amount: Number(d.valor) || 0,
          sector: d.setor || 'mercado',
          owner: (d.responsavel || 'casal').toLowerCase().trim(),
          mes_ano: d.mes_ano || toMesAnoLabel((d.data || '').slice(0, 7)),
          date: d.data || '',
          time: d.hora || '12:00',
          paymentMethod: d.forma_pagamento || 'PIX',
          imageDataUrl: d.image_data_url || null,
          imageSignature: d.image_signature || null,
          isRecurring: Boolean(d.is_recurring),
          subscriptionId: d.subscription_id || null,
          updatedAt: d.updated_at || 0
        }));
      }

      // 4. gastos_fixos
      const { data: fixosData, error: errFix } = await supabaseClient
        .from('gastos_fixos')
        .select('*');

      if (!errFix && Array.isArray(fixosData)) {
        memoryCache.subscriptions = fixosData.map(f => ({
          id: f.id,
          merchant: f.nome || 'Gasto Fixo',
          amount: Number(f.valor) || 0,
          day: Number(f.dia_vencimento) || 5,
          sector: f.setor || 'mercado',
          owner: (f.responsavel || 'casal').toLowerCase().trim(),
          paymentMethod: f.forma_pagamento || 'PIX',
          active: f.ativo !== undefined ? Boolean(f.ativo) : true,
          updatedAt: f.updated_at || 0
        }));
      }

      isConnected = true;
      const firstLoad = !isInitialLoadDone;
      isInitialLoadDone = true;

      notifyStatus('connected', 'Sincronizado em tempo real (Supabase Cloud)');

      if (typeof onStateChangeCallback === 'function') {
        onStateChangeCallback(
          {
            meta: memoryCache.meta,
            monthlySalaries: memoryCache.salariesByMonth,
            transactions: memoryCache.transactions,
            subscriptions: memoryCache.subscriptions
          },
          { isFirstLoad: firstLoad }
        );
      }
    } catch (err) {
      console.error('[SupabaseDB] Erro ao carregar dados:', err);
      notifyStatus('error', 'Erro ao consultar tabelas do Supabase. Verifique se o script SQL foi executado.');
    }
  }

  function setupRealtimeListeners() {
    if (!supabaseClient) return;
    try {
      if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }

      realtimeChannel = supabaseClient
        .channel('nossobolso_realtime_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'despesas' },
          () => {
            fetchAllTables();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'salarios' },
          () => {
            fetchAllTables();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'gastos_fixos' },
          () => {
            fetchAllTables();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'meses' },
          () => {
            fetchAllTables();
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isConnected = true;
            notifyStatus('connected', 'Sincronizado em tempo real (Supabase Cloud)');
          }
        });
    } catch (err) {
      console.warn('[SupabaseDB] Falha ao assinar canal Realtime:', err);
    }
  }

  function initCloudDatabase(callbacks = {}) {
    if (callbacks.onStateChange) onStateChangeCallback = callbacks.onStateChange;
    if (callbacks.onStatusChange) onStatusChangeCallback = callbacks.onStatusChange;

    const config = buildSupabaseConfig();
    isConfigured = hasValidConfig(config);

    if (!isConfigured) {
      isConnected = false;
      notifyStatus(
        'unconfigured',
        'Banco de Dados não configurado. Adicione suas chaves do Supabase no arquivo .env'
      );
      return { configured: false };
    }

    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
      isConnected = false;
      notifyStatus(
        'error',
        'SDK do Supabase não pôde ser carregado. Usando armazenamento local temporariamente.'
      );
      return { configured: false };
    }

    try {
      supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: false }
      });

      fetchAllTables();
      setupRealtimeListeners();
      return { configured: true };
    } catch (err) {
      console.error('[SupabaseDB] Erro ao instanciar cliente Supabase:', err);
      isConnected = false;
      notifyStatus('error', 'Falha ao conectar ao Supabase.');
      return { configured: false, error: err };
    }
  }

  /* ==========================================================================
     CRUD Assíncrono no Supabase (meses, salarios, despesas, gastos_fixos)
     ========================================================================== */

  async function saveMonthMeta(appState) {
    if (!isConfigured || !supabaseClient) return false;
    try {
      const yyyyMM = appState.currentMonth || new Date().toISOString().slice(0, 7);
      const mesAnoFormatado = toMesAnoLabel(yyyyMM);

      await supabaseClient.from('meses').upsert({
        id: 'config_global',
        mes_atual: mesAnoFormatado,
        current_month: yyyyMM,
        sector_limits: appState.sectorLimits || {},
        dismissed_recurring: appState.dismissedRecurringByMonth || {},
        dark_mode: Boolean(appState.darkMode),
        updated_at: Date.now()
      });
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao salvar meses:', err);
      return false;
    }
  }

  async function saveMonthlySalary(yyyyMM, gabrielSalary, mirelaSalary) {
    if (!isConfigured || !supabaseClient) return false;
    try {
      const mesAno = toMesAnoLabel(yyyyMM);
      const gVal = Number(gabrielSalary) || 0;
      const mVal = Number(mirelaSalary) || 0;

      await supabaseClient.from('salarios').upsert({
        mes_ano: mesAno,
        referencia_iso: yyyyMM,
        gabriel: gVal,
        mirela: mVal,
        soma_casal: gVal + mVal,
        updated_at: Date.now()
      });
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao salvar salário no Supabase:', err);
      return false;
    }
  }

  async function upsertTransaction(tx) {
    if (!isConfigured || !supabaseClient || !tx || !tx.id) return false;
    try {
      const yyyyMM = (tx.date || '').slice(0, 7) || new Date().toISOString().slice(0, 7);
      const mesAno = toMesAnoLabel(yyyyMM);
      const safeImage =
        tx.imageDataUrl && tx.imageDataUrl.length < 500000 ? tx.imageDataUrl : null;

      await supabaseClient.from('despesas').upsert({
        id: String(tx.id),
        nome: String(tx.merchant || 'Despesa').trim(),
        valor: Number(tx.amount) || 0,
        setor: tx.sector || 'mercado',
        responsavel: (tx.owner || 'casal').toLowerCase().trim(),
        mes_ano: mesAno,
        referencia_iso: yyyyMM,
        data: tx.date || `${yyyyMM}-05`,
        hora: tx.time || '12:00',
        forma_pagamento: tx.paymentMethod || 'PIX',
        is_recurring: Boolean(tx.isRecurring),
        subscription_id: tx.subscriptionId || null,
        image_data_url: safeImage,
        image_signature: tx.imageSignature || null,
        updated_at: Date.now()
      });
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao salvar despesa no Supabase:', err);
      return false;
    }
  }

  async function upsertMultipleTransactions(txArray = []) {
    if (!isConfigured || !supabaseClient || !Array.isArray(txArray) || txArray.length === 0) {
      return false;
    }
    try {
      const rows = txArray.map(tx => {
        const yyyyMM = (tx.date || '').slice(0, 7) || new Date().toISOString().slice(0, 7);
        const mesAno = toMesAnoLabel(yyyyMM);
        const safeImage =
          tx.imageDataUrl && tx.imageDataUrl.length < 500000 ? tx.imageDataUrl : null;

        return {
          id: String(tx.id),
          nome: String(tx.merchant || 'Despesa').trim(),
          valor: Number(tx.amount) || 0,
          setor: tx.sector || 'mercado',
          responsavel: (tx.owner || 'casal').toLowerCase().trim(),
          mes_ano: mesAno,
          referencia_iso: yyyyMM,
          data: tx.date || `${yyyyMM}-05`,
          hora: tx.time || '12:00',
          forma_pagamento: tx.paymentMethod || 'PIX',
          is_recurring: Boolean(tx.isRecurring),
          subscription_id: tx.subscriptionId || null,
          image_data_url: safeImage,
          image_signature: tx.imageSignature || null,
          updated_at: Date.now()
        };
      });

      // Divide em lotes de até 100 itens
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        await supabaseClient.from('despesas').upsert(chunk);
      }
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao salvar lote de despesas:', err);
      return false;
    }
  }

  async function deleteTransactionById(txId) {
    if (!isConfigured || !supabaseClient || !txId) return false;
    try {
      await supabaseClient.from('despesas').delete().eq('id', String(txId));
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao excluir despesa no Supabase:', err);
      return false;
    }
  }

  async function deleteMultipleTransactionsByIds(txIds = []) {
    if (!isConfigured || !supabaseClient || !Array.isArray(txIds) || txIds.length === 0) {
      return false;
    }
    try {
      await supabaseClient.from('despesas').delete().in('id', txIds.map(String));
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao excluir lote de despesas no Supabase:', err);
      return false;
    }
  }

  async function upsertSubscription(sub) {
    if (!isConfigured || !supabaseClient || !sub || !sub.id) return false;
    try {
      await supabaseClient.from('gastos_fixos').upsert({
        id: String(sub.id),
        nome: String(sub.merchant || 'Gasto Fixo').trim(),
        valor: Number(sub.amount) || 0,
        dia_vencimento: Number(sub.day) || 5,
        setor: sub.sector || 'mercado',
        responsavel: (sub.owner || 'casal').toLowerCase().trim(),
        forma_pagamento: sub.paymentMethod || 'PIX',
        ativo: sub.active !== undefined ? Boolean(sub.active) : true,
        updated_at: Date.now()
      });
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao salvar gasto fixo no Supabase:', err);
      return false;
    }
  }

  async function deleteSubscriptionById(subId) {
    if (!isConfigured || !supabaseClient || !subId) return false;
    try {
      await supabaseClient.from('gastos_fixos').delete().eq('id', String(subId));
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao excluir gasto fixo no Supabase:', err);
      return false;
    }
  }

  async function syncFullStateToCloud(appState) {
    if (!isConfigured || !supabaseClient || !appState) return false;
    try {
      await saveMonthMeta(appState);

      const salariesEntries = Object.entries(appState.monthlySalaries || {});
      for (const [yyyyMM, sal] of salariesEntries) {
        await saveMonthlySalary(yyyyMM, sal.gabriel || 0, sal.mirela || 0);
      }

      for (const sub of appState.subscriptions || []) {
        await upsertSubscription(sub);
      }

      if (Array.isArray(appState.transactions) && appState.transactions.length > 0) {
        await upsertMultipleTransactions(appState.transactions);
      }
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro na sincronização completa para o Supabase:', err);
      return false;
    }
  }

  function saveSupabaseConfigFromUI(configObj) {
    localStorage.setItem(SUPABASE_CONFIG_STORAGE_KEY, JSON.stringify(configObj || {}));
    return initCloudDatabase();
  }

  function getStoredSupabaseConfig() {
    return buildSupabaseConfig();
  }

  window.CloudDB = {
    initCloudDatabase,
    isConfigured: () => isConfigured,
    isConnected: () => isConnected,
    saveMonthMeta,
    saveMonthlySalary,
    upsertTransaction,
    upsertMultipleTransactions,
    deleteTransactionById,
    deleteMultipleTransactionsByIds,
    upsertSubscription,
    deleteSubscriptionById,
    syncFullStateToCloud,
    saveSupabaseConfigFromUI,
    getStoredSupabaseConfig,
    // Alias compatível caso o app chame o nome antigo
    saveFirebaseConfigFromUI: saveSupabaseConfigFromUI,
    getStoredFirebaseConfig: getStoredSupabaseConfig
  };
})();

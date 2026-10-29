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
 */

// Garante que import.meta.env exista de forma segura sem quebrar o navegador
if (typeof import.meta !== 'undefined' && !import.meta.env) {
  try {
    import.meta.env = {};
  } catch (_) {}
}

// Log de depuração estrito solicitado para validação na Vercel / Vite
try {
  console.log('Supabase URL presente:', !!import.meta.env.VITE_SUPABASE_URL);
} catch (_) {
  console.log('Supabase URL presente:', false);
}

(function () {
  const SUPABASE_CONFIG_STORAGE_KEY = 'nossobolso_supabase_config_v1';

  /**
   * Obtém as credenciais estritamente através de import.meta.env com fallbacks
   * ordenados para o build da Vercel e execução local.
   */
  function getSupabaseCredentials() {
    let url = '';
    let anonKey = '';

    // 1. Leitura estática direta de import.meta.env (substituída pelo Vite na Vercel)
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        if (import.meta.env.VITE_SUPABASE_URL) {
          url = String(import.meta.env.VITE_SUPABASE_URL).trim();
        }
        if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
          anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim();
        }
      }
    } catch (_) {}

    // 2. Injeção estática do script de build da Vercel (env-config.js gerado por build.js)
    try {
      if (!url && typeof window !== 'undefined' && window.__VITE_ENV__) {
        url = String(window.__VITE_ENV__.VITE_SUPABASE_URL || '').trim();
      }
      if (!anonKey && typeof window !== 'undefined' && window.__VITE_ENV__) {
        anonKey = String(window.__VITE_ENV__.VITE_SUPABASE_ANON_KEY || '').trim();
      }
    } catch (_) {}

    // 3. Fallback de desenvolvimento local window.GODOY_ENV (env-local.js)
    try {
      if (!url && typeof window !== 'undefined' && window.GODOY_ENV) {
        url = String(window.GODOY_ENV.VITE_SUPABASE_URL || window.GODOY_ENV.SUPABASE_URL || '').trim();
      }
      if (!anonKey && typeof window !== 'undefined' && window.GODOY_ENV) {
        anonKey = String(window.GODOY_ENV.VITE_SUPABASE_ANON_KEY || window.GODOY_ENV.SUPABASE_ANON_KEY || '').trim();
      }
    } catch (_) {}

    // 4. Fallback LocalStorage (configurado via Modal de Configurações no navegador)
    try {
      if ((!url || !anonKey) && typeof localStorage !== 'undefined') {
        const savedRaw = localStorage.getItem(SUPABASE_CONFIG_STORAGE_KEY);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (!url && parsed && parsed.VITE_SUPABASE_URL) url = String(parsed.VITE_SUPABASE_URL).trim();
          if (!anonKey && parsed && parsed.VITE_SUPABASE_ANON_KEY) anonKey = String(parsed.VITE_SUPABASE_ANON_KEY).trim();
        }
      }
    } catch (_) {}

    // Limpeza de aspas acidentais e normalização da URL do Supabase
    if (url) {
      url = url.replace(/^["']|["']$/g, '').trim();
      url = url.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    }
    if (anonKey) {
      anonKey = anonKey.replace(/^["']|["']$/g, '').trim();
    }

    return { url, anonKey };
  }

  function hasValidConfig(cfg) {
    return Boolean(
      cfg &&
      cfg.url &&
      cfg.anonKey &&
      cfg.url !== '' &&
      cfg.anonKey !== '' &&
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
        memoryCache.transactions = despesasData.map(d => {
          const rawId = String(d.id || '');
          let parcId = d.parcelamento_id ? String(d.parcelamento_id) : null;
          if (!parcId && !d.is_recurring && d.subscription_id && String(d.subscription_id).startsWith('parc_')) {
            parcId = String(d.subscription_id);
          }
          if (!parcId && rawId.startsWith('tx_parc_')) {
            const parts = rawId.split('_');
            if (parts.length >= 3) parcId = `parc_${parts[2]}`;
          }
          if (!parcId) {
            const legacyMatch = rawId.match(/^tx_(\d{13})_\d+_[a-z0-9]+$/);
            if (legacyMatch && /\(\d+\/\d+\)\s*$/.test(String(d.nome || ''))) {
              parcId = `parc_${legacyMatch[1]}`;
            }
          }

          return {
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
            subscriptionId: d.is_recurring ? (d.subscription_id || null) : null,
            parcelamento_id: parcId,
            updatedAt: d.updated_at || 0
          };
        });
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
        await onStateChangeCallback(
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
      notifyStatus('error', 'Erro ao consultar tabelas do Supabase.');
    } finally {
      const skeletonEl = document.getElementById('cloud-loading-skeleton');
      if (skeletonEl) skeletonEl.classList.add('hidden');
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

  function connectWithCredentials(config) {
    if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
      isConnected = false;
      notifyStatus(
        'error',
        'SDK do Supabase não pôde ser carregado. Usando armazenamento local temporariamente.'
      );
      return false;
    }

    try {
      supabaseClient = window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: false }
      });
      isConfigured = true;
      fetchAllTables();
      setupRealtimeListeners();
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao instanciar cliente Supabase:', err);
      isConnected = false;
      notifyStatus('error', 'Falha ao conectar ao Supabase.');
      return false;
    }
  }

  async function tryFetchVercelApiEnv() {
    try {
      const res = await fetch('/api/env');
      if (res.ok) {
        const data = await res.json();
        if (data && data.VITE_SUPABASE_URL && data.VITE_SUPABASE_ANON_KEY) {
          let url = String(data.VITE_SUPABASE_URL).trim();
          url = url.replace(/^["']|["']$/g, '').trim();
          url = url.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
          const anonKey = String(data.VITE_SUPABASE_ANON_KEY).replace(/^["']|["']$/g, '').trim();
          return { url, anonKey };
        }
      }
    } catch (_) {}
    return null;
  }

  function initCloudDatabase(callbacks = {}) {
    if (callbacks.onStateChange) onStateChangeCallback = callbacks.onStateChange;
    if (callbacks.onStatusChange) onStatusChangeCallback = callbacks.onStatusChange;

    const config = getSupabaseCredentials();
    isConfigured = hasValidConfig(config);

    if (isConfigured) {
      connectWithCredentials(config);
      return { configured: true };
    }

    // Se as variáveis ainda não foram encontradas, tenta recuperar via /api/env da Vercel
    tryFetchVercelApiEnv().then(remoteCfg => {
      if (remoteCfg && hasValidConfig(remoteCfg)) {
        console.log('[SupabaseDB] Credenciais obtidas via /api/env da Vercel!');
        connectWithCredentials(remoteCfg);
      } else {
        isConnected = false;
        notifyStatus(
          'unconfigured',
          'Banco de Dados não configurado. Adicione suas chaves do Supabase no arquivo .env'
        );
      }
    });

    return { configured: false };
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
      const parcId = tx.parcelamento_id || null;

      const row = {
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
        subscription_id: tx.isRecurring ? (tx.subscriptionId || null) : (parcId || tx.subscriptionId || null),
        parcelamento_id: parcId,
        image_data_url: safeImage,
        image_signature: tx.imageSignature || null,
        updated_at: Date.now()
      };

      const { error } = await supabaseClient.from('despesas').upsert(row);
      if (error && String(error.message || '').includes('parcelamento_id')) {
        const { parcelamento_id, ...fallbackRow } = row;
        await supabaseClient.from('despesas').upsert(fallbackRow);
      }
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao salvar despesa no Supabase:', err);
      return false;
    }
  }

  async function insertBatchTransactions(txArray = []) {
    if (!isConfigured || !supabaseClient || !Array.isArray(txArray) || txArray.length === 0) {
      return false;
    }
    try {
      const arrayDeDespesas = txArray.map(tx => {
        const yyyyMM = (tx.date || '').slice(0, 7) || new Date().toISOString().slice(0, 7);
        const mesAno = tx.mes_ano || toMesAnoLabel(yyyyMM);
        const safeImage =
          tx.imageDataUrl && tx.imageDataUrl.length < 500000 ? tx.imageDataUrl : null;
        const roundedVal = Number((Number(tx.amount) || 0).toFixed(2));
        const parcId = tx.parcelamento_id || null;

        return {
          id: String(tx.id),
          nome: String(tx.merchant || 'Despesa').trim(),
          valor: roundedVal,
          setor: tx.sector || 'mercado',
          responsavel: (tx.owner || 'casal').toLowerCase().trim(),
          mes_ano: mesAno,
          referencia_iso: yyyyMM,
          data: tx.date || `${yyyyMM}-05`,
          hora: tx.time || '12:00',
          forma_pagamento: tx.paymentMethod || 'PIX',
          is_recurring: Boolean(tx.isRecurring),
          subscription_id: tx.isRecurring ? (tx.subscriptionId || null) : (parcId || tx.subscriptionId || null),
          parcelamento_id: parcId,
          image_data_url: safeImage,
          image_signature: tx.imageSignature || null,
          updated_at: Date.now()
        };
      });

      const { error } = await supabaseClient.from('despesas').insert(arrayDeDespesas);
      if (error) {
        if (String(error.message || '').includes('parcelamento_id')) {
          const stripped = arrayDeDespesas.map(({ parcelamento_id, ...rest }) => rest);
          const { error: err2 } = await supabaseClient.from('despesas').insert(stripped);
          if (err2) {
            await supabaseClient.from('despesas').upsert(stripped);
          }
        } else {
          console.warn('[SupabaseDB] Fallback upsert para lote de despesas:', error.message);
          await supabaseClient.from('despesas').upsert(arrayDeDespesas);
        }
      }
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro no insert em lote de despesas:', err);
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
        const mesAno = tx.mes_ano || toMesAnoLabel(yyyyMM);
        const safeImage =
          tx.imageDataUrl && tx.imageDataUrl.length < 500000 ? tx.imageDataUrl : null;
        const roundedVal = Number((Number(tx.amount) || 0).toFixed(2));
        const parcId = tx.parcelamento_id || null;

        return {
          id: String(tx.id),
          nome: String(tx.merchant || 'Despesa').trim(),
          valor: roundedVal,
          setor: tx.sector || 'mercado',
          responsavel: (tx.owner || 'casal').toLowerCase().trim(),
          mes_ano: mesAno,
          referencia_iso: yyyyMM,
          data: tx.date || `${yyyyMM}-05`,
          hora: tx.time || '12:00',
          forma_pagamento: tx.paymentMethod || 'PIX',
          is_recurring: Boolean(tx.isRecurring),
          subscription_id: tx.isRecurring ? (tx.subscriptionId || null) : (parcId || tx.subscriptionId || null),
          parcelamento_id: parcId,
          image_data_url: safeImage,
          image_signature: tx.imageSignature || null,
          updated_at: Date.now()
        };
      });

      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error } = await supabaseClient.from('despesas').upsert(chunk);
        if (error && String(error.message || '').includes('parcelamento_id')) {
          const strippedChunk = chunk.map(({ parcelamento_id, ...rest }) => rest);
          await supabaseClient.from('despesas').upsert(strippedChunk);
        }
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

  async function deleteTransactionsByParcelamentoId(parcelamentoId, fallbackIds = []) {
    if (!isConfigured || !supabaseClient || !parcelamentoId) return false;
    try {
      const { error } = await supabaseClient
        .from('despesas')
        .delete()
        .eq('parcelamento_id', String(parcelamentoId));

      if (error) {
        console.warn('[SupabaseDB] Aviso ao excluir por parcelamento_id (usando fallback):', error.message);
      }

      // Garante exclusão também via subscription_id e lista de IDs do lote
      await supabaseClient
        .from('despesas')
        .delete()
        .eq('subscription_id', String(parcelamentoId));

      if (Array.isArray(fallbackIds) && fallbackIds.length > 0) {
        await supabaseClient
          .from('despesas')
          .delete()
          .in('id', fallbackIds.map(String));
      }
      return true;
    } catch (err) {
      console.error('[SupabaseDB] Erro ao excluir parcelamento em lote no Supabase:', err);
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
    return getSupabaseCredentials();
  }

  window.CloudDB = {
    initCloudDatabase,
    isConfigured: () => isConfigured,
    isConnected: () => isConnected,
    saveMonthMeta,
    saveMonthlySalary,
    upsertTransaction,
    insertBatchTransactions,
    upsertMultipleTransactions,
    deleteTransactionById,
    deleteTransactionsByParcelamentoId,
    deleteMultipleTransactionsByIds,
    upsertSubscription,
    deleteSubscriptionById,
    syncFullStateToCloud,
    saveSupabaseConfigFromUI,
    getStoredSupabaseConfig
  };

  try {
    window.dispatchEvent(new CustomEvent('clouddb-ready'));
  } catch (_) {}
})();

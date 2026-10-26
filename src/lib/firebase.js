/**
 * ============================================================================
 * NOSSO BOLSO (GODOY-APP) — Camada de Persistência em Nuvem (Firebase Firestore)
 * Arquivo: src/lib/firebase.js
 * ============================================================================
 * Estrutura de Coleções no Firestore:
 * 1. `meses`        -> Documento `config_global` com mês atual (ex: "10-2026" / "2026-10"), tetos de setores e controle mensal.
 * 2. `salarios`     -> Documentos por mês (`YYYY-MM`) contendo salários de Gabriel e Mirela vinculados ao mês.
 * 3. `despesas`     -> Documentos de todas as despesas (`nome`, `valor`, `setor`, `responsavel`, `mes_ano`, `data`, `forma_pagamento`).
 * 4. `gastos_fixos` -> Documentos de assinaturas e gastos fixos recorrentes (`nome`, `valor`, `dia_vencimento`, `setor`, `responsavel`, `ativo`).
 *
 * Sincronização em Tempo Real:
 * - Utiliza `onSnapshot` em todas as 4 coleções para atualização instantânea entre PC e Celular.
 * - Fallback automático e seguro para `localStorage` caso o arquivo `.env` ainda não esteja configurado.
 */

(function () {
  const FIREBASE_CONFIG_STORAGE_KEY = 'nossobolso_firebase_config_v1';

  /**
   * Lê uma variável de ambiente de múltiplas fontes:
   * 1. Vite (`import.meta.env.VITE_...`)
   * 2. `window.GODOY_ENV` (definido em `env-local.js`)
   * 3. Configuração salva no navegador (Modal de Configurações de Nuvem)
   */
  function getEnvVar(viteKey) {
    try {
      // 1. Suporte a bundlers Vite (se executado via Vite)
      if (typeof importMetaEnv !== 'undefined' && importMetaEnv && importMetaEnv[viteKey]) {
        return String(importMetaEnv[viteKey]).trim();
      }
    } catch (_) {}

    try {
      // 2. Suporte a window.__VITE_ENV__ ou window.GODOY_ENV (env-local.js)
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
      // 3. Suporte a configuração salva no painel de Configurações da interface
      const savedRaw = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed && parsed[viteKey]) {
          return String(parsed[viteKey]).trim();
        }
      }
    } catch (_) {}

    return '';
  }

  function buildFirebaseConfig() {
    return {
      apiKey: getEnvVar('VITE_FIREBASE_API_KEY'),
      authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN'),
      projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID'),
      storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET'),
      messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID'),
      appId: getEnvVar('VITE_FIREBASE_APP_ID')
    };
  }

  function hasValidFirebaseConfig(cfg) {
    return Boolean(
      cfg &&
      cfg.apiKey &&
      cfg.projectId &&
      cfg.apiKey !== 'SUA_API_KEY_AQUI' &&
      !cfg.apiKey.includes('YOUR_')
    );
  }

  // Converte "2026-10" <-> "10-2026" para compatibilidade total
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

  let firebaseApp = null;
  let firestoreDb = null;
  let unsubscribers = [];
  let isCloudConfigured = false;
  let isCloudConnected = false;
  let isInitialLoadDone = false;

  // Callbacks registrados pelo app.js para receber atualizações em tempo real
  let onStateChangeCallback = null;
  let onStatusChangeCallback = null;

  // Cache em memória sincronizado com as 4 coleções do Firestore
  const cloudCache = {
    mesesLoaded: false,
    salariosLoaded: false,
    despesasLoaded: false,
    gastosFixosLoaded: false,
    meta: null,
    salariesByMonth: {},
    transactions: [],
    subscriptions: []
  };

  function notifyStatus(status, message = '') {
    if (typeof onStatusChangeCallback === 'function') {
      onStatusChangeCallback({
        isConfigured: isCloudConfigured,
        isConnected: isCloudConnected,
        status, // 'loading' | 'connected' | 'unconfigured' | 'error'
        message
      });
    }
  }

  function checkAllCollectionsReadyAndEmit() {
    if (
      cloudCache.mesesLoaded &&
      cloudCache.salariosLoaded &&
      cloudCache.despesasLoaded &&
      cloudCache.gastosFixosLoaded
    ) {
      isCloudConnected = true;
      const firstLoad = !isInitialLoadDone;
      isInitialLoadDone = true;

      notifyStatus('connected', 'Sincronizado em tempo real (Firebase Cloud)');

      if (typeof onStateChangeCallback === 'function') {
        onStateChangeCallback(
          {
            meta: cloudCache.meta,
            monthlySalaries: cloudCache.salariesByMonth,
            transactions: cloudCache.transactions,
            subscriptions: cloudCache.subscriptions
          },
          { isFirstLoad: firstLoad }
        );
      }
    }
  }

  /**
   * Inicializa o Firebase Firestore e ativa os listeners em tempo real (`onSnapshot`)
   * nas 4 coleções: `meses`, `salarios`, `despesas` e `gastos_fixos`.
   */
  function initCloudDatabase(callbacks = {}) {
    if (callbacks.onStateChange) onStateChangeCallback = callbacks.onStateChange;
    if (callbacks.onStatusChange) onStatusChangeCallback = callbacks.onStatusChange;

    // Limpa listeners anteriores caso esteja reconectando
    unsubscribers.forEach(unsub => {
      try {
        unsub();
      } catch (_) {}
    });
    unsubscribers = [];

    const config = buildFirebaseConfig();
    isCloudConfigured = hasValidFirebaseConfig(config);

    if (!isCloudConfigured) {
      isCloudConnected = false;
      notifyStatus(
        'unconfigured',
        'Banco de Dados não configurado. Adicione suas chaves no arquivo .env'
      );
      return { configured: false };
    }

    if (typeof window.firebase === 'undefined' || !window.firebase.firestore) {
      isCloudConnected = false;
      notifyStatus(
        'error',
        'SDK do Firebase não pôde ser carregado. Usando armazenamento local temporariamente.'
      );
      return { configured: false };
    }

    try {
      notifyStatus('loading', 'Sincronizando dados da nuvem...');

      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        firebaseApp = window.firebase.initializeApp(config);
      } else {
        firebaseApp = window.firebase.app();
      }

      firestoreDb = window.firebase.firestore(firebaseApp);

      // 1. Listener em Tempo Real: Coleção `meses` (documento `config_global`)
      const unsubMeses = firestoreDb
        .collection('meses')
        .doc('config_global')
        .onSnapshot(
          docSnap => {
            if (docSnap.exists) {
              const data = docSnap.data() || {};
              cloudCache.meta = {
                currentMonth: fromMesAnoLabel(data.mes_atual || data.currentMonth || ''),
                sectorLimits: data.sectorLimits || null,
                dismissedRecurringByMonth: data.dismissedRecurringByMonth || {},
                darkMode: typeof data.darkMode === 'boolean' ? data.darkMode : true
              };
            } else {
              cloudCache.meta = null;
            }
            cloudCache.mesesLoaded = true;
            checkAllCollectionsReadyAndEmit();
          },
          err => {
            console.error('[CloudDB] Erro no listener de meses:', err);
            cloudCache.mesesLoaded = true;
            notifyStatus('error', 'Erro de permissão ou conexão ao ler coleção meses.');
          }
        );

      // 2. Listener em Tempo Real: Coleção `salarios`
      const unsubSalarios = firestoreDb.collection('salarios').onSnapshot(
        querySnap => {
          const salariesMap = {};
          querySnap.forEach(docSnap => {
            const d = docSnap.data() || {};
            const key = fromMesAnoLabel(d.mes_ano || docSnap.id);
            if (key) {
              salariesMap[key] = {
                gabriel: Number(d.gabriel ?? d.salario_gabriel) || 0,
                mirela: Number(d.mirela ?? d.salario_mirela) || 0
              };
            }
          });
          cloudCache.salariesByMonth = salariesMap;
          cloudCache.salariosLoaded = true;
          checkAllCollectionsReadyAndEmit();
        },
        err => {
          console.error('[CloudDB] Erro no listener de salarios:', err);
          cloudCache.salariosLoaded = true;
          notifyStatus('error', 'Erro ao sincronizar coleção salarios.');
        }
      );

      // 3. Listener em Tempo Real: Coleção `despesas`
      const unsubDespesas = firestoreDb.collection('despesas').onSnapshot(
        querySnap => {
          const txList = [];
          querySnap.forEach(docSnap => {
            const d = docSnap.data() || {};
            const dateStr = d.data || d.date || `${fromMesAnoLabel(d.mes_ano || '2026-10')}-05`;
            txList.push({
              id: docSnap.id,
              merchant: d.nome || d.merchant || 'Despesa',
              amount: Number(d.valor ?? d.amount) || 0,
              sector: d.setor || d.sector || 'mercado',
              owner: (d.responsavel || d.owner || 'casal').toLowerCase().trim(),
              mes_ano: d.mes_ano || toMesAnoLabel(dateStr.slice(0, 7)),
              date: dateStr,
              time: d.hora || d.time || '12:00',
              paymentMethod: d.forma_pagamento || d.paymentMethod || 'PIX',
              imageDataUrl: d.imageDataUrl || null,
              imageSignature: d.imageSignature || null,
              isRecurring: Boolean(d.isRecurring),
              subscriptionId: d.subscriptionId || null,
              updatedAt: d.updatedAt || 0
            });
          });
          // Ordena por data decrescente
          txList.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          cloudCache.transactions = txList;
          cloudCache.despesasLoaded = true;
          checkAllCollectionsReadyAndEmit();
        },
        err => {
          console.error('[CloudDB] Erro no listener de despesas:', err);
          cloudCache.despesasLoaded = true;
          notifyStatus('error', 'Erro ao sincronizar coleção despesas.');
        }
      );

      // 4. Listener em Tempo Real: Coleção `gastos_fixos`
      const unsubGastosFixos = firestoreDb.collection('gastos_fixos').onSnapshot(
        querySnap => {
          const subList = [];
          querySnap.forEach(docSnap => {
            const d = docSnap.data() || {};
            subList.push({
              id: docSnap.id,
              merchant: d.nome || d.merchant || 'Gasto Fixo',
              amount: Number(d.valor ?? d.amount) || 0,
              day: Number(d.dia_vencimento ?? d.day) || 5,
              sector: d.setor || d.sector || 'mercado',
              owner: (d.responsavel || d.owner || 'casal').toLowerCase().trim(),
              paymentMethod: d.forma_pagamento || d.paymentMethod || 'PIX',
              active: d.ativo !== undefined ? Boolean(d.ativo) : Boolean(d.active ?? true),
              updatedAt: d.updatedAt || 0
            });
          });
          cloudCache.subscriptions = subList;
          cloudCache.gastosFixosLoaded = true;
          checkAllCollectionsReadyAndEmit();
        },
        err => {
          console.error('[CloudDB] Erro no listener de gastos_fixos:', err);
          cloudCache.gastosFixosLoaded = true;
          notifyStatus('error', 'Erro ao sincronizar coleção gastos_fixos.');
        }
      );

      unsubscribers.push(unsubMeses, unsubSalarios, unsubDespesas, unsubGastosFixos);
      return { configured: true };
    } catch (err) {
      console.error('[CloudDB] Falha ao inicializar Firebase:', err);
      isCloudConnected = false;
      notifyStatus('error', 'Falha ao conectar ao Firebase. Verifique as chaves no .env.');
      return { configured: false, error: err };
    }
  }

  /* ==========================================================================
     Operações CRUD Assíncronas no Firestore (Coleções: meses, salarios, despesas, gastos_fixos)
     ========================================================================== */

  /**
   * 1. Coleção `meses`: Salva o mês atual ("10-2026"), limites de setores e configurações globais
   */
  async function saveMonthMeta(appState) {
    if (!isCloudConfigured || !firestoreDb) return false;
    try {
      const yyyyMM = appState.currentMonth || new Date().toISOString().slice(0, 7);
      const mesAnoFormatado = toMesAnoLabel(yyyyMM); // Ex: "10-2026"

      await firestoreDb
        .collection('meses')
        .doc('config_global')
        .set(
          {
            mes_atual: mesAnoFormatado,
            currentMonth: yyyyMM,
            sectorLimits: appState.sectorLimits || {},
            dismissedRecurringByMonth: appState.dismissedRecurringByMonth || {},
            darkMode: Boolean(appState.darkMode),
            updatedAt: Date.now()
          },
          { merge: true }
        );

      // Também registra o documento individual do mês em `meses/{MM-YYYY}`
      await firestoreDb
        .collection('meses')
        .doc(mesAnoFormatado)
        .set(
          {
            mes_ano: mesAnoFormatado,
            referencia_iso: yyyyMM,
            updatedAt: Date.now()
          },
          { merge: true }
        );
      return true;
    } catch (err) {
      console.error('[CloudDB] Erro ao salvar em meses:', err);
      return false;
    }
  }

  /**
   * 2. Coleção `salarios`: Salva os salários de Gabriel e Mirela vinculados ao mês
   */
  async function saveMonthlySalary(yyyyMM, gabrielSalary, mirelaSalary) {
    if (!isCloudConfigured || !firestoreDb) return false;
    try {
      const mesAno = toMesAnoLabel(yyyyMM); // Ex: "10-2026"
      const gVal = Number(gabrielSalary) || 0;
      const mVal = Number(mirelaSalary) || 0;

      await firestoreDb
        .collection('salarios')
        .doc(yyyyMM)
        .set(
          {
            mes_ano: mesAno,
            referencia_iso: yyyyMM,
            gabriel: gVal,
            mirela: mVal,
            soma_casal: gVal + mVal,
            updatedAt: Date.now()
          },
          { merge: true }
        );
      return true;
    } catch (err) {
      console.error('[CloudDB] Erro ao salvar salário na nuvem:', err);
      return false;
    }
  }

  /**
   * 3. Coleção `despesas`: Cria ou atualiza uma despesa avulsa ou recorrente
   * Campos exigidos: nome, valor, setor, responsavel, mes_ano (+ metadados de data/pagamento)
   */
  async function upsertTransaction(tx) {
    if (!isCloudConfigured || !firestoreDb || !tx || !tx.id) return false;
    try {
      const yyyyMM = (tx.date || '').slice(0, 7) || new Date().toISOString().slice(0, 7);
      const mesAno = toMesAnoLabel(yyyyMM); // Ex: "10-2026"

      // Evita ultrapassar limite de 1MB por documento do Firestore caso haja imagem Base64 muito grande
      const safeImage =
        tx.imageDataUrl && tx.imageDataUrl.length < 650000 ? tx.imageDataUrl : null;

      await firestoreDb
        .collection('despesas')
        .doc(String(tx.id))
        .set(
          {
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
            isRecurring: Boolean(tx.isRecurring),
            subscriptionId: tx.subscriptionId || null,
            imageDataUrl: safeImage,
            imageSignature: tx.imageSignature || null,
            updatedAt: Date.now()
          },
          { merge: true }
        );
      return true;
    } catch (err) {
      console.error('[CloudDB] Erro ao salvar despesa na nuvem:', err);
      return false;
    }
  }

  /**
   * Salva múltiplas despesas em lote (ex: ao confirmar uma Fatura PDF inteira)
   */
  async function upsertMultipleTransactions(txArray = []) {
    if (!isCloudConfigured || !firestoreDb || !Array.isArray(txArray) || txArray.length === 0) {
      return false;
    }
    try {
      const chunks = [];
      for (let i = 0; i < txArray.length; i += 400) {
        chunks.push(txArray.slice(i, i + 400));
      }

      for (const chunk of chunks) {
        const batch = firestoreDb.batch();
        for (const tx of chunk) {
          if (!tx || !tx.id) continue;
          const yyyyMM = (tx.date || '').slice(0, 7) || new Date().toISOString().slice(0, 7);
          const mesAno = toMesAnoLabel(yyyyMM);
          const safeImage =
            tx.imageDataUrl && tx.imageDataUrl.length < 650000 ? tx.imageDataUrl : null;

          const docRef = firestoreDb.collection('despesas').doc(String(tx.id));
          batch.set(
            docRef,
            {
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
              isRecurring: Boolean(tx.isRecurring),
              subscriptionId: tx.subscriptionId || null,
              imageDataUrl: safeImage,
              imageSignature: tx.imageSignature || null,
              updatedAt: Date.now()
            },
            { merge: true }
          );
        }
        await batch.commit();
      }
      return true;
    } catch (err) {
      console.error('[CloudDB] Erro ao salvar lote de despesas:', err);
      return false;
    }
  }

  /**
   * Remove uma despesa da coleção `despesas`
   */
  async function deleteTransactionById(txId) {
    if (!isCloudConfigured || !firestoreDb || !txId) return false;
    try {
      await firestoreDb.collection('despesas').doc(String(txId)).delete();
      return true;
    } catch (err) {
      console.error('[CloudDB] Erro ao excluir despesa da nuvem:', err);
      return false;
    }
  }

  /**
   * Remove múltiplas despesas em lote (ex: botão "Limpar Tudo" ou "Zerar Todos os Gastos do Mês")
   */
  async function deleteMultipleTransactionsByIds(txIds = []) {
    if (!isCloudConfigured || !firestoreDb || !Array.isArray(txIds) || txIds.length === 0) {
      return false;
    }
    try {
      const chunks = [];
      for (let i = 0; i < txIds.length; i += 400) {
        chunks.push(txIds.slice(i, i + 400));
      }
      for (const chunk of chunks) {
        const batch = firestoreDb.batch();
        for (const id of chunk) {
          if (!id) continue;
          batch.delete(firestoreDb.collection('despesas').doc(String(id)));
        }
        await batch.commit();
      }
      return true;
    } catch (err) {
      console.error('[CloudDB] Erro ao excluir lote de despesas:', err);
      return false;
    }
  }

  /**
   * 4. Coleção `gastos_fixos`: Cria ou atualiza um gasto fixo recorrente
   */
  async function upsertSubscription(sub) {
    if (!isCloudConfigured || !firestoreDb || !sub || !sub.id) return false;
    try {
      await firestoreDb
        .collection('gastos_fixos')
        .doc(String(sub.id))
        .set(
          {
            id: String(sub.id),
            nome: String(sub.merchant || 'Gasto Fixo').trim(),
            valor: Number(sub.amount) || 0,
            dia_vencimento: Number(sub.day) || 5,
            setor: sub.sector || 'mercado',
            responsavel: (sub.owner || 'casal').toLowerCase().trim(),
            forma_pagamento: sub.paymentMethod || 'PIX',
            ativo: sub.active !== undefined ? Boolean(sub.active) : true,
            updatedAt: Date.now()
          },
          { merge: true }
        );
      return true;
    } catch (err) {
      console.error('[CloudDB] Erro ao salvar gasto fixo na nuvem:', err);
      return false;
    }
  }

  /**
   * Remove um gasto fixo da coleção `gastos_fixos`
   */
  async function deleteSubscriptionById(subId) {
    if (!isCloudConfigured || !firestoreDb || !subId) return false;
    try {
      await firestoreDb.collection('gastos_fixos').doc(String(subId)).delete();
      return true;
    } catch (err) {
      console.error('[CloudDB] Erro ao excluir gasto fixo da nuvem:', err);
      return false;
    }
  }

  /**
   * Sincroniza/migra todos os dados locais do `appState` para as 4 coleções na nuvem
   * (usado na primeira conexão quando o banco está vazio ou ao restaurar backup)
   */
  async function syncFullStateToCloud(appState) {
    if (!isCloudConfigured || !firestoreDb || !appState) return false;
    try {
      await saveMonthMeta(appState);

      // Salva todos os salários mensais
      const salariesEntries = Object.entries(appState.monthlySalaries || {});
      for (const [yyyyMM, sal] of salariesEntries) {
        await saveMonthlySalary(yyyyMM, sal.gabriel || 0, sal.mirela || 0);
      }

      // Salva todos os gastos fixos
      for (const sub of appState.subscriptions || []) {
        await upsertSubscription(sub);
      }

      // Salva todas as despesas em lote
      if (Array.isArray(appState.transactions) && appState.transactions.length > 0) {
        await upsertMultipleTransactions(appState.transactions);
      }

      return true;
    } catch (err) {
      console.error('[CloudDB] Erro na sincronização completa para a nuvem:', err);
      return false;
    }
  }

  /**
   * Permite salvar as chaves Firebase pelo Modal de Configurações caso o usuário esteja
   * usando a versão hospedada ou queira configurar direto pela interface
   */
  function saveFirebaseConfigFromUI(configObj) {
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(configObj || {}));
    return initCloudDatabase();
  }

  function getStoredFirebaseConfig() {
    return buildFirebaseConfig();
  }

  window.CloudDB = {
    initCloudDatabase,
    isConfigured: () => isCloudConfigured,
    isConnected: () => isCloudConnected,
    saveMonthMeta,
    saveMonthlySalary,
    upsertTransaction,
    upsertMultipleTransactions,
    deleteTransactionById,
    deleteMultipleTransactionsByIds,
    upsertSubscription,
    deleteSubscriptionById,
    syncFullStateToCloud,
    saveFirebaseConfigFromUI,
    getStoredFirebaseConfig
  };
})();

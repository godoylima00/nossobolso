/* ==========================================================================
   Nosso Bolso - Motor de Visão Computacional & Leitor de Faturas PDF:
   - Google Gemini 2.5 Flash (suporte nativo a image/* e application/pdf em Base64)
   - Extrator PDF.js com reconstrução de linhas por coordenadas (Fallback/Híbrido)
   - Regras Inteligentes para Fatura Bradesco Cartões + Detecção de Revisão Manual
   ========================================================================== */

const SECTOR_DICTIONARY = {
  delivery: {
    id: 'delivery',
    name: 'Delivery & Alimentação',
    emoji: '🍔',
    color: '#ef4444',
    keywords: [
      'ifd*ifood', 'ifood', 'rappi', 'ze delivery', 'zé delivery', 'aiqfome', 'uber eats',
      'keetabr*', 'keetabr', 'bobs tatuape', 'bobs ', 'axixcafeterialtda', 'axixcafeteria',
      'pad rok', 'restaurante e lanchone', 'belo boi carnes', 'bario tatuape',
      'd. verissimo lanches', 'verissimo lanches', 'geladaopremium', 'milho verde',
      'restaurante', 'lanchonete', 'burger', 'mcdonald', 'bk ', 'burger king', 'outback',
      'pizzaria', 'pizza', 'sushi', 'padaria', 'panificadora', 'cafeteria', 'starbucks',
      'habibs', 'subway', 'madero', 'coco bambu', 'acai', 'açaí', 'sorveteria', 'churrascaria',
      'boteco', 'doceria', 'confeitaria', 'kfc', 'popeyes', 'spoleto', 'china in box'
    ]
  },
  transporte: {
    id: 'transporte',
    name: 'Transporte & Mobilidade',
    emoji: '🚗',
    color: '#334155',
    keywords: [
      'uber * pending', 'uber *pending', 'dl*uberrides', 'dl *uberrides', 'uberrides', 'uber',
      'dl*99 ride', 'dl *99 ride', '99 ride', '99app', '99 pop', '99*', '99 tecnologia',
      'bilhunico', 'bilhete unico', 'barra funda', 'indriver', 'blablacar',
      'posto', 'ipiranga', 'shell', 'petrobras', 'br mania', 'ale combustiveis',
      'combustivel', 'gasolina', 'etanol', 'sem parar', 'veloe', 'conectcar', 'taggy',
      'pedagio', 'estacionamento', 'indigo', 'estapar', 'zona azul', 'metro', 'cptm',
      'top sp', 'onibus', 'passagem', 'latam', 'gol ', 'azul linhas',
      'localiza', 'movida', 'unidas', 'turbi', 'buser'
    ]
  },
  mercado: {
    id: 'mercado',
    name: 'Mercado, Casa & Contas',
    emoji: '🏠',
    color: '#10b981',
    keywords: [
      'ifd*c carrefour comercio', 'ifd*c carrefour', 'carrefour', 'seumart', 'oxxo matarazzo', 'oxxo',
      'mercado express rudge', 'mini mercado aparecida', 'mercadegalojabar domi', 'mercadegalojabar',
      'apartamento', 'apto', 'moradia', 'financiamento', 'prestacao', 'prestação',
      'conta de luz', 'energia', 'luz', 'internet', 'fibra', 'wi-fi', 'wifi', 'agua', 'água', 'gas', 'gás',
      'supermercado', 'mercado', 'atacadao', 'atacadão', 'assai', 'assaí',
      'pao de acucar', 'pão de açúcar', 'extra', 'dia %', 'oba hortifruti', 'hortifruti',
      'sonda', 'mambo', 'zafari', 'condor', 'angeloni', 'bh supermercados', 'guanabara',
      'mundial', 'sam s club', 'sams club', 'minuto pao', 'açougue', 'swift',
      'enel', 'cpfl', 'light', 'cemig', 'copel', 'celesc', 'neoenergia', 'equatorial',
      'sabesp', 'sanepar', 'copasa', 'cedae', 'comgas', 'naturgy', 'ultragaz',
      'vivo', 'claro', 'tim', 'oi fibra', 'net ', 'sky', 'condominio', 'condomínio', 'aluguel',
      'iptu', 'leroy merlin', 'telhanorte', 'c&c', 'tok&stok', 'madeiramadeira', 'lavanderia', 'rufino'
    ]
  },
  saude: {
    id: 'saude',
    name: 'Saúde & Cuidados',
    emoji: '💊',
    color: '#06b6d4',
    keywords: [
      'drogareims terminal', 'drogareims', 'droga rudge', 'petlove saud*petl', 'petlove',
      'cobasi braz leme', 'cobasi', 'ikesaki',
      'droga raia', 'drogaraia', 'drogasil', 'raia drogasil', 'pague menos', 'drogaria',
      'farmacia', 'farmácia', 'panvel', 'ultrafarma', 'sao paulo', 'venancio', 'araujo',
      'nissei', 'extrafarma', 'hospital', 'clinica', 'clínica', 'laboratorio', 'delboni',
      'fleury', 'lavoisier', 'dasa', 'sabim', 'hermes pardini', 'consulta', 'medico',
      'médico', 'dentista', 'odonto', 'psicologo', 'terapia', 'unimed', 'amil', 'bradesco saude',
      'sulamerica', 'hapvida', 'notredame', 'smart fit', 'smartfit', 'bluefit', 'bodytech',
      'gympass', 'wellhub', 'totalpass', 'academia', 'crossfit', 'pilates', 'barbearia', 'salao'
    ]
  },
  compras: {
    id: 'compras',
    name: 'Cartões, Bancos & Compras',
    emoji: '💳',
    color: '#8b5cf6',
    keywords: [
      'mercadolivre*', 'mercado livre', 'mercadolivre', 'mp*melimais', 'melimais', 'meli',
      'shopee *', 'shopee', 'shein *', 'shein', 'pernambucanas', 'constance', 'enjoei*', 'enjoei',
      'amazon prime canais', 'amazon primebr', 'amazon', 'apple.com/bill', 'apple',
      'cinemark brasil', 'cinemark', 'kartodromo inter sp', 'kartodromo', 'panini brasil', 'panini',
      'sh west plaza', 'west plaza', 'faap online', 'faap', 'fmu',
      'pix parc cartao credito', 'encargos sobre parcelado', 'iof diario sobre parcelad', 'iof adicional sobre parce',
      'cartao', 'cartão', 'nubank', 'bradesco', 'itau', 'itaú', 'santander', 'inter', 'c6', 'fatura',
      'aliexpress', 'magalu', 'magazine luiza', 'casas bahia', 'ponto frio',
      'fast shop', 'kabum', 'pichau', 'terabyte', 'samsung', 'nike', 'adidas',
      'centauro', 'decathlon', 'renner', 'riachuelo', 'c&a', 'zara', 'hering', 'reserva',
      'netflix', 'spotify', 'disney', 'prime video', 'hbo', 'max ', 'youtube', 'globoplay',
      'twitch', 'steam', 'playstation', 'xbox', 'nintendo', 'cinema', 'ingresso',
      'sympla', 'eventim', 'livraria', 'leitura', 'saraiva', 'sephora', 'boticario', 'natura'
    ]
  }
};

// Lista explícita de descrições ambíguas/genéricas que exigem revisão manual do usuário
const AMBIGUOUS_MERCHANT_PATTERNS = [
  /gp\s+de\s+carvalho/i,
  /asas\s+administracao/i,
  /adonias\s+de\s+sou/i,
  /60\.544\.248/i,
  /gisele\s+de\s+carvalho/i,
  /jim\.com/i,
  /mp\s*\*\s*investpag/i,
  /mp\s*\*\s*kokeshi/i,
  /paraiso\s+das\s+essencia/i,
  /pagseguro/i,
  /mercadopago\s*\*(?!melimais)/i,
  /^\d{2}\.\d{3}\.\d{3}/i
];

// Padrões de linhas de controle bancário da fatura Bradesco que NÃO são gastos novos
const IGNORED_STATEMENT_LINE_PATTERNS = [
  /saldo\s+anterior/i,
  /pagto\.?\s*por\s*deb\s*em\s*c\/c/i,
  /pagamento\s+em\s+deb/i,
  /pagto\s+debito\s+automatico/i,
  /total\s+para\s+gabriel\s+godoy\s+lima/i,
  /total\s+para\s+/i,
  /total\s+da\s+fatura\s+em\s+real/i,
  /total\s+desta\s+fatura/i,
  /resumo\s+das\s+despesas/i,
  /limite\s+de\s+credito/i,
  /historico\s+de\s+lancamentos/i,
  /cotacao\s+do\s+dolar/i
];

// Padrões de taxas/encargos/parcelamentos de cartão
const CARD_FEE_PATTERNS = [
  /pix\s+parc\s+cartao\s+credito/i,
  /encargos\s+sobre\s+parcelado/i,
  /iof\s+diario\s+sobre\s+parcelad/i,
  /iof\s+adicional\s+sobre\s+parce/i,
  /\biof\b/i,
  /anuidade\s+diferenciada/i
];

/**
 * Classifica um item de fatura Bradesco retornando:
 * { sector, needsReview, isFeeOrTax, suggestedOwner }
 */
function classifyBradescoStatementItem(description = '', headerHolder = 'gabriel') {
  const raw = String(description || '').trim();
  const norm = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Regra 1: Identificação do Titular / Responsável
  let suggestedOwner = headerHolder || 'gabriel';
  if (/caroline\s+mirela|\bmirela\b/i.test(norm)) {
    suggestedOwner = 'mirela';
  }

  // Regra: Verifica se é taxa/encargo de parcelamento
  const isFeeOrTax = CARD_FEE_PATTERNS.some(rx => rx.test(norm));
  if (isFeeOrTax) {
    return {
      sector: 'compras',
      needsReview: false,
      isFeeOrTax: true,
      suggestedOwner
    };
  }

  // Regra 3: Verifica se está na lista explícita de itens ambíguos ("⚠️ Revisão Necessária")
  if (AMBIGUOUS_MERCHANT_PATTERNS.some(rx => rx.test(norm))) {
    return {
      sector: 'compras',
      needsReview: true,
      isFeeOrTax: false,
      suggestedOwner
    };
  }

  // Regra especial: IFD*C CARREFOUR COMERCIO é Mercado, não Delivery!
  if (/ifd\*c\s*carrefour|carrefour/i.test(norm)) {
    return {
      sector: 'mercado',
      needsReview: false,
      isFeeOrTax: false,
      suggestedOwner
    };
  }

  // Verifica dicionário de setores conhecidos (priorizando mercado/saude/transporte/delivery/compras)
  const checkOrder = ['mercado', 'saude', 'transporte', 'delivery', 'compras'];
  for (const sectorKey of checkOrder) {
    const sectorData = SECTOR_DICTIONARY[sectorKey];
    if (!sectorData) continue;
    for (const kw of sectorData.keywords) {
      const normKw = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (norm.includes(normKw)) {
        return {
          sector: sectorKey,
          needsReview: false,
          isFeeOrTax: false,
          suggestedOwner
        };
      }
    }
  }

  // Se não bateu em nenhuma palavra-chave conhecida, marca para revisão manual!
  return {
    sector: 'compras',
    needsReview: true,
    isFeeOrTax: false,
    suggestedOwner
  };
}

/**
 * Converte nomes de setor retornados pelo Gemini para os IDs internos
 */
function normalizeGeminiSector(rawSector = '', merchantName = '', fullText = '') {
  const s = String(rawSector || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (/carrefour/i.test(merchantName)) return 'mercado';
  if (SECTOR_DICTIONARY[s]) return s;
  if (/delivery|alimenta|ifood|restaurante|lanche/.test(s)) return 'delivery';
  if (/transporte|mobilidade|uber|99|combustivel|bilhete/.test(s)) return 'transporte';
  if (/mercado|casa|moradia|conta|condominio|apartamento|luz|internet|oxxo|seumart/.test(s)) return 'mercado';
  if (/saude|farmacia|droga|medico|academia|petlove|cobasi|ikesaki/.test(s)) return 'saude';
  if (/cartao|banco|compra|lazer|taxa|encargo|iof|educacao|faculdade/.test(s)) return 'compras';

  return classifyMerchantSector(merchantName, `${rawSector} ${fullText}`);
}

/**
 * Classifica automaticamente um estabelecimento ou texto em um dos 5 setores
 */
function classifyMerchantSector(merchantName = '', fullText = '') {
  const info = classifyBradescoStatementItem(`${merchantName} ${fullText}`);
  return info.sector;
}

/**
 * Identifica a Forma de Pagamento no texto extraído do comprovante
 */
function extractPaymentMethod(text = '') {
  const lower = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/\bpix\b|chave pix|transferencia pix|qr code pix|pagamento via pix/.test(lower)) {
    return 'PIX';
  }
  if (/vale refeicao|alelo|sodexo|pluxee|vr beneficios|ticket restaurante|caju|flash/.test(lower)) {
    return 'Vale-Refeição';
  }
  if (/debito|maestro|visa electron|elo debito/.test(lower)) {
    return 'Cartão de Débito';
  }
  if (/credito|mastercard|visa|elo|amex|hipercard|nubank|itaucard|bradesco|cartao|parcelado|1x de|fatura/.test(lower)) {
    return 'Cartão de Crédito';
  }
  if (/dinheiro|especie|troco/.test(lower)) {
    return 'Dinheiro';
  }
  return 'PIX';
}

/**
 * Converte números flexíveis (ex: "R$3 095,00", "-531,86", "531,86-") preservando sinal quando solicitado
 */
function parseFlexibleOCRNumber(raw, preserveSign = false) {
  if (typeof raw === 'number') {
    if (isNaN(raw)) return 0;
    return preserveSign ? raw : Math.abs(raw);
  }
  let s = String(raw || '').replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (!s) return 0;

  let isNegative = false;
  if (s.startsWith('-') || s.endsWith('-') || /\bD\b$/i.test(s) === false && /\bC\b$/i.test(s)) {
    if (s.startsWith('-') || s.endsWith('-')) isNegative = true;
  }
  s = s.replace(/^-|-$/g, '').replace(/[A-Za-z]/g, '').trim();

  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  const val = Math.abs(n);
  return preserveSign && isNegative ? -val : val;
}

/**
 * Extrai o texto de todas as páginas de um arquivo PDF em Base64 usando PDF.js
 * Reconstruindo linhas na horizontal pelas coordenadas (X, Y)
 */
async function extractTextFromPDFDataUrl(pdfDataUrl, onProgress = () => {}) {
  if (typeof window.pdfjsLib === 'undefined') {
    throw new Error('Biblioteca PDF.js não carregada.');
  }

  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const base64 = pdfDataUrl.includes(',') ? pdfDataUrl.split(',')[1] : pdfDataUrl;
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  onProgress(20, 'Abrindo documento PDF da fatura...');
  const loadingTask = window.pdfjsLib.getDocument({ data: bytes });
  const pdfDoc = await loadingTask.promise;

  const allPagesLines = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const pct = Math.round(20 + (pageNum / pdfDoc.numPages) * 40);
    onProgress(pct, `Lendo página ${pageNum} de ${pdfDoc.numPages} do PDF...`);

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Agrupa fragmentos de texto pela coordenada Y (tolerância de 3.2 unidades)
    const rowsByY = [];
    for (const item of textContent.items) {
      const str = (item.str || '').trim();
      if (!str) continue;
      const x = item.transform ? item.transform[4] : 0;
      const y = item.transform ? item.transform[5] : 0;

      let existingRow = rowsByY.find(r => Math.abs(r.y - y) <= 3.2);
      if (!existingRow) {
        existingRow = { y, items: [] };
        rowsByY.push(existingRow);
      }
      existingRow.items.push({ x, str });
    }

    // Ordena de cima para baixo (Y decrescente no PDF) e da esquerda para a direita (X crescente)
    rowsByY.sort((a, b) => b.y - a.y);
    for (const row of rowsByY) {
      row.items.sort((a, b) => a.x - b.x);
      const lineStr = row.items.map(i => i.str).join('  ').trim();
      if (lineStr) {
        allPagesLines.push(lineStr);
      }
    }
  }

  return allPagesLines.join('\n');
}

/**
 * Aplica as Regras Inteligentes da Fatura Bradesco Cartões sobre uma lista bruta de lançamentos
 * (seja vinda do Gemini Vision ou do parser de texto PDF.js)
 */
function postProcessInvoiceItems(rawItems = [], defaultMonthStr = '2026-10', holderName = 'GABRIEL GODOY LIMA') {
  const defaultOwner = /mirela/i.test(holderName) && !/gabriel/i.test(holderName) ? 'mirela' : 'gabriel';
  const yearStr = (defaultMonthStr || new Date().toISOString().slice(0, 7)).split('-')[0] || '2026';
  const fallbackMonth = (defaultMonthStr || new Date().toISOString().slice(0, 7)).split('-')[1] || '10';

  const cleaned = [];
  const reversals = [];

  for (const raw of rawItems) {
    const originalDesc = String(raw.historico || raw.descricao || raw.merchant || '').replace(/\s+/g, ' ').trim();
    if (!originalDesc || originalDesc.length < 2) continue;

    // Regra 2: Ignorar Linhas de Controle Bancário (SALDO ANTERIOR, PAGTO. POR DEB EM C/C, Totais)
    if (IGNORED_STATEMENT_LINE_PATTERNS.some(rx => rx.test(originalDesc))) {
      continue;
    }

    const signedVal = typeof raw.valor === 'number'
      ? raw.valor
      : parseFlexibleOCRNumber(raw.valor ?? raw.amount, true);
    const absVal = Math.abs(signedVal);
    if (absVal <= 0.009) continue;

    // Normaliza data (ex: "15/09" -> "2026-09-15" ou usa o mês selecionado)
    let isoDate = `${yearStr}-${fallbackMonth}-10`;
    const rawDate = String(raw.data || raw.date || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      isoDate = `${defaultMonthStr}-${rawDate.slice(8, 10)}`;
    } else {
      const dmMatch = rawDate.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      if (dmMatch) {
        const d = String(dmMatch[1]).padStart(2, '0');
        isoDate = `${defaultMonthStr}-${d}`;
      }
    }

    // Regra 3: Detecta se é uma linha de Reversão / Estorno (ex: "REVERSAO DE COMPRA A VIST -531,86")
    const isReversalLine =
      /reversao\s+de\s+compra|estorno|credito\s+em\s+fatura|cancelamento\s+de\s+compra/i.test(originalDesc) ||
      signedVal < 0;

    if (isReversalLine) {
      reversals.push({
        description: originalDesc,
        amount: absVal,
        date: isoDate,
        matched: false
      });
      continue;
    }

    // Classifica o estabelecimento segundo as regras Bradesco Cartões
    const classification = classifyBradescoStatementItem(originalDesc, defaultOwner);

    // Se o Gemini enviou um responsável explícito ou setor, combina com a regra determinística
    let owner = classification.suggestedOwner;
    if (raw.responsavel && /mirela/i.test(String(raw.responsavel))) {
      owner = 'mirela';
    } else if (raw.responsavel && /casal/i.test(String(raw.responsavel))) {
      owner = 'casal';
    }

    let sector = classification.sector;
    if (!classification.needsReview && raw.setor) {
      sector = normalizeGeminiSector(raw.setor, originalDesc);
    } else if (classification.needsReview && raw.setor && !/outros|revisao/i.test(String(raw.setor))) {
      sector = normalizeGeminiSector(raw.setor, originalDesc);
    }

    const needsReview = Boolean(classification.needsReview || raw.revisaoNecessaria === true);

    cleaned.push({
      id: 'inv_item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      date: isoDate,
      originalDescription: originalDesc,
      merchant: originalDesc,
      amount: absVal,
      owner,
      sector,
      paymentMethod: 'Cartão de Crédito',
      needsReview,
      isFeeOrTax: classification.isFeeOrTax,
      isReversed: false,
      reversalNote: '',
      included: true
    });
  }

  // Regra 3: Abate/Emparelha automaticamente estornos ("REVERSAO DE COMPRA A VIST") com a compra de mesmo valor
  for (const rev of reversals) {
    const matchIdx = cleaned.findIndex(
      item => !item.isReversed && Math.abs(item.amount - rev.amount) < 0.02
    );
    if (matchIdx !== -1) {
      cleaned[matchIdx].isReversed = true;
      cleaned[matchIdx].included = false; // Desmarcado por padrão pois foi estornado!
      cleaned[matchIdx].needsReview = true; // Exibe no topo para o usuário ver/confirmar o abatimento
      cleaned[matchIdx].reversalNote = `Abatido automaticamente por "${rev.description}" (-R$ ${rev.amount.toFixed(2).replace('.', ',')})`;
    }
  }

  return {
    tipo: 'fatura_cartao',
    titular: holderName,
    reversalsCount: reversals.length,
    items: cleaned
  };
}

/**
 * Parser determinístico de texto bruto de Fatura Bradesco Cartões (extraído via PDF.js ou OCR)
 */
function parseBradescoStatementText(rawText = '', defaultMonthStr = '2026-10') {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const upperFull = rawText.toUpperCase();
  const isCardStatement =
    upperFull.includes('BRADESCO') ||
    upperFull.includes('FATURA') ||
    upperFull.includes('SALDO ANTERIOR') ||
    upperFull.includes('HISTORICO') ||
    upperFull.includes('GABRIEL GODOY LIMA') ||
    upperFull.includes('PAGTO. POR DEB');

  const holderName = upperFull.includes('GABRIEL GODOY LIMA')
    ? 'GABRIEL GODOY LIMA'
    : 'GABRIEL GODOY LIMA';

  const extractedRows = [];

  // Regex que captura linhas no padrão de fatura:
  // Ex: "12/09  UBER * PENDING SAO PAULO   0,00   24,90" ou "15/09  JIM.COM MARIA EDUARDA SIL  531,86"
  // Ou "21/09  REVERSAO DE COMPRA A VIST  -531,86"
  const lineRegex = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\s*\d{1,3}(?:\.\d{3})*,\d{2}-?|-?\s*\d+,\d{2}-?)$/;

  for (const line of lines) {
    if (IGNORED_STATEMENT_LINE_PATTERNS.some(rx => rx.test(line))) {
      continue;
    }

    const match = line.match(lineRegex);
    if (match) {
      const datePart = match[1].trim();
      let descPart = match[2].trim();
      const valPart = match[3].trim();

      // Remove colunas finais de moeda/cotação se estiverem grudadas no final da descrição (ex: "USD 0,00 0,00")
      descPart = descPart
        .replace(/\s+(?:USD|BRL|R\$|US\$)?\s*\d+,\d{2}(?:\s+\d+,\d{2,4})?$/i, '')
        .trim();

      if (descPart.length >= 2 && !IGNORED_STATEMENT_LINE_PATTERNS.some(rx => rx.test(descPart))) {
        extractedRows.push({
          data: datePart,
          historico: descPart,
          valor: valPart
        });
      }
    }
  }

  if (extractedRows.length >= 2 || (isCardStatement && extractedRows.length >= 1)) {
    return postProcessInvoiceItems(extractedRows, defaultMonthStr, holderName);
  }

  return null;
}

/**
 * Verifica se o texto bruto do OCR local é um Print da Planilha Mensal (Gabriel & Mirela)
 */
function tryParseCoupleTableFromOCRText(rawText = '') {
  const upper = rawText.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hasCoupleMarkers =
    upper.includes('SALARIO GABRIEL') ||
    upper.includes('SALARIO MIRELA') ||
    upper.includes('DESPESAS GABRIEL') ||
    upper.includes('DESPESAS MIRELA');

  if (!hasCoupleMarkers) return null;

  let salarioGabriel = 0;
  let salarioMirela = 0;
  const despesasGabriel = [];
  const despesasMirela = [];

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const lineNorm = lines[i].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lineNorm.includes('SALARIO GABRIEL') || lineNorm.includes('SALARIO MIRELA')) {
      const nextLine = lines[i + 1] || '';
      const matches = nextLine.match(/(?:R\$\s*)?\d[\d\s\.]*(?:,\d{2})?/g) || [];
      const nums = matches.map(m => parseFlexibleOCRNumber(m)).filter(n => n > 100);
      if (lineNorm.includes('SALARIO GABRIEL') && lineNorm.includes('SALARIO MIRELA')) {
        if (nums[0]) salarioGabriel = nums[0];
        if (nums[1]) salarioMirela = nums[1];
      } else if (lineNorm.includes('SALARIO GABRIEL') && nums[0]) {
        salarioGabriel = nums[0];
      } else if (lineNorm.includes('SALARIO MIRELA') && nums[0]) {
        salarioMirela = nums[0];
      }
    }
  }

  let inExpensesSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNorm = line.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (lineNorm.includes('DESPESAS GABRIEL') || lineNorm.includes('DESPESAS MIRELA')) {
      inExpensesSection = true;
      continue;
    }
    if (!inExpensesSection) continue;
    if (lineNorm.includes('TOTAL DE GASTOS')) break;

    const pairRegex = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9\s]{1,28}?)\s+(?:R\$\s*)?(\d{1,3}(?:[\.\s]\d{3})*(?:,\d{2})|\d+(?:,\d{2})?)/g;
    const foundPairs = [];
    let match;
    while ((match = pairRegex.exec(line)) !== null) {
      const desc = match[1].replace(/\bR\$$/i, '').trim();
      const val = parseFlexibleOCRNumber(match[2]);
      if (desc && !/^(DESPESA|VALOR|TOTAL)/i.test(desc) && val > 0) {
        foundPairs.push({
          descricao: desc,
          valor: val,
          setor: classifyMerchantSector(desc, '')
        });
      }
    }

    if (foundPairs.length >= 2) {
      despesasGabriel.push(foundPairs[0]);
      despesasMirela.push(foundPairs[1]);
    } else if (foundPairs.length === 1) {
      despesasGabriel.push(foundPairs[0]);
    }
  }

  if (salarioGabriel > 0 || salarioMirela > 0 || despesasGabriel.length > 0 || despesasMirela.length > 0) {
    return {
      tipo: 'planilha_casal',
      salarioGabriel,
      salarioMirela,
      despesasGabriel,
      despesasMirela
    };
  }

  return null;
}

/**
 * Extrai dados de um texto bruto do OCR (Fatura Bradesco, Tabela Casal ou Comprovante Único)
 */
function parseReceiptText(rawText = '', defaultMonthStr = '2026-10') {
  const bradescoInvoice = parseBradescoStatementText(rawText, defaultMonthStr);
  if (bradescoInvoice && bradescoInvoice.items.length > 0) {
    return bradescoInvoice;
  }

  const coupleTable = tryParseCoupleTableFromOCRText(rawText);
  if (coupleTable) {
    return coupleTable;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 1);

  const fullText = lines.join('\n');

  let amount = 0;
  const totalRegexes = [
    /(?:total\s*(?:pago|da\s*compra|do\s*pedido|a\s*pagar|geral)?|valor\s*(?:total|da\s*corrida|transferido|pago|do\s*pix)?)[^\d\n]{0,25}(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/gi,
    /r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/gi,
    /\b(\d{1,4},\d{2})\b/g
  ];

  const foundAmounts = [];
  for (const regex of totalRegexes) {
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      const rawVal = match[1].replace(/\.(?=\d{3},)/g, '').replace(',', '.');
      const num = parseFloat(rawVal);
      if (!isNaN(num) && num > 0 && num < 100000) {
        foundAmounts.push(num);
      }
    }
    if (foundAmounts.length > 0) break;
  }

  if (foundAmounts.length > 0) {
    amount = Math.max(...foundAmounts);
  }

  const now = new Date();
  let dateStr = now.toISOString().slice(0, 10);
  let timeStr = now.toTimeString().slice(0, 5);

  const monthsMap = {
    jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
    jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
  };

  const dateNumericMatch = fullText.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})\b/);
  const dateTextMatch = fullText.match(/\b(0?[1-9]|[12]\d|3[01])\s*(?:de\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\s*(?:de\s*)?(20\d{2})?\b/i);

  if (dateNumericMatch) {
    const day = dateNumericMatch[1].padStart(2, '0');
    const month = dateNumericMatch[2].padStart(2, '0');
    let year = dateNumericMatch[3];
    if (year.length === 2) year = '20' + year;
    dateStr = `${year}-${month}-${day}`;
  } else if (dateTextMatch) {
    const day = dateTextMatch[1].padStart(2, '0');
    const mKey = dateTextMatch[2].toLowerCase().slice(0, 3);
    const month = monthsMap[mKey] || String(now.getMonth() + 1).padStart(2, '0');
    const year = dateTextMatch[3] || String(now.getFullYear());
    dateStr = `${year}-${month}-${day}`;
  }

  const timeMatch = fullText.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/);
  if (timeMatch) {
    timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')}`;
  }

  let merchant = '';
  const knownBrands = [
    { pattern: /\bifood\b|ifd\*/i, label: 'iFood' },
    { pattern: /\brappi\b/i, label: 'Rappi' },
    { pattern: /\bz[eé]\s*delivery\b/i, label: 'Zé Delivery' },
    { pattern: /\buber\s*eats\b/i, label: 'Uber Eats' },
    { pattern: /\buber\b/i, label: 'Uber' },
    { pattern: /\b99\s*(?:pop|app|tecnologia|corrida)\b|\b99\*/i, label: '99 App' },
    { pattern: /\bmercado\s*livre\b|\bmeli\b/i, label: 'Mercado Livre' },
    { pattern: /\bamazon\b/i, label: 'Amazon' },
    { pattern: /\bshopee\b/i, label: 'Shopee' },
    { pattern: /\bshein\b/i, label: 'Shein' },
    { pattern: /\bdroga\s*raia\b/i, label: 'Droga Raia' },
    { pattern: /\bdrogasil\b/i, label: 'Drogasil' },
    { pattern: /\bpague\s*menos\b/i, label: 'Farmácia Pague Menos' },
    { pattern: /\bsmart\s*fit\b/i, label: 'Smart Fit' },
    { pattern: /\bcarrefour\b/i, label: 'Carrefour' },
    { pattern: /\bassai\b|\bassaí\b/i, label: 'Assaí Atacadista' },
    { pattern: /\batacadao\b|\batacadão\b/i, label: 'Atacadão' },
    { pattern: /\bp[aã]o\s*de\s*a[cç][uú]car\b/i, label: 'Pão de Açúcar' },
    { pattern: /\bnetflix\b/i, label: 'Netflix' },
    { pattern: /\bspotify\b/i, label: 'Spotify' },
    { pattern: /\bshell\b/i, label: 'Posto Shell' },
    { pattern: /\bipiranga\b/i, label: 'Posto Ipiranga' },
    { pattern: /\bsem\s*parar\b/i, label: 'Sem Parar' },
    { pattern: /\bmcdonald'?s\b|\barcos\s*dourados\b/i, label: "McDonald's" },
    { pattern: /\bburger\s*king\b/i, label: 'Burger King' },
    { pattern: /\boutback\b/i, label: 'Outback Steakhouse' }
  ];

  const receiverMatch = fullText.match(/(?:para|recebedor|favorecido|estabelecimento|destino|restaurante|loja)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9\s&\.\-]{3,40})/i);

  for (const b of knownBrands) {
    if (b.pattern.test(fullText)) {
      merchant = b.label;
      break;
    }
  }

  if (receiverMatch && receiverMatch[1]) {
    const candidate = receiverMatch[1].split('\n')[0].trim();
    if (candidate.length >= 3 && !/^(voce|você|banco|instituicao|cpf|cnpj)/i.test(candidate)) {
      merchant = merchant ? `${merchant} - ${candidate}` : candidate;
    }
  }

  if (!merchant) {
    const ignoredHeader = /comprovante|recibo|transferencia|pagamento|pix|nota fiscal|danfe|extrato|detalhes|pedido concluido|corrida/i;
    for (const line of lines.slice(0, 6)) {
      if (!ignoredHeader.test(line) && !/r\$|\d{2}\/\d{2}/i.test(line) && line.length >= 3 && line.length <= 42) {
        merchant = line;
        break;
      }
    }
  }

  if (!merchant) merchant = 'Estabelecimento Identificado';

  const owner = /mirela/i.test(fullText) ? 'mirela' : 'gabriel';
  const sector = classifyMerchantSector(merchant, fullText);
  const paymentMethod = extractPaymentMethod(fullText);

  return {
    tipo: 'compra_unica',
    amount: amount > 0 ? amount : 0,
    date: dateStr,
    time: timeStr,
    merchant: merchant.slice(0, 50),
    owner,
    sector,
    paymentMethod,
    rawText
  };
}

/**
 * Pré-processa a imagem em um Canvas para melhorar nitidez no fallback Tesseract.js
 */
async function preprocessImageForOCR(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1500;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;

      let totalLum = 0;
      for (let i = 0; i < d.length; i += 16) {
        totalLum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
      const avgLum = totalLum / (d.length / 16);
      const isDarkBackground = avgLum < 110;

      for (let i = 0; i < d.length; i += 4) {
        let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (isDarkBackground) gray = 255 - gray;
        gray = gray < 145 ? Math.max(0, gray * 0.65) : Math.min(255, gray * 1.15);
        d[i] = d[i + 1] = d[i + 2] = gray;
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Obtém a chave de API do Gemini configurada no localStorage ou no ambiente local (.env / env-local.js)
 */
function getConfiguredGeminiApiKey() {
  const fromStorage = localStorage.getItem('godoyfin_gemini_api_key');
  if (fromStorage && fromStorage.trim().length > 10) {
    return fromStorage.trim();
  }
  if (typeof window.__VITE_GEMINI_API_KEY__ === 'string' && window.__VITE_GEMINI_API_KEY__.trim().length > 10) {
    return window.__VITE_GEMINI_API_KEY__.trim();
  }
  return '';
}

/**
 * FUNÇÃO PRINCIPAL DE LEITURA DE IMAGEM OU FATURA PDF COM GEMINI 2.5 FLASH + FALLBACK PDF.JS / TESSERACT
 */
async function recognizeReceiptFromImage(fileDataUrl, onProgress = () => {}, defaultMonthStr = '2026-10') {
  const geminiKey = getConfiguredGeminiApiKey();
  const mimeType = fileDataUrl.substring(fileDataUrl.indexOf(':') + 1, fileDataUrl.indexOf(';')) || 'image/png';
  const isPdf = mimeType === 'application/pdf';

  // Se for PDF, também podemos extrair o texto via PDF.js para ter 100% de garantia
  let extractedPdfText = '';
  if (isPdf) {
    try {
      extractedPdfText = await extractTextFromPDFDataUrl(fileDataUrl, onProgress);
    } catch (pdfErr) {
      console.warn('Aviso ao extrair texto preliminar via PDF.js:', pdfErr);
    }
  }

  if (geminiKey.length > 10) {
    try {
      onProgress(55, isPdf
        ? 'Analisando todas as páginas da Fatura PDF com Gemini 2.5 Flash...'
        : 'Enviando comprovante/fatura para Google Gemini Vision (gemini-2.5-flash)...'
      );

      const base64Clean = fileDataUrl.split(',')[1];

      const systemPrompt = `Você é o motor de inteligência financeira do aplicativo Nosso Bolso (Gabriel & Mirela).
Analise o arquivo enviado (Imagem ou Fatura PDF de Cartão de Crédito, especialmente modelo Aplicativo Bradesco Cartões: Data | Histórico | Moeda | US$ | Cotação | R$) e retorne ESTRITAMENTE um JSON válido (sem markdown extra) em um dos cenários abaixo:

CENÁRIO 1: FATURA DE CARTÃO DE CRÉDITO OU LISTA COM MÚLTIPLOS LANÇAMENTOS (Ex: Fatura Bradesco Cartões em PDF ou Print)
Aplique estas regras obrigatórias:
1. Titular: Se constar "GABRIEL GODOY LIMA", o responsável padrão é "Gabriel". Porém, se o histórico do item contiver "CAROLINE MIRELA" (ex: "JIM.COM CAROLINE MIRELA L"), defina responsavel como "Mirela".
2. IGNORE completamente linhas de controle bancário: "SALDO ANTERIOR", "PAGTO. POR DEB EM C/C", "Total para GABRIEL GODOY LIMA", "Total da Fatura em Real".
3. Inclua linhas de estorno como "REVERSAO DE COMPRA A VIST" com valor negativo (ex: -531.86) para abatimento automático.
4. Classifique no campo "setor" usando um destes 5 valores: "transporte", "delivery", "mercado", "saude", "compras":
   - "transporte": UBER * PENDING, DL*UberRides, DL *UberRides, DL*99 RIDE, 99*, BILHUNICO, BARRA FUNDA.
   - "delivery": IFD*iFood, KEETABR*, BOBS TATUAPE, AxixCafeteriaLtda, PAD ROK, RESTAURANTE E LANCHONE, BELO BOI CARNES, BARIO TATUAPE, D. VERISSIMO LANCHES, GeladaoPremium, MILHO VERDE.
   - "mercado": IFD*C CARREFOUR COMERCIO, SeuMart, OXXO MATARAZZO, MERCADO EXPRESS RUDGE, MINI MERCADO APARECIDA, MERCADEGALOJABAR DOMI.
   - "saude": DROGAREIMS TERMINAL, DROGA RUDGE, PETLOVE SAUD*Petl, COBASI BRAZ LEME, IKESAKI.
   - "compras": MERCADOLIVRE*, SHOPEE *, SHEIN *, PERNAMBUCANAS, CONSTANCE, enjoei*, Amazon Prime Canais, Amazon PrimeBR, APPLE.COM/BILL, MP*MELIMAIS, CINEMARK BRASIL, KARTODROMO INTER SP, Panini Brasil, SH WEST PLAZA, FAAP Online, FMU, PIX PARC CARTAO CREDITO, ENCARGOS SOBRE PARCELADO, IOF DIARIO SOBRE PARCELAD, IOF ADICIONAL SOBRE PARCE.
5. Se o lançamento for ambíguo ou nome de pessoa/empresa genérica (ex: GP DE CARVALHO, ASAS ADMINISTRACAO LT, 60.544.248 ADONIAS DE SOU, GISELE DE CARVALHO, JIM.COM MARIA EDUARDA SIL, MP*INVESTPAG, MP*KOKESHI, PARAISO DAS ESSENCIA), marque "revisaoNecessaria": true.

Formato JSON para CENÁRIO 1:
{
  "tipo": "fatura_cartao",
  "titular": "GABRIEL GODOY LIMA",
  "lancamentos": [
    {
      "data": "DD/MM",
      "historico": "Descrição exata da fatura",
      "valor": 0.00,
      "setor": "transporte | delivery | mercado | saude | compras",
      "responsavel": "Gabriel | Mirela",
      "revisaoNecessaria": false
    }
  ]
}

CENÁRIO 2: PRINT DE COMPRA ÚNICA (Recibo único iFood, Uber, PIX, Nota Fiscal)
{
  "tipo": "compra_unica",
  "estabelecimento": "Nome do estabelecimento",
  "valor": 0.00,
  "data": "YYYY-MM-DD",
  "hora": "HH:MM",
  "setor": "delivery | transporte | mercado | saude | compras",
  "formaPagamento": "PIX | Cartão de Crédito | Cartão de Débito | Vale-Refeição | Dinheiro",
  "responsavel": "Gabriel | Mirela"
}`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: systemPrompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Clean
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}`);
      }

      onProgress(88, 'Processando lançamentos extraídos pelo Gemini 2.5 Flash...');
      const data = await response.json();
      const textResp = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = textResp.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        onProgress(100, 'Leitura inteligente concluída!');

        // Cenário 1: Fatura de Cartão de Crédito (PDF ou Print com múltiplos lançamentos)
        if (parsed.tipo === 'fatura_cartao' || Array.isArray(parsed.lancamentos) || Array.isArray(parsed.items)) {
          const rawList = parsed.lancamentos || parsed.items || [];
          const processed = postProcessInvoiceItems(rawList, defaultMonthStr, parsed.titular || 'GABRIEL GODOY LIMA');
          if (processed.items.length > 0) {
            return processed;
          }
        }

        // Cenário Planilha Casal (legado OCR)
        if (parsed.tipo === 'planilha_casal' || Array.isArray(parsed.despesasGabriel)) {
          return {
            tipo: 'planilha_casal',
            salarioGabriel: parseFlexibleOCRNumber(parsed.salarioGabriel),
            salarioMirela: parseFlexibleOCRNumber(parsed.salarioMirela),
            despesasGabriel: (parsed.despesasGabriel || []).map(item => ({
              descricao: String(item.descricao || 'Despesa').trim(),
              valor: parseFlexibleOCRNumber(item.valor),
              setor: normalizeGeminiSector(item.setor, item.descricao)
            })).filter(i => i.valor > 0),
            despesasMirela: (parsed.despesasMirela || []).map(item => ({
              descricao: String(item.descricao || 'Despesa').trim(),
              valor: parseFlexibleOCRNumber(item.valor),
              setor: normalizeGeminiSector(item.setor, item.descricao)
            })).filter(i => i.valor > 0)
          };
        }

        // Cenário 2: Compra Única
        const merchant = parsed.estabelecimento || parsed.merchant || 'Estabelecimento';
        const amount = parseFlexibleOCRNumber(parsed.valor ?? parsed.amount);
        const rawRespOwner = String(parsed.responsavel || 'Gabriel').toLowerCase();
        const owner = rawRespOwner.includes('mirela') ? 'mirela' : 'gabriel';

        return {
          tipo: 'compra_unica',
          amount,
          date: parsed.data || parsed.date || new Date().toISOString().slice(0, 10),
          time: parsed.hora || parsed.time || new Date().toTimeString().slice(0, 5),
          merchant,
          owner,
          sector: normalizeGeminiSector(parsed.setor || parsed.sector, merchant, textResp),
          paymentMethod: parsed.formaPagamento || parsed.paymentMethod || 'PIX',
          rawText: textResp
        };
      }
    } catch (err) {
      console.warn('Gemini API indisponível ou retornou erro; acionando extrator local (PDF.js / Tesseract):', err);
      onProgress(65, 'Processando localmente com extrator inteligente (Fallback)...');
    }
  }

  // FALLBACK PARA ARQUIVO PDF (usando o texto extraído pelo PDF.js)
  if (isPdf) {
    onProgress(85, 'Classificando lançamentos da fatura PDF...');
    if (extractedPdfText && extractedPdfText.trim().length > 10) {
      const parsedPdfInvoice = parseBradescoStatementText(extractedPdfText, defaultMonthStr);
      if (parsedPdfInvoice && parsedPdfInvoice.items.length > 0) {
        onProgress(100, 'Fatura PDF lida com sucesso!');
        return parsedPdfInvoice;
      }
      return parseReceiptText(extractedPdfText, defaultMonthStr);
    }
    throw new Error('Não foi possível extrair texto deste PDF.');
  }

  // FALLBACK PARA IMAGEM (Tesseract.js + Parser Nativo)
  onProgress(35, 'Melhorando nitidez e contraste da imagem (Leitor Local)...');
  const processedDataUrl = await preprocessImageForOCR(fileDataUrl);

  if (typeof Tesseract !== 'undefined') {
    onProgress(45, 'Executando OCR óptico local...');
    const result = await Tesseract.recognize(processedDataUrl, 'por+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(45 + (m.progress || 0) * 50);
          onProgress(pct, `Lendo imagem localmente (${pct}%)...`);
        }
      }
    });
    onProgress(100, 'Classificando dados extraídos...');
    const rawText = result?.data?.text || '';
    return parseReceiptText(rawText, defaultMonthStr);
  } else {
    throw new Error('Biblioteca OCR local não carregada.');
  }
}

/**
 * Gera uma demonstração fiel da Fatura Aplicativo Bradesco Cartões (GABRIEL GODOY LIMA)
 * com todos os casos reais citados para testar a revisão interativa
 */
function generateSampleBradescoStatementResult(defaultMonthStr = '2026-10') {
  const sampleRawLines = [
    { data: '01/10', historico: 'SALDO ANTERIOR', valor: '6.011,93' },
    { data: '05/10', historico: 'PAGTO. POR DEB EM C/C', valor: '-6.011,93' },
    // Itens Ambíguos / Não Identificados -> Revisão Necessária no Topo
    { data: '06/10', historico: 'GP DE CARVALHO', valor: '89,90' },
    { data: '07/10', historico: 'ASAS ADMINISTRACAO LT', valor: '145,00' },
    { data: '08/10', historico: '60.544.248 ADONIAS DE SOU', valor: '42,50' },
    { data: '09/10', historico: 'GISELE DE CARVALHO', valor: '120,00' },
    { data: '10/10', historico: 'JIM.COM CAROLINE MIRELA L', valor: '115,00' },
    { data: '11/10', historico: 'MP*INVESTPAG', valor: '78,00' },
    { data: '12/10', historico: 'MP*KOKESHI', valor: '94,50' },
    { data: '12/10', historico: 'PARAISO DAS ESSENCIA', valor: '56,90' },
    // Compra + Estorno (Reversão automática)
    { data: '13/10', historico: 'JIM.COM MARIA EDUARDA SIL', valor: '531,86' },
    { data: '14/10', historico: 'REVERSAO DE COMPRA A VIST', valor: '-531,86' },
    // Itens Classificados Automaticamente por Setor
    { data: '14/10', historico: 'UBER * PENDING', valor: '29,90' },
    { data: '15/10', historico: 'DL*UberRides', valor: '34,40' },
    { data: '15/10', historico: 'DL*99 RIDE', valor: '22,80' },
    { data: '16/10', historico: 'BILHUNICO', valor: '50,00' },
    { data: '16/10', historico: 'IFD*iFood', valor: '68,90' },
    { data: '17/10', historico: 'BOBS TATUAPE', valor: '39,50' },
    { data: '17/10', historico: 'BELO BOI CARNES', valor: '142,00' },
    { data: '18/10', historico: 'IFD*C CARREFOUR COMERCIO', valor: '284,60' },
    { data: '18/10', historico: 'OXXO MATARAZZO', valor: '27,50' },
    { data: '19/10', historico: 'MERCADO EXPRESS RUDGE', valor: '64,20' },
    { data: '20/10', historico: 'DROGAREIMS TERMINAL', valor: '48,90' },
    { data: '20/10', historico: 'PETLOVE SAUD*Petl', valor: '119,90' },
    { data: '21/10', historico: 'COBASI BRAZ LEME', valor: '86,40' },
    { data: '22/10', historico: 'MERCADOLIVRE*2PROD', valor: '159,90' },
    { data: '22/10', historico: 'SHOPEE * Compra', valor: '67,80' },
    { data: '23/10', historico: 'Amazon PrimeBR', valor: '19,90' },
    { data: '24/10', historico: 'CINEMARK BRASIL', valor: '76,00' },
    { data: '25/10', historico: 'ENCARGOS SOBRE PARCELADO', valor: '18,45' }
  ];

  return postProcessInvoiceItems(sampleRawLines, defaultMonthStr, 'GABRIEL GODOY LIMA');
}

/**
 * Gera uma assinatura rápida da imagem/arquivo para detecção de duplicidade
 */
function computeImageSignature(dataUrl = '') {
  if (!dataUrl) return '';
  const sample = dataUrl.slice(0, 200) + dataUrl.slice(-200) + dataUrl.length;
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    hash = (hash << 5) - hash + sample.charCodeAt(i);
    hash |= 0;
  }
  return 'img_' + Math.abs(hash).toString(16);
}

/**
 * Gerador de Prints de Teste em Canvas
 */
function generateSampleReceiptDataUrl(preset = 'ifood', selectedMonthStr = '2026-10') {
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 680;
  const ctx = canvas.getContext('2d');

  const day = String(Math.floor(Math.random() * 20) + 5).padStart(2, '0');
  const dateBR = `${day}/${selectedMonthStr.split('-')[1]}/${selectedMonthStr.split('-')[0]}`;

  const presets = {
    ifood: {
      bg: '#ffffff',
      headerBg: '#ea1d2c',
      title: 'iFood - Detalhes do Pedido',
      subtitle: 'Pedido #8492 concluído',
      merchantLine: 'Restaurante: Burger House Gourmet',
      items: [
        '1x Combo Smash Duplo Bacon      R$ 42,90',
        '1x Batata Rústica Grande        R$ 16,00',
        'Taxa de entrega                 R$ 6,00'
      ],
      total: 'R$ 64,90',
      payment: 'Pagamento pelo app: PIX',
      date: `${dateBR} 20:42`
    },
    uber: {
      bg: '#f8fafc',
      headerBg: '#0f172a',
      title: 'Uber - Recibo da sua viagem',
      subtitle: 'UberX • Viagem concluída',
      merchantLine: 'Estabelecimento: Uber do Brasil Tecnologia',
      items: [
        'Preço da viagem                 R$ 26,40',
        'Taxa de intermediação           R$ 2,50',
        'Pedágio urbano                  R$ 0,00'
      ],
      total: 'R$ 28,90',
      payment: 'Forma de pagamento: Cartão de Crédito Mastercard',
      date: `${dateBR} 08:15`
    },
    mercado: {
      bg: '#ffffff',
      headerBg: '#10b981',
      title: 'Comprovante de Pagamento PIX',
      subtitle: 'Transferência concluída com sucesso',
      merchantLine: 'Para: Carrefour Comércio e Indústria',
      items: [
        'Instituição: Banco Carrefour',
        'Tipo de transferência: QR Code PIX',
        'Compras de Supermercado e Hortifruti'
      ],
      total: 'R$ 342,80',
      payment: 'Pagamento via PIX',
      date: `${dateBR} 18:30`
    },
    compras: {
      bg: '#ffffff',
      headerBg: '#7c3aed',
      title: 'Mercado Livre - Compra Aprovada',
      subtitle: 'Chegará amanhã no seu endereço',
      merchantLine: 'Estabelecimento: Mercado Livre Brasil',
      items: [
        '1x Fone Bluetooth TWS Noise Cancelling',
        'Frete Full Grátis               R$ 0,00'
      ],
      total: 'R$ 189,90',
      payment: 'Forma de pagamento: Cartão de Crédito 1x',
      date: `${dateBR} 14:22`
    },
    saude: {
      bg: '#ffffff',
      headerBg: '#0891b2',
      title: 'Droga Raia - Cupom Fiscal',
      subtitle: 'Raia Drogasil S/A',
      merchantLine: 'Loja: Droga Raia Jardins',
      items: [
        '1x Vitamina C + Zinco 60 caps   R$ 49,90',
        '1x Protetor Solar Facial FPS60  R$ 78,50'
      ],
      total: 'R$ 128,40',
      payment: 'Forma de pagamento: Cartão de Débito',
      date: `${dateBR} 11:05`
    }
  };

  const p = presets[preset] || presets.ifood;

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = p.headerBg;
  ctx.fillRect(0, 0, canvas.width, 125);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText(p.title, 32, 58);
  ctx.font = '18px Arial, sans-serif';
  ctx.fillText(p.subtitle, 32, 95);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 21px Arial, sans-serif';
  ctx.fillText(p.merchantLine, 32, 185);

  ctx.font = '18px Arial, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Data e Hora: ${p.date}`, 32, 225);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(32, 255);
  ctx.lineTo(488, 255);
  ctx.stroke();

  ctx.font = '18px Courier New, monospace';
  ctx.fillStyle = '#1e293b';
  let y = 300;
  for (const item of p.items) {
    ctx.fillText(item, 32, y);
    y += 42;
  }

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(32, 450, 456, 95);
  ctx.strokeStyle = '#94a3b8';
  ctx.strokeRect(32, 450, 456, 95);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText(`Valor Total: ${p.total}`, 52, 508);

  ctx.font = 'bold 19px Arial, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(p.payment, 32, 595);

  ctx.font = '15px Arial, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Comprovante autenticado digitalmente • Nosso Bolso OCR', 32, 640);

  return canvas.toDataURL('image/png');
}

window.OCRService = {
  SECTOR_DICTIONARY,
  classifyMerchantSector,
  classifyBradescoStatementItem,
  normalizeGeminiSector,
  extractPaymentMethod,
  parseReceiptText,
  parseBradescoStatementText,
  postProcessInvoiceItems,
  extractTextFromPDFDataUrl,
  recognizeReceiptFromImage,
  computeImageSignature,
  generateSampleReceiptDataUrl,
  generateSampleBradescoStatementResult,
  getConfiguredGeminiApiKey
};

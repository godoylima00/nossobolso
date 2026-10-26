// ============================================================================
// build.js — Compilador Front-end & Injeção de Variáveis de Ambiente da Vercel
// Gera a pasta de saída "dist" exigida pela Vercel com todos os arquivos estáticos
// ============================================================================

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');

// 1. Lê as variáveis de ambiente configuradas no painel da Vercel
const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const geminiApiKey = (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

console.log('[Build] Iniciando compilação do front-end...');
console.log('[Build] Supabase URL configurada:', !!supabaseUrl);
console.log('[Build] Supabase Anon Key configurada:', !!supabaseAnonKey);

// 2. Cria a pasta dist limpa
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 3. Gera o arquivo env-config.js (na raiz e na pasta dist)
const envConfigContent = `// Gerado automaticamente durante o build da Vercel
window.__VITE_ENV__ = {
  VITE_SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
  VITE_SUPABASE_ANON_KEY: ${JSON.stringify(supabaseAnonKey)},
  VITE_GEMINI_API_KEY: ${JSON.stringify(geminiApiKey)}
};
`;

fs.writeFileSync(path.join(rootDir, 'env-config.js'), envConfigContent, 'utf-8');
fs.writeFileSync(path.join(distDir, 'env-config.js'), envConfigContent, 'utf-8');

// Cria um env-local.js seguro e vazio na dist para evitar erro 404
fs.writeFileSync(
  path.join(distDir, 'env-local.js'),
  '// env-local.js de produção\nwindow.GODOY_ENV = window.GODOY_ENV || {};\n',
  'utf-8'
);

// 4. Compila o index.html para dist/index.html injetando as variáveis no <head>
let indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

// Injeta as variáveis de ambiente estáticas diretamente no HTML
const inlineEnvScript = `
  <script>
    window.__VITE_ENV__ = {
      VITE_SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
      VITE_SUPABASE_ANON_KEY: ${JSON.stringify(supabaseAnonKey)},
      VITE_GEMINI_API_KEY: ${JSON.stringify(geminiApiKey)}
    };
  </script>
`;

if (indexHtml.includes('<!-- Tailwind CSS CDN -->')) {
  indexHtml = indexHtml.replace('<!-- Tailwind CSS CDN -->', inlineEnvScript + '\n  <!-- Tailwind CSS CDN -->');
} else {
  indexHtml = indexHtml.replace('</head>', inlineEnvScript + '\n</head>');
}

fs.writeFileSync(path.join(distDir, 'index.html'), indexHtml, 'utf-8');

// 5. Compila e copia src/lib/supabase.js com substituição estática das variáveis Vite
const srcLibDir = path.join(distDir, 'src', 'lib');
fs.mkdirSync(srcLibDir, { recursive: true });

let supabaseJs = fs.readFileSync(path.join(rootDir, 'src', 'lib', 'supabase.js'), 'utf-8');

// Substitui estaticamente import.meta.env.VITE_* se as variáveis existirem no build
if (supabaseUrl) {
  supabaseJs = supabaseJs.replace(
    /import\.meta\.env\.VITE_SUPABASE_URL/g,
    JSON.stringify(supabaseUrl)
  );
}
if (supabaseAnonKey) {
  supabaseJs = supabaseJs.replace(
    /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/g,
    JSON.stringify(supabaseAnonKey)
  );
}

fs.writeFileSync(path.join(srcLibDir, 'supabase.js'), supabaseJs, 'utf-8');

// 6. Copia os arquivos essenciais para a pasta dist
const staticFiles = [
  'app.js',
  'ocr-engine.js',
  'styles.css',
  'supabase-schema.sql',
  'package.json'
];

for (const file of staticFiles) {
  const srcPath = path.join(rootDir, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(distDir, file));
  }
}

// 7. Copia a pasta api (Serverless Functions) se existir
const apiSrcDir = path.join(rootDir, 'api');
const apiDistDir = path.join(distDir, 'api');
if (fs.existsSync(apiSrcDir)) {
  fs.mkdirSync(apiDistDir, { recursive: true });
  const apiFiles = fs.readdirSync(apiSrcDir);
  for (const f of apiFiles) {
    fs.copyFileSync(path.join(apiSrcDir, f), path.join(apiDistDir, f));
  }
}

console.log('[Build] Compilação concluída com sucesso!');
console.log('[Build] Diretório "dist" gerado com:', fs.readdirSync(distDir).join(', '));

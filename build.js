// build.js — Script de Build executado pela Vercel (npm run build)
// Injeta com segurança as variáveis de ambiente configuradas no painel da Vercel em env-config.js
const fs = require('fs');
const path = require('path');

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const geminiApiKey = (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();

const envContent = `// Arquivo gerado automaticamente durante o build da Vercel
window.__VITE_ENV__ = {
  VITE_SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
  VITE_SUPABASE_ANON_KEY: ${JSON.stringify(supabaseAnonKey)},
  VITE_GEMINI_API_KEY: ${JSON.stringify(geminiApiKey)}
};
`;

fs.writeFileSync(path.join(__dirname, 'env-config.js'), envContent, 'utf-8');

console.log('[Vercel Build] env-config.js gerado com sucesso.');
console.log('Supabase URL presente:', !!supabaseUrl);
console.log('Supabase Anon Key presente:', !!supabaseAnonKey);

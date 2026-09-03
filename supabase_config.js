/**
 * Eldorado Pesca & Lake - Configuração de Conexão com o Supabase
 * Suporte transparente para navegador (Web/PWA) e ambiente Node.js
 */

const isNode = typeof process !== 'undefined' && process.env;

const SUPABASE_CONFIG = {
  // Ativado para conectar ao Supabase na nuvem
  USE_SUPABASE: true,

  // URL do projeto Supabase
  SUPABASE_URL: (isNode && process.env.SUPABASE_URL) || 'https://tfttmfbfzyymuwiwpxyw.supabase.co',

  // Chave Pública / Publishable Key (Segura para Frontend com RLS)
  SUPABASE_ANON_KEY: (isNode && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)) || 'sb_publishable_Iavy0YRY6OLtkz5mnizE2w_S4aFkRxY',
  SUPABASE_PUBLISHABLE_KEY: (isNode && (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)) || 'sb_publishable_Iavy0YRY6OLtkz5mnizE2w_S4aFkRxY',

  // Chave Secreta (Service Role) - Exclusivo para scripts administrativos via variável de ambiente.
  SUPABASE_SECRET_KEY: (isNode && process.env.SUPABASE_SECRET_KEY) || '',

  // JWKS URL para validação de JWTs
  SUPABASE_JWKS_URL: (isNode && process.env.SUPABASE_JWKS_URL) || 'https://tfttmfbfzyymuwiwpxyw.supabase.co/auth/v1/.well-known/jwks.json',

  // Organização Principal da Eldorado Pesca (Garante sincronização transparente entre Mobile, Desktop e Web)
  DEFAULT_ORG_ID: '00000000-0000-0000-0000-000000000001'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SUPABASE_CONFIG;
}

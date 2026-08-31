/**
 * Eldorado Pesca & Lake - Configuração de Conexão com o Supabase
 * 
 * Quando for conectar ao Supabase:
 * 1. Crie seu projeto gratuito em https://supabase.com
 * 2. Cole as credenciais abaixo e mude USE_SUPABASE para true
 */

const SUPABASE_CONFIG = {
  // Altere para true quando for ativar o Supabase
  USE_SUPABASE: false,

  // URL do seu projeto Supabase (ex: 'https://xyzcompany.supabase.co')
  SUPABASE_URL: 'https://SEU_PROJETO.supabase.co',

  // Chave Anon / Public Key do Supabase (Project Settings -> API -> anon/public)
  SUPABASE_ANON_KEY: 'SUA_CHAVE_ANON_AQUI'
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SUPABASE_CONFIG;
}

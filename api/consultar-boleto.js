/**
 * Endpoint Serverless para Consulta Externa de Boleto
 * Arquitetura preparada para integração futura com provedores de liquidação/validação bancária.
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const code = (req.method === 'POST' ? req.body?.code : req.query?.code) || '';
  const cleanCode = String(code).replace(/\D/g, '');

  if (!cleanCode || (cleanCode.length !== 44 && cleanCode.length !== 47 && cleanCode.length !== 48)) {
    return res.status(400).json({
      valid: false,
      error: 'Código de boleto inválido. Esperado 44, 47 ou 48 dígitos.'
    });
  }

  // Camada preparada para consultar API parceira (ex: Celcoin, Cora, Asaas, etc.) via variáveis de ambiente
  const PROVIDER_API_URL = process.env.BOLETO_QUERY_API_URL;
  const PROVIDER_API_KEY = process.env.BOLETO_QUERY_API_KEY;

  if (PROVIDER_API_URL && PROVIDER_API_KEY) {
    try {
      const response = await fetch(`${PROVIDER_API_URL}?code=${cleanCode}`, {
        headers: { 'Authorization': `Bearer ${PROVIDER_API_KEY}` }
      });
      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      console.warn('[API Consultar Boleto] Provedor externo indisponível:', err);
    }
  }

  // Fallback: Retorna resposta arquitetural
  return res.status(200).json({
    available: false,
    message: 'Consulta externa não configurada. A validação matemática local permanece ativa.',
    code: cleanCode
  });
};

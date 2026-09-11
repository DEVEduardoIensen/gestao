/**
 * Endpoint Serverless (Vercel / Node.js) para OCR de Boletos
 * Executa o OCR de forma segura no servidor, protegendo a chave de API contra exposição no cliente.
 */

module.exports = async function handler(req, res) {
  // Configura CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Utilize POST com { base64Image }.' });
  }

  try {
    const { base64Image } = req.body || {};
    if (!base64Image) {
      return res.status(400).json({ error: 'Imagem em base64 não fornecida.' });
    }

    const apiKey = process.env.OCR_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: 'OCR_API_KEY não configurada no servidor. O sistema continuará operando com o motor OCR local.'
      });
    }

    const formData = new URLSearchParams();
    formData.append('base64Image', base64Image);
    formData.append('language', 'por');
    formData.append('isTable', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'apikey': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`API externa retornou status ${response.status}`);
    }

    const json = await response.json();
    const parsedText = (json && json.ParsedResults && json.ParsedResults.length > 0)
      ? (json.ParsedResults[0].ParsedText || '')
      : '';

    return res.status(200).json({
      success: true,
      parsedText,
      exitCode: json.OCRExitCode
    });
  } catch (err) {
    console.error('[API OCR] Falha no processamento:', err);
    return res.status(500).json({
      error: 'Falha ao processar OCR em nuvem.',
      details: err.message
    });
  }
};

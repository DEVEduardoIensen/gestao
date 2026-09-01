/**
 * Eldorado Pesca & Lake - API Serverless Vercel
 * Serves health check & cloud metadata.
 * Main data storage is fully powered by Supabase PostgreSQL (Multi-tenant & Offline-First Dexie.js).
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    name: 'Eldorado Pesca & Lake Cloud API',
    status: 'online',
    version: '2.0.0',
    database: 'Supabase PostgreSQL + Dexie.js Offline Outbox',
    timestamp: new Date().toISOString()
  });
};

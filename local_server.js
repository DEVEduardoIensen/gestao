/**
 * Eldorado Pesca Manager - Backend Server & API REST
 * Servidor HTTP nativo Node.js com persistência SQLite
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { db, initDatabase, getAllData, checkpointDatabase } = require('./database.js');

// Initialize SQLite Database
initDatabase();

// Local date formatting helper (prevents UTC timezone shift in Brazil)
function getLocalDateStr(d = new Date()) {
  if (typeof d === 'string') {
    if (d.includes('T')) d = new Date(d);
    else {
      const parts = d.split('-');
      if (parts.length === 3) return d;
    }
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Create backups directory if not exists
const BACKUPS_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/**
 * Realiza snapshot automático de segurança
 */
function createAutoBackupSnapshot() {
  try {
    checkpointDatabase();
    const data = getAllData();
    const dateStr = getLocalDateStr();
    const backupFile = path.join(BACKUPS_DIR, `backup_auto_eldorado_${dateStr}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Auto backup snapshot failed:', e);
  }
}

createAutoBackupSnapshot();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // GET /api/data - Carrega todos os dados do SQLite
  if (req.method === 'GET' && pathname === '/api/data') {
    try {
      const data = getAllData();
      sendJson(res, 200, data);
    } catch (err) {
      console.error('Error fetching data:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /api/supabase/config - Retorna status e configurações do Supabase
  if (req.method === 'GET' && pathname === '/api/supabase/config') {
    let cfg = {};
    try {
      cfg = require('./supabase_config.js');
    } catch (e) {}
    sendJson(res, 200, {
      useSupabase: !!cfg.USE_SUPABASE,
      supabaseUrl: cfg.SUPABASE_URL || '',
      supabaseAnonKey: cfg.SUPABASE_ANON_KEY || ''
    });
    return;
  }

  // POST /api/raffles/number - Atualizar status de um número na rifa
  if (req.method === 'POST' && pathname === '/api/raffles/number') {
    readJsonBody(req, (err, body) => {
      if (err || !body.raffleId || !body.num) {
        sendJson(res, 400, { error: 'Invalid parameters' });
        return;
      }

      try {
        const stmt = db.prepare(`
          UPDATE raffle_numbers 
          SET name = ?, status = ?, reserved_at = ?, paid_at = ?
          WHERE raffle_id = ? AND num = ?
        `);

        stmt.run(
          body.name || '',
          body.status || 'available',
          body.reservedAt || null,
          body.paidAt || null,
          body.raffleId,
          body.num
        );

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('Error updating number:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/raffles/winner - Definir ganhador de um prêmio e sincronizar com Vales & Prêmios
  if (req.method === 'POST' && pathname === '/api/raffles/winner') {
    readJsonBody(req, (err, body) => {
      if (err || !body.raffleId || !body.num || !body.position) {
        sendJson(res, 400, { error: 'Invalid parameters' });
        return;
      }

      try {
        db.exec('BEGIN TRANSACTION;');

        const raffle = db.prepare('SELECT title FROM raffles WHERE id = ?').get(body.raffleId);
        const raffleTitle = raffle ? raffle.title : 'Ação Eldorado Pesca';

        // 1. Update prize winner in raffle_prizes
        const updatePrize = db.prepare(`
          UPDATE raffle_prizes 
          SET winner_number = ?, winner_name = ?
          WHERE raffle_id = ? AND position = ?
        `);
        updatePrize.run(body.num, body.winnerName || '', body.raffleId, body.position);

        // 2. Extração inteligente e universal de tipo de prêmio e valor de vale (baseado em R$ e palavras-chave)
        const prizeDesc = (body.prizeDescription || `${body.position}º Prêmio`).trim();
        const descUpper = prizeDesc.toUpperCase();
        const hasOu = /\bOU\b/i.test(descUpper);
        const hasVale = /VALE|VALE-COMPRAS|VALE COMPRAS|HAVER|CRÉDITO|CREDITO/i.test(descUpper);
        const hasPesca = /DIARIA|DIÁRIA|PESCA|LAGO|RANCHO|POUSADA/i.test(descUpper);

        let initialAmount = 0;
        
        // Padrão A: "R$ [valor] ... VALE" ou "R$ [valor] EM VALE"
        const matchRsBeforeVale = descUpper.match(/R\$\s*([\d\.\,]+)\s*(?:REAIS)?\s*(?:EM|NO|DE)?\s*VALE/i);
        if (matchRsBeforeVale) {
          const cleanNum = parseFloat(matchRsBeforeVale[1].replace(/\./g, '').replace(',', '.'));
          if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
        }

        // Padrão B: "VALE ... R$ [valor]"
        if (initialAmount === 0) {
          const matchRsAfterVale = descUpper.match(/VALE(?:\s*COMPRAS)?(?:\s*DE)?\s*R\$\s*([\d\.\,]+)/i);
          if (matchRsAfterVale) {
            const cleanNum = parseFloat(matchRsAfterVale[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
          }
        }

        // Padrão C: "OU R$ [valor]"
        if (initialAmount === 0 && hasOu) {
          const matchRsAfterOu = descUpper.match(/OU\s*R\$\s*([\d\.\,]+)/i);
          if (matchRsAfterOu) {
            const cleanNum = parseFloat(matchRsAfterOu[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
          }
        }

        // Padrão D: Sem R$, mas com "1000,00 EM VALE" ou "VALE 500"
        if (initialAmount === 0 && hasVale) {
          const matchNumBeforeVale = descUpper.match(/([\d\.\,]+)\s*(?:REAIS)?\s*EM\s*VALE/i);
          if (matchNumBeforeVale) {
            const cleanNum = parseFloat(matchNumBeforeVale[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
          }
        }

        if (initialAmount === 0 && hasVale) {
          const matchNumAfterVale = descUpper.match(/VALE(?:\s*COMPRAS)?(?:\s*DE)?\s*([\d\.\,]+)/i);
          if (matchNumAfterVale) {
            const cleanNum = parseFloat(matchNumAfterVale[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
          }
        }

        // Padrão E: Qualquer "R$ [valor]" presente se for identificado como opção de Vale
        if (initialAmount === 0 && (hasVale || hasOu)) {
          const allRsMatches = [...descUpper.matchAll(/R\$\s*([\d\.\,]+)/gi)];
          if (allRsMatches.length > 0) {
            const lastMatch = allRsMatches[allRsMatches.length - 1];
            const cleanNum = parseFloat(lastMatch[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(cleanNum) && cleanNum > 0) initialAmount = cleanNum;
          }
        }

        if (initialAmount === 0 && hasPesca && hasVale) {
          initialAmount = 450.00;
        }

        let prizeType = "premio_fisico";
        let prizeStatus = "pending_pickup";
        let prizeNotes = "Ganhador sorteado na loja";

        if (hasOu && (hasVale || initialAmount > 0)) {
          prizeType = "dual_choice";
          prizeStatus = "pending_choice";
          prizeNotes = hasPesca 
            ? "Ganhador pendente de escolha (Diária de Pesca ou Vale-Compras)"
            : `Ganhador pendente de escolha (Prêmio Físico ou Vale-Compras de R$ ${initialAmount.toFixed(2).replace('.', ',')})`;
        } else if (hasVale && !hasOu) {
          prizeType = "vale_compras";
          prizeStatus = "active";
          prizeNotes = `Vale-Compras ativo de R$ ${initialAmount.toFixed(2).replace('.', ',')}`;
        } else {
          prizeType = "premio_fisico";
          prizeStatus = "pending_pickup";
          prizeNotes = "Aguardando retirada do prêmio físico na loja";
        }

        const valeId = 'vp-' + Date.now();
        const insertVale = db.prepare(`
          INSERT INTO vales_prizes (id, customer_name, customer_phone, type, raffle_ref, date_won, initial_amount, current_balance, description, status, delivered_at, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertVale.run(
          valeId,
          body.winnerName || `Cota #${body.num}`,
          body.customerPhone || '',
          prizeType,
          raffleTitle,
          getLocalDateStr(),
          initialAmount,
          initialAmount,
          `${body.position}º Lugar - ${prizeDesc} (Cota #${body.num})`,
          prizeStatus,
          null,
          prizeNotes,
          getLocalDateStr()
        );

        db.exec('COMMIT;');
        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, valeId });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('Error assigning winner:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/raffles/batch - Atualização em lote
  if (req.method === 'POST' && pathname === '/api/raffles/batch') {
    readJsonBody(req, (err, body) => {
      if (err || !body.raffleId || !Array.isArray(body.numbers)) {
        sendJson(res, 400, { error: 'Invalid parameters' });
        return;
      }

      try {
        const stmt = db.prepare(`
          UPDATE raffle_numbers 
          SET name = ?, status = ?, reserved_at = ?, paid_at = ?
          WHERE raffle_id = ? AND num = ?
        `);

        db.exec('BEGIN TRANSACTION;');
        body.numbers.forEach(item => {
          stmt.run(
            item.name || '',
            item.status || 'available',
            item.reservedAt || null,
            item.paidAt || null,
            body.raffleId,
            item.num
          );
        });
        db.exec('COMMIT;');

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, count: body.numbers.length });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('Error in batch update:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/raffles - Criar nova rifa/ação com prêmios dinâmicos (1, 2, 3, 4, etc.)
  if (req.method === 'POST' && pathname === '/api/raffles') {
    readJsonBody(req, (err, body) => {
      if (err || !body.title) {
        sendJson(res, 400, { error: 'Invalid raffle parameters' });
        return;
      }

      try {
        const raffleId = 'rifa-' + Date.now();
        const insertRaffle = db.prepare(`
          INSERT INTO raffles (id, number, title, subtitle, price_per_number, total_numbers, reservation_timeout_hours, pix_key, pix_owner, shipping_note, live_draw_note, private_contact, rules, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        db.exec('BEGIN TRANSACTION;');
        insertRaffle.run(
          raffleId,
          body.number || body.title.split(' ')[0] || 'Nova',
          body.title,
          body.subtitle || 'AÇÃO RÁPIDA',
          parseFloat(body.pricePerNumber) || 25,
          parseInt(body.totalNumbers) || 60,
          2,
          '42999162340',
          'ELDORADO PESCA LTDA',
          'Frete a parte - Envio para todo o Brasil.',
          'Sorteio ao vivo no Instagram @lojaeldoradopesca',
          '42 9 99162340',
          '',
          'active',
          new Date().toISOString()
        );

        if (Array.isArray(body.prizes)) {
          const insertPrize = db.prepare('INSERT INTO raffle_prizes (raffle_id, position, description) VALUES (?, ?, ?)');
          body.prizes.forEach((p, idx) => {
            if (p.description && p.description.trim()) {
              insertPrize.run(raffleId, p.position || (idx + 1), p.description.trim());
            }
          });
        }

        const totalNums = parseInt(body.totalNumbers) || 60;
        const insertNumber = db.prepare(`
          INSERT INTO raffle_numbers (raffle_id, num, name, status, reserved_at, paid_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (let i = 1; i <= totalNums; i++) {
          insertNumber.run(raffleId, i, '', 'available', null, null);
        }

        db.exec('COMMIT;');
        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, raffleId });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('Error creating raffle:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/raffles/update-details - Atualizar Título, Preço e Prêmios da Rifa Ativa (sem apagar números)
  if (req.method === 'POST' && pathname === '/api/raffles/update-details') {
    readJsonBody(req, (err, body) => {
      if (err || !body.raffleId || !body.title) {
        sendJson(res, 400, { error: 'ID da rifa e título são obrigatórios' });
        return;
      }

      try {
        db.exec('BEGIN TRANSACTION;');

        // Atualiza título e preço da rifa
        const updateRaffle = db.prepare(`
          UPDATE raffles 
          SET title = ?, price_per_number = ?
          WHERE id = ?
        `);
        updateRaffle.run(
          body.title.trim(),
          parseFloat(body.pricePerNumber) || 25,
          body.raffleId
        );

        // Se foram enviados prêmios, atualiza prêmios
        if (Array.isArray(body.prizes) && body.prizes.length > 0) {
          // Obtém prêmios existentes para preservar ganhadores
          const existingPrizes = db.prepare('SELECT position, winner_number, winner_name FROM raffle_prizes WHERE raffle_id = ?').all(body.raffleId);
          const winnerMap = {};
          existingPrizes.forEach(p => {
            winnerMap[p.position] = { winnerNumber: p.winner_number, winnerName: p.winner_name };
          });

          // Deleta prêmios anteriores da rifa
          db.prepare('DELETE FROM raffle_prizes WHERE raffle_id = ?').run(body.raffleId);

          const insertPrize = db.prepare(`
            INSERT INTO raffle_prizes (raffle_id, position, description, winner_number, winner_name)
            VALUES (?, ?, ?, ?, ?)
          `);

          body.prizes.forEach((p, idx) => {
            const pos = p.position || (idx + 1);
            const desc = (p.description || '').trim();
            if (desc) {
              const existingWinner = winnerMap[pos] || {};
              insertPrize.run(
                body.raffleId,
                pos,
                desc,
                p.winnerNumber !== undefined ? p.winnerNumber : (existingWinner.winnerNumber || null),
                p.winnerName !== undefined ? p.winnerName : (existingWinner.winnerName || null)
              );
            }
          });
        }

        db.exec('COMMIT;');
        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('Error updating raffle details:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // DELETE /api/raffles/:id - Excluir Rifa/Ação (mantém registros de ganhadores em vales_prizes intactos)
  if (req.method === 'DELETE' && pathname.startsWith('/api/raffles/')) {
    const raffleId = decodeURIComponent(pathname.replace('/api/raffles/', '')).trim();
    if (!raffleId) {
      sendJson(res, 400, { error: 'ID da rifa inválido' });
      return;
    }

    try {
      db.exec('BEGIN TRANSACTION;');
      // Deleta números e prêmios vinculados à rifa
      db.prepare('DELETE FROM raffle_numbers WHERE raffle_id = ?').run(raffleId);
      db.prepare('DELETE FROM raffle_prizes WHERE raffle_id = ?').run(raffleId);
      // Deleta a rifa (vales_prizes NÃO é deletado)
      db.prepare('DELETE FROM raffles WHERE id = ?').run(raffleId);
      db.exec('COMMIT;');

      createAutoBackupSnapshot();
      sendJson(res, 200, { success: true, message: 'Rifa excluída com sucesso' });
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error('Error deleting raffle:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/vales - Criar Vale-Compras ou Prêmio Físico
  if (req.method === 'POST' && pathname === '/api/vales') {
    readJsonBody(req, (err, body) => {
      if (err || !body.customerName) {
        sendJson(res, 400, { error: 'Invalid parameters' });
        return;
      }

      try {
        const valeId = 'vp-' + Date.now();
        const amount = parseFloat(body.initialAmount) || 0;

        const insert = db.prepare(`
          INSERT INTO vales_prizes (id, customer_name, customer_phone, type, raffle_ref, date_won, initial_amount, current_balance, description, status, delivered_at, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insert.run(
          valeId,
          body.customerName,
          body.customerPhone || '',
          body.type || 'vale_compras',
          body.raffleRef || 'Eldorado Pesca',
          body.dateWon || getLocalDateStr(),
          amount,
          amount,
          body.description || (body.type === 'vale_compras' ? `Vale Compras R$ ${amount}` : 'Prêmio'),
          body.type === 'vale_compras' ? 'active' : 'pending_pickup',
          null,
          body.notes || '',
          getLocalDateStr()
        );

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, valeId });
      } catch (err) {
        console.error('Error creating vale/prize:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/vales/abater - Abater produto retirado na loja do Vale-Compras
  if (req.method === 'POST' && pathname === '/api/vales/abater') {
    readJsonBody(req, (err, body) => {
      if (err || !body.valeId || !body.amount || !body.item) {
        sendJson(res, 400, { error: 'Invalid abatement parameters' });
        return;
      }

      try {
        db.exec('BEGIN TRANSACTION;');

        const currentVale = db.prepare('SELECT current_balance FROM vales_prizes WHERE id = ?').get(body.valeId);
        if (!currentVale) {
          throw new Error('Vale not found');
        }

        const abaterVal = parseFloat(body.amount) || 0;
        const newBalance = Math.max(0, currentVale.current_balance - abaterVal);
        const newStatus = newBalance === 0 ? 'completed' : 'active';

        const updateVale = db.prepare('UPDATE vales_prizes SET current_balance = ?, status = ? WHERE id = ?');
        updateVale.run(newBalance, newStatus, body.valeId);

        const insertTx = db.prepare(`
          INSERT INTO vale_transactions (id, vale_id, date, item, amount, remaining_balance, registered_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertTx.run(
          'tx-' + Date.now(),
          body.valeId,
          body.date || getLocalDateStr(),
          body.item,
          abaterVal,
          newBalance,
          body.registeredBy || 'Loja',
          getLocalDateStr()
        );

        db.exec('COMMIT;');
        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, newBalance });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('Error abating product:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/vales/exchange - Registrar TROCA de Prêmio por outro produto
  if (req.method === 'POST' && pathname === '/api/vales/exchange') {
    readJsonBody(req, (err, body) => {
      if (err || !body.valeId || !body.exchangedItem) {
        sendJson(res, 400, { error: 'Invalid exchange parameters' });
        return;
      }

      try {
        const stmt = db.prepare(`
          UPDATE vales_prizes 
          SET status = 'delivered', 
              delivered_at = ?,
              exchanged_item = ?, 
              difference_paid = ?, 
              exchange_notes = ?, 
              exchanged_at = ?
          WHERE id = ?
        `);

        const nowStr = getLocalDateStr();
        stmt.run(
          body.exchangedAt || nowStr,
          body.exchangedItem,
          parseFloat(body.differencePaid) || 0,
          body.exchangeNotes || '',
          body.exchangedAt || nowStr,
          body.valeId
        );

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('Error exchanging prize:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/vales/undo-exchange - Desfazer troca de prêmio e restaurar para aguardando retirada
  if (req.method === 'POST' && pathname === '/api/vales/undo-exchange') {
    readJsonBody(req, (err, body) => {
      if (err || !body.valeId) {
        sendJson(res, 400, { error: 'ID do vale/prêmio é obrigatório' });
        return;
      }

      try {
        const stmt = db.prepare(`
          UPDATE vales_prizes 
          SET status = 'pending_pickup', 
              delivered_at = null,
              exchanged_item = null, 
              difference_paid = 0, 
              exchange_notes = null, 
              exchanged_at = null
          WHERE id = ?
        `);
        stmt.run(body.valeId);
        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('Error undoing exchange:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/vales/deliver - Marcar prêmio físico como entregue
  if (req.method === 'POST' && pathname === '/api/vales/deliver') {
    readJsonBody(req, (err, body) => {
      if (err || !body.valeId) {
        sendJson(res, 400, { error: 'Invalid parameters' });
        return;
      }

      try {
        const stmt = db.prepare('UPDATE vales_prizes SET status = ?, delivered_at = ? WHERE id = ?');
        stmt.run('delivered', getLocalDateStr(), body.valeId);
        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('Error delivering prize:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/vales/choose-option - Definir se o ganhador escolheu Diária de Pesca, Vale-Compras ou A Decidir
  if (req.method === 'POST' && pathname === '/api/vales/choose-option') {
    readJsonBody(req, (err, body) => {
      if (err || !body.valeId || !body.choice) {
        sendJson(res, 400, { error: 'Invalid choice parameters' });
        return;
      }

      try {
        if (body.choice === 'vale') {
          const amount = parseFloat(body.amount) || 450.00;
          const stmt = db.prepare(`
            UPDATE vales_prizes 
            SET type = 'vale_compras',
                status = 'active',
                initial_amount = ?,
                current_balance = ?,
                notes = ?
            WHERE id = ?
          `);
          stmt.run(amount, amount, `Ganhador optou pelo Vale-Compras (R$ ${amount.toFixed(2).replace('.', ',')})`, body.valeId);
          // Remove qualquer agendamento vinculado da Agenda de Pesca
          db.prepare("DELETE FROM fishing_bookings WHERE prize_id = ?").run(body.valeId);
        } else if (body.choice === 'diaria') {
          const stmt = db.prepare(`
            UPDATE vales_prizes 
            SET type = 'dual_choice',
                status = 'pending_schedule',
                notes = ?
            WHERE id = ?
          `);
          stmt.run('Ganhador optou pela Diária de Pesca (Aguardando Agendamento da Data)', body.valeId);
          // Remove agendamento anterior para escolha limpa de nova data
          db.prepare("DELETE FROM fishing_bookings WHERE prize_id = ?").run(body.valeId);
        } else if (body.choice === 'premio_fisico') {
          const stmt = db.prepare(`
            UPDATE vales_prizes 
            SET type = 'premio_fisico',
                status = 'pending_pickup',
                notes = ?
            WHERE id = ?
          `);
          stmt.run('Ganhador optou pelo Prêmio Físico (Aguardando Retirada)', body.valeId);
          db.prepare("DELETE FROM fishing_bookings WHERE prize_id = ?").run(body.valeId);
        } else if (body.choice === 'premio_entregue' || body.choice === 'delivered') {
          const stmt = db.prepare(`
            UPDATE vales_prizes 
            SET type = 'premio_fisico',
                status = 'delivered',
                delivered_at = ?,
                notes = ?
            WHERE id = ?
          `);
          stmt.run(getLocalDateStr(), 'Ganhador retirou o Prêmio Físico na loja (Entregue)', body.valeId);
          db.prepare("DELETE FROM fishing_bookings WHERE prize_id = ?").run(body.valeId);
        } else if (body.choice === 'pending_choice') {
          const stmt = db.prepare(`
            UPDATE vales_prizes 
            SET type = 'dual_choice',
                status = 'pending_choice',
                notes = ?
            WHERE id = ?
          `);
          stmt.run('Ganhador pendente de escolha', body.valeId);
          // Remove agendamento anterior
          db.prepare("DELETE FROM fishing_bookings WHERE prize_id = ?").run(body.valeId);
        }

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('Error choosing option:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/vales/update - Atualizar todos os dados do vale/prêmio após edição
  if (req.method === 'POST' && pathname === '/api/vales/update') {
    readJsonBody(req, (err, body) => {
      if (err || !body.id) {
        sendJson(res, 400, { error: 'ID do vale/prêmio é obrigatório' });
        return;
      }

      try {
        const stmt = db.prepare(`
          UPDATE vales_prizes 
          SET customer_name = ?,
              customer_phone = ?,
              description = ?,
              notes = ?,
              type = ?,
              status = ?,
              initial_amount = ?,
              current_balance = ?,
              delivered_at = ?,
              exchanged_item = ?,
              difference_paid = ?,
              exchange_notes = ?,
              exchanged_at = ?
          WHERE id = ?
        `);

        stmt.run(
          body.customerName || '',
          body.customerPhone || '',
          body.description || '',
          body.notes || '',
          body.type || 'dual_choice',
          body.status || 'pending_choice',
          parseFloat(body.initialAmount) || 0,
          parseFloat(body.currentBalance) || 0,
          body.deliveredAt || null,
          body.exchangedItem !== undefined ? body.exchangedItem : null,
          parseFloat(body.differencePaid) || 0,
          body.exchangeNotes !== undefined ? body.exchangeNotes : null,
          body.exchangedAt !== undefined ? body.exchangedAt : null,
          body.id
        );

        if (body.status !== 'scheduled') {
          db.prepare("DELETE FROM fishing_bookings WHERE prize_id = ?").run(body.id);
        }

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('Error updating vale:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // DELETE /api/vales/:id - Excluir vale ou prêmio
  if (req.method === 'DELETE' && pathname.startsWith('/api/vales/')) {
    const valeId = pathname.replace('/api/vales/', '');
    try {
      db.prepare('DELETE FROM vales_prizes WHERE id = ?').run(valeId);
      db.prepare('DELETE FROM fishing_bookings WHERE prize_id = ?').run(valeId);
      createAutoBackupSnapshot();
      sendJson(res, 200, { success: true });
    } catch (err) {
      console.error('Error deleting vale:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/eduardo/day - Lançar / Atualizar dia trabalhado do Eduardo
  if (req.method === 'POST' && pathname === '/api/eduardo/day') {
    readJsonBody(req, (err, body) => {
      if (err || !body.date || !body.type) {
        sendJson(res, 400, { error: 'Invalid parameters' });
        return;
      }

      try {
        if (body.type === 'off') {
          db.prepare('DELETE FROM eduardo_work_days WHERE date = ?').run(body.date);
        } else {
          const stmt = db.prepare(`
            INSERT OR REPLACE INTO eduardo_work_days (date, type, hours_weight, amount_due, notes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            body.date,
            body.type,
            parseFloat(body.hoursWeight) || (body.type === 'full' ? 1.0 : 0.5),
            parseFloat(body.amountDue) || (body.type === 'full' ? 62 : 31),
            body.notes || '',
            new Date().toISOString()
          );
        }

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        console.error('Error saving eduardo day:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // DELETE /api/eduardo/day/:date - Excluir dia de trabalho
  if (req.method === 'DELETE' && pathname.startsWith('/api/eduardo/day/')) {
    const date = pathname.replace('/api/eduardo/day/', '');
    try {
      db.prepare('DELETE FROM eduardo_work_days WHERE date = ?').run(date);
      createAutoBackupSnapshot();
      sendJson(res, 200, { success: true });
    } catch (err) {
      console.error('Error deleting day:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/fishing/booking - Criar ou Atualizar Reserva no Calendário de Pesca
  if (req.method === 'POST' && pathname === '/api/fishing/booking') {
    readJsonBody(req, (err, body) => {
      if (err || !body.clientName || !body.startDate) {
        sendJson(res, 400, { error: 'Nome do cliente e data de início são obrigatórios' });
        return;
      }

      try {
        let bookingId = body.id;
        if (!bookingId && body.prizeId) {
          const existingPrize = db.prepare("SELECT id FROM fishing_bookings WHERE prize_id = ?").get(body.prizeId);
          if (existingPrize) bookingId = existingPrize.id;
        }
        if (!bookingId) {
          bookingId = 'fb-' + Date.now();
        }

        const extraDays = parseInt(body.extraDays) || 0;
        const raffleDays = parseInt(body.raffleDays) || 1;
        const isRaffle = body.bookingType === 'raffle_prize';

        let totalAmount = parseFloat(body.totalAmount) || 0;
        let depositAmount = parseFloat(body.depositAmount) || 0;

        if (isRaffle && extraDays === 0) {
          totalAmount = 0;
          depositAmount = 0;
        }

        const remainingAmount = Math.max(0, totalAmount - depositAmount);
        
        let paymentStatus = body.paymentStatus || 'pending';
        if (isRaffle && extraDays === 0) {
          paymentStatus = 'raffle_covered';
        } else if (remainingAmount === 0 && totalAmount > 0) {
          paymentStatus = 'paid';
        } else if (depositAmount > 0) {
          paymentStatus = 'deposit_paid';
        }

        const datesJson = Array.isArray(body.dates) ? JSON.stringify(body.dates) : (body.dates ? String(body.dates) : JSON.stringify([body.startDate]));

        const stmt = db.prepare(`
          INSERT OR REPLACE INTO fishing_bookings (
            id, client_name, client_phone, booking_type, raffle_ref, prize_id,
            start_date, end_date, dates, total_days, raffle_days, extra_days,
            package_name, structure_type, fishermen_count, boats_count,
            kayaks_count, custom_structure, total_amount, deposit_amount,
            remaining_amount, payment_status, payment_method, notes,
            guide_name, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          bookingId,
          body.clientName.trim(),
          body.clientPhone || '',
          body.bookingType || 'direct',
          body.raffleRef || '',
          body.prizeId || null,
          body.startDate,
          body.endDate || body.startDate,
          datesJson,
          parseInt(body.totalDays) || (isRaffle ? (raffleDays + extraDays) : 1),
          raffleDays,
          extraDays,
          body.packageName || 'Dupla (2 Pessoas)',
          body.structureType || 'dupla',
          parseInt(body.fishermenCount) || (body.structureType === 'trio' ? 3 : 2),
          parseInt(body.boatsCount) || 1,
          parseInt(body.kayaksCount) || 0,
          body.customStructure || '',
          totalAmount,
          depositAmount,
          remainingAmount,
          paymentStatus,
          body.paymentMethod || 'Pix',
          body.notes || '',
          body.guideName || 'Thiago Witeck',
          body.status || 'scheduled',
          body.createdAt || new Date().toISOString()
        );

        if (body.prizeId) {
          db.prepare("UPDATE vales_prizes SET status = 'scheduled', notes = ? WHERE id = ?")
            .run(`Diária de Pesca confirmada para ${body.dates ? (Array.isArray(body.dates) ? body.dates.join(', ') : body.dates) : body.startDate}`, body.prizeId);
        }

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, bookingId });
      } catch (err) {
        console.error('Error saving fishing booking:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/fishing/payment - Quitar saldo restante ou registrar sinal
  if (req.method === 'POST' && pathname === '/api/fishing/payment') {
    readJsonBody(req, (err, body) => {
      if (err || !body.id) {
        sendJson(res, 400, { error: 'ID da reserva é obrigatório' });
        return;
      }

      try {
        const currentBooking = db.prepare('SELECT * FROM fishing_bookings WHERE id = ?').get(body.id);
        if (!currentBooking) {
          sendJson(res, 404, { error: 'Reserva não encontrada' });
          return;
        }

        const totalAmount = currentBooking.total_amount;
        let newDeposit = parseFloat(body.paidAmount !== undefined ? body.paidAmount : totalAmount);
        if (body.addAmount) {
          newDeposit = (currentBooking.deposit_amount || 0) + parseFloat(body.addAmount);
        }
        const newRemaining = Math.max(0, totalAmount - newDeposit);
        const newStatus = newRemaining === 0 ? 'paid' : (newDeposit > 0 ? 'deposit_paid' : 'pending');

        const stmt = db.prepare(`
          UPDATE fishing_bookings 
          SET deposit_amount = ?, remaining_amount = ?, payment_status = ?, payment_method = ?, notes = ?
          WHERE id = ?
        `);

        const updatedNotes = body.notes || currentBooking.notes || '';
        stmt.run(
          newDeposit,
          newRemaining,
          newStatus,
          body.paymentMethod || currentBooking.payment_method || 'Pix',
          updatedNotes,
          body.id
        );

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, newStatus, newRemaining });
      } catch (err) {
        console.error('Error updating fishing payment:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // DELETE /api/fishing/booking/:id - Excluir / Cancelar Reserva de Pesca
  if (req.method === 'DELETE' && pathname.startsWith('/api/fishing/booking/')) {
    const bookingId = pathname.replace('/api/fishing/booking/', '');
    try {
      const existing = db.prepare('SELECT prize_id FROM fishing_bookings WHERE id = ?').get(bookingId);
      if (existing && existing.prize_id) {
        const prize = db.prepare('SELECT type FROM vales_prizes WHERE id = ?').get(existing.prize_id);
        const newStatus = (prize && prize.type === 'dual_choice') ? 'pending_choice' : 'pending_pickup';
        db.prepare("UPDATE vales_prizes SET status = ?, notes = 'Agendamento cancelado - Aguardando definição de nova data' WHERE id = ?")
          .run(newStatus, existing.prize_id);
      }
      db.prepare('DELETE FROM fishing_bookings WHERE id = ?').run(bookingId);
      createAutoBackupSnapshot();
      sendJson(res, 200, { success: true });
    } catch (err) {
      console.error('Error deleting fishing booking:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/rancho/booking - Criar ou Atualizar Reserva / Locação do Rancho
  if (req.method === 'POST' && pathname === '/api/rancho/booking') {
    readJsonBody(req, (err, body) => {
      if (err || !body.clientName || !body.checkInDate || !body.checkOutDate) {
        sendJson(res, 400, { error: 'Invalid parameters for rancho booking' });
        return;
      }

      try {
        const bookingId = body.id || ('rb-' + Date.now());
        const totalDays = parseInt(body.totalDays) || 1;
        const totalAmount = parseFloat(body.totalAmount) || 0;
        const depositAmount = parseFloat(body.depositAmount) || 0;
        const remainingAmount = Math.max(0, totalAmount - depositAmount);

        let paymentStatus = 'pending';
        if (remainingAmount === 0 && totalAmount > 0) {
          paymentStatus = 'paid';
        } else if (depositAmount > 0) {
          paymentStatus = 'deposit_paid';
        }

        const stmt = db.prepare(`
          INSERT INTO rancho_bookings (
            id, client_name, client_phone, check_in_date, check_out_date,
            total_days, guests_count, total_amount, deposit_amount,
            remaining_amount, payment_status, payment_method, notes,
            status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            client_name = excluded.client_name,
            client_phone = excluded.client_phone,
            check_in_date = excluded.check_in_date,
            check_out_date = excluded.check_out_date,
            total_days = excluded.total_days,
            guests_count = excluded.guests_count,
            total_amount = excluded.total_amount,
            deposit_amount = excluded.deposit_amount,
            remaining_amount = excluded.remaining_amount,
            payment_status = excluded.payment_status,
            payment_method = excluded.payment_method,
            notes = excluded.notes,
            status = excluded.status
        `);

        stmt.run(
          bookingId,
          body.clientName.trim().toUpperCase(),
          body.clientPhone || '',
          body.checkInDate,
          body.checkOutDate,
          totalDays,
          parseInt(body.guestsCount) || 2,
          totalAmount,
          depositAmount,
          remainingAmount,
          paymentStatus,
          body.paymentMethod || 'Pix',
          body.notes || '',
          body.status || 'scheduled',
          body.createdAt || new Date().toISOString()
        );

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, bookingId });
      } catch (err) {
        console.error('Error saving rancho booking:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // POST /api/rancho/payment - Quitar ou Dar Baixa no Saldo do Rancho
  if (req.method === 'POST' && pathname === '/api/rancho/payment') {
    readJsonBody(req, (err, body) => {
      if (err || !body.id) {
        sendJson(res, 400, { error: 'Invalid parameters for rancho payment' });
        return;
      }

      try {
        const currentBooking = db.prepare('SELECT * FROM rancho_bookings WHERE id = ?').get(body.id);
        if (!currentBooking) {
          sendJson(res, 404, { error: 'Rancho booking not found' });
          return;
        }

        const totalAmount = currentBooking.total_amount || 0;
        let newDeposit = parseFloat(body.paidAmount !== undefined ? body.paidAmount : totalAmount);
        if (body.addAmount) {
          newDeposit = (currentBooking.deposit_amount || 0) + parseFloat(body.addAmount);
        }
        const newRemaining = Math.max(0, totalAmount - newDeposit);
        const newStatus = newRemaining === 0 ? 'paid' : (newDeposit > 0 ? 'deposit_paid' : 'pending');

        const stmt = db.prepare(`
          UPDATE rancho_bookings 
          SET deposit_amount = ?, remaining_amount = ?, payment_status = ?, payment_method = ?, notes = ?
          WHERE id = ?
        `);

        const updatedNotes = body.notes || currentBooking.notes || '';
        stmt.run(
          newDeposit,
          newRemaining,
          newStatus,
          body.paymentMethod || currentBooking.payment_method || 'Pix',
          updatedNotes,
          body.id
        );

        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true, newStatus, newRemaining });
      } catch (err) {
        console.error('Error updating rancho payment:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // DELETE /api/rancho/booking/:id - Excluir Locação do Rancho
  if (req.method === 'DELETE' && pathname.startsWith('/api/rancho/booking/')) {
    const bookingId = pathname.replace('/api/rancho/booking/', '');
    try {
      db.prepare('DELETE FROM rancho_bookings WHERE id = ?').run(bookingId);
      createAutoBackupSnapshot();
      sendJson(res, 200, { success: true });
    } catch (err) {
      console.error('Error deleting rancho booking:', err);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/settings - Atualizar configurações da loja e taxas do Eduardo no banco
  if (req.method === 'POST' && pathname === '/api/settings') {
    readJsonBody(req, (err, body) => {
      if (err || !body) {
        sendJson(res, 400, { error: 'Invalid parameters' });
        return;
      }

      try {
        const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        db.exec('BEGIN TRANSACTION;');
        for (const [k, v] of Object.entries(body)) {
          stmt.run(k, String(v));
        }
        db.exec('COMMIT;');
        createAutoBackupSnapshot();
        sendJson(res, 200, { success: true });
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('Error saving settings:', err);
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': contentType };
    if (['.html', '.js', '.css'].includes(ext)) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 10 * 1024 * 1024) {
      req.destroy();
    }
  });
  req.on('end', () => {
    try {
      const parsed = body ? JSON.parse(body) : {};
      callback(null, parsed);
    } catch (e) {
      callback(e, null);
    }
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Porta ${PORT} já está em uso por processo anterior - conectando à instância ativa.`);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`ELDORADO PESCA E LAKE - SERVIDOR SQLITE ATIVO`);
  console.log(`================================================================`);
  console.log(`Porta Local: http://localhost:${PORT}`);
  console.log(`Banco de Dados: ${path.join(__dirname, 'eldorado_pesca.db')}`);
});

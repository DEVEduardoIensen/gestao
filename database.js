/**
 * Eldorado Pesca Manager - Banco de Dados SQLite Nativo
 * Arquivo do Banco: eldorado_pesca.db
 */

const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'eldorado_pesca.db');

let db;
try {
  db = new DatabaseSync(DB_PATH);
} catch (err) {
  const shmPath = DB_PATH + '-shm';
  if (fs.existsSync(shmPath)) {
    try { fs.unlinkSync(shmPath); } catch (e) {}
  }
  db = new DatabaseSync(DB_PATH);
}

// Enable foreign keys, busy timeout, and safe journal handling for maximum reliability with OneDrive
try {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA wal_autocheckpoint = 20;');
} catch (e) {
  console.log('Note on SQLite configuration:', e.message);
}

function checkpointDatabase() {
  try {
    db.exec('PRAGMA wal_checkpoint(PASSIVE);');
  } catch (e) {}
}

/**
 * Criação e Migração das Tabelas do Banco de Dados
 */
function initDatabase() {
  checkpointDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS raffles (
      id TEXT PRIMARY KEY,
      number TEXT,
      title TEXT,
      subtitle TEXT,
      price_per_number REAL,
      total_numbers INTEGER,
      reservation_timeout_hours INTEGER,
      pix_key TEXT,
      pix_owner TEXT,
      shipping_note TEXT,
      live_draw_note TEXT,
      private_contact TEXT,
      rules TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS raffle_numbers (
      raffle_id TEXT,
      num INTEGER,
      name TEXT,
      status TEXT DEFAULT 'available',
      reserved_at TEXT,
      paid_at TEXT,
      PRIMARY KEY (raffle_id, num),
      FOREIGN KEY (raffle_id) REFERENCES raffles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS raffle_prizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raffle_id TEXT,
      position INTEGER,
      description TEXT,
      winner_number INTEGER,
      winner_name TEXT,
      FOREIGN KEY (raffle_id) REFERENCES raffles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vales_prizes (
      id TEXT PRIMARY KEY,
      customer_name TEXT,
      customer_phone TEXT,
      type TEXT,
      raffle_ref TEXT,
      date_won TEXT,
      initial_amount REAL,
      current_balance REAL,
      description TEXT,
      status TEXT,
      delivered_at TEXT,
      notes TEXT,
      exchanged_item TEXT,
      difference_paid REAL DEFAULT 0,
      exchange_notes TEXT,
      exchanged_at TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS vale_transactions (
      id TEXT PRIMARY KEY,
      vale_id TEXT,
      date TEXT,
      item TEXT,
      amount REAL,
      remaining_balance REAL,
      registered_by TEXT,
      created_at TEXT,
      FOREIGN KEY (vale_id) REFERENCES vales_prizes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS eduardo_work_days (
      date TEXT PRIMARY KEY,
      type TEXT,
      hours_weight REAL,
      amount_due REAL,
      notes TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS fishing_bookings (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      booking_type TEXT DEFAULT 'direct',
      raffle_ref TEXT,
      prize_id TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      total_days INTEGER DEFAULT 1,
      raffle_days INTEGER DEFAULT 1,
      extra_days INTEGER DEFAULT 0,
      package_name TEXT,
      structure_type TEXT DEFAULT 'dupla',
      fishermen_count INTEGER DEFAULT 2,
      boats_count INTEGER DEFAULT 1,
      kayaks_count INTEGER DEFAULT 0,
      custom_structure TEXT,
      total_amount REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      remaining_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'Pix',
      notes TEXT,
      guide_name TEXT DEFAULT 'Thiago Witeck',
      status TEXT DEFAULT 'scheduled',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rancho_bookings (
      id TEXT PRIMARY KEY,
      client_name TEXT NOT NULL,
      client_phone TEXT,
      check_in_date TEXT NOT NULL,
      check_out_date TEXT NOT NULL,
      total_days INTEGER DEFAULT 1,
      guests_count INTEGER DEFAULT 2,
      total_amount REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      remaining_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'Pix',
      notes TEXT,
      status TEXT DEFAULT 'scheduled',
      created_at TEXT
    );
  `);

  // Ensure column migrations exist on fishing_bookings
  try { db.exec(`ALTER TABLE fishing_bookings ADD COLUMN raffle_days INTEGER DEFAULT 1;`); } catch (e) {}
  try { db.exec(`ALTER TABLE fishing_bookings ADD COLUMN extra_days INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE fishing_bookings ADD COLUMN structure_type TEXT DEFAULT 'dupla';`); } catch (e) {}
  try { db.exec(`ALTER TABLE fishing_bookings ADD COLUMN boats_count INTEGER DEFAULT 1;`); } catch (e) {}
  try { db.exec(`ALTER TABLE fishing_bookings ADD COLUMN kayaks_count INTEGER DEFAULT 0;`); } catch (e) {}
  try { db.exec(`ALTER TABLE fishing_bookings ADD COLUMN custom_structure TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE fishing_bookings ADD COLUMN dates TEXT;`); } catch (e) {}

  // Ensure column migrations exist on vales_prizes
  try {
    db.exec(`ALTER TABLE vales_prizes ADD COLUMN exchanged_item TEXT;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE vales_prizes ADD COLUMN difference_paid REAL DEFAULT 0;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE vales_prizes ADD COLUMN exchange_notes TEXT;`);
  } catch (e) {}
  try {
    db.exec(`ALTER TABLE vales_prizes ADD COLUMN exchanged_at TEXT;`);
  } catch (e) {}

  // Update Eduardo default rates to R$ 62,00 / R$ 31,00 if not set
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const checkDailyRate = db.prepare("SELECT value FROM settings WHERE key = 'eduardoDailyRate'").get();
  if (!checkDailyRate || checkDailyRate.value === '100.00' || checkDailyRate.value === '100') {
    insertSetting.run('eduardoDailyRate', '62.00');
    insertSetting.run('eduardoHalfRate', '31.00');
  }

  // Populate initial seed data only once on initial setup so deleted raffles stay deleted
  const checkDbSeeded = db.prepare("SELECT value FROM settings WHERE key = 'db_seed_completed'").get();
  if (!checkDbSeeded) {
    const checkRifa105 = db.prepare("SELECT COUNT(*) as count FROM raffles WHERE id = 'rifa-105'").get();
    if (checkRifa105.count === 0) {
      seedRifa105();
    }

    const checkRifa106 = db.prepare("SELECT COUNT(*) as count FROM raffles WHERE id = 'rifa-106'").get();
    if (checkRifa106.count === 0) {
      seedRifa106();
    }

    const checkRifa107 = db.prepare("SELECT COUNT(*) as count FROM raffles WHERE id = 'rifa-107'").get();
    if (checkRifa107.count === 0) {
      seedRifa107();
    }

    const checkRaiVale = db.prepare("SELECT COUNT(*) as count FROM vales_prizes WHERE id = 'vp-rai-105'").get();
    if (checkRaiVale.count === 0) {
      const insertVale = db.prepare(`
        INSERT OR REPLACE INTO vales_prizes (
          id, customer_name, customer_phone, type, raffle_ref, date_won,
          initial_amount, current_balance, description, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertVale.run(
        'vp-rai-105',
        'RAI',
        '42 9 9933-4455',
        'dual_choice',
        '105° AÇÃO ELDORADO PESCA',
        '2026-08-01',
        450.00,
        450.00,
        '1º Lugar - DIÁRIA PRA DUAS PESSOAS + COMBUSTÍVEL OU VALE COMPRAS DE 450,00 NA LOJA (Cota #40)',
        'pending_choice',
        '2026-08-01T12:00:00.000Z'
      );
    }
    insertSetting.run('db_seed_completed', '1');
  }

  // Remove fake NPC bookings if present
  try {
    db.prepare("DELETE FROM fishing_bookings WHERE client_name IN ('MARCELO SOUZA', 'CARLOS EDUARDO') OR id IN ('fb-sample-1', 'fb-sample-3')").run();
  } catch (e) {}
}

/**
 * Carga da 105ª Ação Eldorado Pesca (40 cotas, R$ 20,00 - Diária pra duas pessoas)
 */
function seedRifa105() {
  const insertRaffle = db.prepare(`
    INSERT OR REPLACE INTO raffles (id, number, title, subtitle, price_per_number, total_numbers, reservation_timeout_hours, pix_key, pix_owner, shipping_note, live_draw_note, private_contact, rules, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRaffle.run(
    'rifa-105',
    '105°',
    '105° AÇÃO ELDORADO PESCA',
    'AÇÃO RÁPIDA',
    20.00,
    40,
    2,
    '42999162340',
    'ELDORADO PESCA LTDA',
    'Frete a parte - Envio para todo o Brasil.',
    'Sorteio ao vivo no Instagram @lojaeldoradopesca',
    '42 9 99162340',
    'LEIAM COM ATENÇÃO, MUITA ATENÇÃO!\nOS NUMEROS SÓ FICARÃO DISPONIVEIS ATÉ 2 HORAS APÓS O FECHAMENTO DA AÇÃO, SE NÃO OUVER PAGAMENTO VAMOS DISPONIBILIZAR NOVAMENTE PARA OS DEMAIS.\nNAO COPIAR E COLAR, APENAS FALAR O NÚMERO.\nSorteio será quando o último número for pago, avisarei aqui no grupo.',
    'completed',
    '2026-08-01T10:00:00.000Z'
  );

  const insertPrize = db.prepare('INSERT INTO raffle_prizes (raffle_id, position, description, winner_number, winner_name) VALUES (?, ?, ?, ?, ?)');
  insertPrize.run('rifa-105', 1, 'DIÁRIA PRA DUAS PESSOAS + COMBUSTÍVEL OU VALE COMPRAS DE 450,00 NA LOJA', 40, 'RAI');

  const numbers105 = [
    { num: 1, name: "THIAGO STEFFEN", status: "paid" },
    { num: 2, name: "THIAGO STEFFEN", status: "paid" },
    { num: 3, name: "FELIPE ROCHA", status: "paid" },
    { num: 4, name: "ALESSANDRO ARMAZÉM", status: "paid" },
    { num: 5, name: "FELLYPE", status: "paid" },
    { num: 6, name: "WELLINGTON ALBERTY", status: "paid" },
    { num: 7, name: "SADOL", status: "paid" },
    { num: 8, name: "FÁBIO MATSUDA", status: "paid" },
    { num: 9, name: "JÚNIOR B", status: "paid" },
    { num: 10, name: "FELLYPE", status: "paid" },
    { num: 11, name: "SADOL", status: "paid" },
    { num: 12, name: "JÚNIOR JJ", status: "paid" },
    { num: 13, name: "LENON", status: "paid" },
    { num: 14, name: "ALEXSANDRO", status: "paid" },
    { num: 15, name: "MILTON", status: "paid" },
    { num: 16, name: "RAFAEL BET", status: "paid" },
    { num: 17, name: "ROBINHO", status: "paid" },
    { num: 18, name: "MATHEUS MACHADO", status: "paid" },
    { num: 19, name: "LUIS GUSTAVO", status: "paid" },
    { num: 20, name: "KEVIN", status: "paid" },
    { num: 21, name: "FELLYPE", status: "paid" },
    { num: 22, name: "FÁBIO MATSUDA", status: "paid" },
    { num: 23, name: "JOÃO PAULO", status: "paid" },
    { num: 24, name: "PORTAS E COMPENSADOS", status: "reserved" },
    { num: 25, name: "PORTAS E COMPENSADOS", status: "reserved" },
    { num: 26, name: "KEVIN", status: "paid" },
    { num: 27, name: "ANTÔNIO", status: "paid" },
    { num: 28, name: "ANTÔNIO", status: "paid" },
    { num: 29, name: "RICARDO", status: "paid" },
    { num: 30, name: "RAI", status: "paid" },
    { num: 31, name: "MARCELO BARBOSA", status: "paid" },
    { num: 32, name: "CARLIM", status: "reserved" },
    { num: 33, name: "FELLYPE", status: "paid" },
    { num: 34, name: "RICARDO", status: "paid" },
    { num: 35, name: "GERALDO SLUSARSKI", status: "paid" },
    { num: 36, name: "FELLYPE", status: "paid" },
    { num: 37, name: "ALESSANDRO ARMAZÉM", status: "paid" },
    { num: 38, name: "ROBINHO", status: "paid" },
    { num: 39, name: "EDILSON", status: "reserved" },
    { num: 40, name: "RAI", status: "paid" }
  ];

  const insertNumber = db.prepare(`
    INSERT OR REPLACE INTO raffle_numbers (raffle_id, num, name, status, reserved_at, paid_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  numbers105.forEach(item => {
    insertNumber.run('rifa-105', item.num, item.name, item.status, item.status === 'reserved' ? '2026-08-01T11:00:00.000Z' : null, item.status === 'paid' ? '2026-08-01T12:00:00.000Z' : null);
  });
}

/**
 * Carga da 106ª Ação Eldorado Pesca (45 cotas, R$ 15,00)
 */
function seedRifa106() {
  const insertRaffle = db.prepare(`
    INSERT OR REPLACE INTO raffles (id, number, title, subtitle, price_per_number, total_numbers, reservation_timeout_hours, pix_key, pix_owner, shipping_note, live_draw_note, private_contact, rules, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRaffle.run(
    'rifa-106',
    '106°',
    '106° AÇÃO ELDORADO PESCA',
    'AÇÃO RÁPIDA',
    15.00,
    45,
    2,
    '42999162340',
    'ELDORADO PESCA LTDA',
    'Frete a parte - Envio para todo o Brasil.',
    'Sorteio ao vivo no Instagram @lojaeldoradopesca',
    '42 9 99162340',
    'OS NUMEROS SÓ FICARÃO DISPONIVEIS ATÉ 2 HORAS APÓS O FECHAMENTO DA AÇÃO.\nNÃO COPIAR E COLAR, APENAS FALAR O NÚMERO.\nSorteio será quando o último número for pago.',
    'completed',
    '2026-08-10T10:00:00.000Z'
  );

  // Prizes 106
  const insertPrize = db.prepare('INSERT INTO raffle_prizes (raffle_id, position, description) VALUES (?, ?, ?)');
  insertPrize.run('rifa-106', 1, 'VARA PRO CHOMPERS KELBERI 329,90');
  insertPrize.run('rifa-106', 2, 'MALETA ALBATROZ H458A 279,90');
  insertPrize.run('rifa-106', 3, 'ISCA KING CRANK LANÇAMENTO 2026 59,90');

  // Numbers 1 to 45 (All paid as provided by user)
  const numbers106 = [
    { num: 1, name: "MARCOS SYROCA", status: "paid" },
    { num: 2, name: "MARCOS MAURO", status: "paid" },
    { num: 3, name: "JUNIOR JJ", status: "paid" },
    { num: 4, name: "FÁBIO MATSUDA", status: "paid" },
    { num: 5, name: "FERNANDO SF", status: "paid" },
    { num: 6, name: "HUGO", status: "paid" },
    { num: 7, name: "RAI", status: "paid" },
    { num: 8, name: "MARCELO B", status: "paid" },
    { num: 9, name: "HUGO", status: "paid" },
    { num: 10, name: "ARISON", status: "paid" },
    { num: 11, name: "ANTÔNIO", status: "paid" },
    { num: 12, name: "JÚNIOR JJ", status: "paid" },
    { num: 13, name: "HUGO", status: "paid" },
    { num: 14, name: "MAICK", status: "paid" },
    { num: 15, name: "MAICK", status: "paid" },
    { num: 16, name: "PORTAS E COMPENSADOS", status: "paid" },
    { num: 17, name: "PORTAS E COMPENSADOS", status: "paid" },
    { num: 18, name: "ANTÔNIO", status: "paid" },
    { num: 19, name: "ADIMARINS", status: "paid" },
    { num: 20, name: "FELLYPE", status: "paid" },
    { num: 21, name: "JOÃO PAULO K", status: "paid" },
    { num: 22, name: "FERNANDO SF", status: "paid" },
    { num: 23, name: "MATHEUS MACHADO", status: "paid" },
    { num: 24, name: "WELLINGTON", status: "paid" },
    { num: 25, name: "POLACO", status: "paid" },
    { num: 26, name: "ANDERSON B", status: "paid" },
    { num: 27, name: "VINICIUS LITKA", status: "paid" },
    { num: 28, name: "DIGGO", status: "paid" },
    { num: 29, name: "LENNON", status: "paid" },
    { num: 30, name: "RAI", status: "paid" },
    { num: 31, name: "SIDE", status: "paid" },
    { num: 32, name: "ANDERSON B", status: "paid" },
    { num: 33, name: "POLACO", status: "paid" },
    { num: 34, name: "CAIO", status: "paid" },
    { num: 35, name: "JOÃO PAULO K", status: "paid" },
    { num: 36, name: "FELLYPE", status: "paid" },
    { num: 37, name: "ANDERSON B", status: "paid" },
    { num: 38, name: "CARLÃO", status: "paid" },
    { num: 39, name: "LUCIANO", status: "paid" },
    { num: 40, name: "FELLYPE", status: "paid" },
    { num: 41, name: "MARCOS SYROCA", status: "paid" },
    { num: 42, name: "ADIMARINS", status: "paid" },
    { num: 43, name: "FELLYPE", status: "paid" },
    { num: 44, name: "FÁBIO MATSUDA", status: "paid" },
    { num: 45, name: "DIGGO", status: "paid" }
  ];

  const insertNumber = db.prepare(`
    INSERT OR REPLACE INTO raffle_numbers (raffle_id, num, name, status, reserved_at, paid_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  numbers106.forEach(item => {
    insertNumber.run('rifa-106', item.num, item.name, item.status, null, '2026-08-10T12:00:00.000Z');
  });
}

function seedRifa107() {
  const insertRaffle = db.prepare(`
    INSERT OR REPLACE INTO raffles (id, number, title, subtitle, price_per_number, total_numbers, reservation_timeout_hours, pix_key, pix_owner, shipping_note, live_draw_note, private_contact, rules, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertRaffle.run(
    'rifa-107',
    '107°',
    '107° AÇÃO ELDORADO PESCA',
    'AÇÃO RÁPIDA',
    25.00,
    60,
    2,
    '42999162340',
    'ELDORADO PESCA LTDA',
    'Frete a parte - Envio para todo o Brasil.',
    'Sorteio ao vivo no Instagram @lojaeldoradopesca',
    '42 9 99162340',
    'LEIAM COM ATENÇÃO!\nNAO COPIAR E COLAR, APENAS FALAR O NÚMERO.\nSorteio será quando o último número for pago, avisarei aqui no grupo.',
    'active',
    new Date().toISOString()
  );
}

function seedFishingBookings() {
  const insertBooking = db.prepare(`
    INSERT OR REPLACE INTO fishing_bookings (
      id, client_name, client_phone, booking_type, raffle_ref, prize_id,
      start_date, end_date, total_days, package_name, fishermen_count,
      total_amount, deposit_amount, remaining_amount, payment_status,
      payment_method, notes, guide_name, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBooking.run(
    'fb-sample-1',
    'MARCELO SOUZA',
    '42 9 9988-1122',
    'direct',
    '',
    null,
    '2026-08-29',
    '2026-08-29',
    1,
    'Pacote Eldorado 1 (Rancho + Barco)',
    2,
    2500.00,
    1000.00,
    1500.00,
    'deposit_paid',
    'Pix',
    'Sinal de R$ 1.000,00 pago via Pix. Restante de R$ 1.500,00 no dia da pescaria.',
    'Thiago Witeck',
    'scheduled',
    '2026-08-20T10:00:00.000Z'
  );

  insertBooking.run(
    'fb-sample-2',
    'DIGGO',
    '42 9 9933-4455',
    'raffle_prize',
    '106° AÇÃO ELDORADO PESCA',
    null,
    '2026-09-05',
    '2026-09-06',
    2,
    'Prêmio de Rifa (2 Diárias Eldorado Lake)',
    2,
    0.00,
    0.00,
    0.00,
    'raffle_covered',
    'Rifa',
    'Ganhador da Cota #45 da 106° Ação. Duas diárias completas com guia e rancho.',
    'Thiago Witeck',
    'scheduled',
    '2026-08-11T14:00:00.000Z'
  );

  insertBooking.run(
    'fb-sample-3',
    'CARLOS EDUARDO',
    '42 9 9877-6655',
    'direct',
    '',
    null,
    '2026-09-12',
    '2026-09-12',
    1,
    'Pacote Eldorado 2 (Dupla Esportiva)',
    2,
    2200.00,
    2200.00,
    0.00,
    'paid',
    'Pix',
    'Pagamento integral antecipado via Pix.',
    'Thiago Witeck',
    'scheduled',
    '2026-08-22T09:00:00.000Z'
  );
}

/**
 * Operações do Banco de Dados
 */
function getAllData() {
  // Settings
  const settingsRows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {
    eduardoDailyRate: 62.00,
    eduardoHalfRate: 31.00
  };
  settingsRows.forEach(r => {
    if (r.key === 'eduardoDailyRate' || r.key === 'eduardoHalfRate') {
      settings[r.key] = parseFloat(r.value);
    } else {
      settings[r.key] = r.value;
    }
  });

  // Raffles
  const rafflesRows = db.prepare('SELECT * FROM raffles ORDER BY created_at DESC').all();
  const raffles = rafflesRows.map(r => {
    const numbers = db.prepare('SELECT num, name, status, reserved_at as reservedAt, paid_at as paidAt FROM raffle_numbers WHERE raffle_id = ? ORDER BY num ASC').all(r.id);
    const prizes = db.prepare('SELECT position, description, winner_number as winnerNumber, winner_name as winnerName FROM raffle_prizes WHERE raffle_id = ? ORDER BY position ASC').all(r.id);

    return {
      id: r.id,
      number: r.number,
      title: r.title,
      subtitle: r.subtitle,
      pricePerNumber: r.price_per_number,
      totalNumbers: r.total_numbers,
      reservationTimeoutHours: r.reservation_timeout_hours,
      pixKey: r.pix_key,
      pixOwner: r.pix_owner,
      shippingNote: r.shipping_note,
      liveDrawNote: r.live_draw_note,
      privateContact: r.private_contact,
      rules: r.rules,
      status: r.status,
      createdAt: r.created_at,
      prizes: prizes,
      numbers: numbers
    };
  });

  // Vales and Prizes
  const valesRows = db.prepare('SELECT * FROM vales_prizes ORDER BY created_at DESC').all();
  const valesAndPrizes = valesRows.map(v => {
    const transactions = db.prepare('SELECT id, date, item, amount, remaining_balance as remainingBalance, registered_by as registeredBy FROM vale_transactions WHERE vale_id = ? ORDER BY date DESC').all(v.id);

    return {
      id: v.id,
      customerName: v.customer_name,
      customerPhone: v.customer_phone,
      type: v.type,
      raffleRef: v.raffle_ref,
      dateWon: v.date_won,
      initialAmount: v.initial_amount,
      currentBalance: v.current_balance,
      description: v.description,
      status: v.status,
      deliveredAt: v.delivered_at,
      notes: v.notes,
      exchangedItem: v.exchanged_item,
      differencePaid: v.difference_paid || 0,
      exchangeNotes: v.exchange_notes,
      exchangedAt: v.exchanged_at,
      transactions: transactions
    };
  });

  // Eduardo Work Days
  const eduardoRows = db.prepare('SELECT date, type, hours_weight as hoursWeight, amount_due as amountDue, notes FROM eduardo_work_days ORDER BY date ASC').all();

  // Fishing Bookings (Agenda de Pesca do Eldorado Lake)
  const fishingRows = db.prepare(`
    SELECT 
      id, client_name as clientName, client_phone as clientPhone,
      booking_type as bookingType, raffle_ref as raffleRef, prize_id as prizeId,
      start_date as startDate, end_date as endDate, dates, total_days as totalDays,
      raffle_days as raffleDays, extra_days as extraDays,
      package_name as packageName, structure_type as structureType,
      fishermen_count as fishermenCount, boats_count as boatsCount,
      kayaks_count as kayaksCount, custom_structure as customStructure,
      total_amount as totalAmount, deposit_amount as depositAmount,
      remaining_amount as remainingAmount, payment_status as paymentStatus,
      payment_method as paymentMethod, notes, guide_name as guideName,
      status, created_at as createdAt
    FROM fishing_bookings
    ORDER BY start_date ASC
  `).all();

  const formattedFishing = fishingRows.map(b => {
    let parsedDates = [];
    try {
      if (b.dates) parsedDates = typeof b.dates === 'string' ? JSON.parse(b.dates) : b.dates;
    } catch (e) {
      if (typeof b.dates === 'string' && b.dates.includes(',')) {
        parsedDates = b.dates.split(',').map(s => s.trim());
      }
    }
    if (!parsedDates || parsedDates.length === 0) {
      if (b.startDate) parsedDates = [b.startDate];
    }
    return {
      ...b,
      dates: parsedDates
    };
  });

  // Rancho Bookings (Locação e Hospedagem no Rancho Eldorado)
  const ranchoRows = db.prepare(`
    SELECT 
      id, client_name as clientName, client_phone as clientPhone,
      check_in_date as checkInDate, check_out_date as checkOutDate,
      total_days as totalDays, guests_count as guestsCount,
      total_amount as totalAmount, deposit_amount as depositAmount,
      remaining_amount as remainingAmount, payment_status as paymentStatus,
      payment_method as paymentMethod, notes, status, created_at as createdAt
    FROM rancho_bookings
    ORDER BY check_in_date ASC
  `).all();

  return {
    settings,
    raffles,
    valesAndPrizes,
    eduardoWorkDays: eduardoRows,
    fishingBookings: formattedFishing,
    ranchoBookings: ranchoRows
  };
}

module.exports = {
  db,
  initDatabase,
  getAllData,
  checkpointDatabase
};

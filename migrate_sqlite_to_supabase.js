/**
 * Eldorado Pesca & Lake - Script de Migração SQLite -> Supabase
 * Executa a carga inicial de todos os dados locais do SQLite para a nuvem do Supabase
 * 
 * Uso:
 * 1. Preencha o arquivo supabase_config.js com as suas credenciais do Supabase
 * 2. Execute o schema no SQL Editor do Supabase (arquivo supabase_schema.sql)
 * 3. Execute este script com: node migrate_sqlite_to_supabase.js
 */

const { db, getAllData } = require('./database.js');
const SUPABASE_CONFIG = require('./supabase_config.js');

async function migrateData() {
  console.log('============================================================');
  console.log('  ELDORADO PESCA & LAKE - MIGRAÇÃO SQLITE -> SUPABASE');
  console.log('============================================================\n');

  if (!SUPABASE_CONFIG.SUPABASE_URL || SUPABASE_CONFIG.SUPABASE_URL.includes('SEU_PROJETO')) {
    console.error('ERRO: Configure a SUPABASE_URL no arquivo supabase_config.js antes de rodar.');
    process.exit(1);
  }

  const baseUrl = SUPABASE_CONFIG.SUPABASE_URL.replace(/\/$/, '');
  const apiKey = SUPABASE_CONFIG.SUPABASE_ANON_KEY;

  async function supabasePost(tableName, rows) {
    if (!rows || rows.length === 0) return;
    const url = `${baseUrl}/rest/v1/${tableName}?on_conflict=id`;
    
    // Chunking to avoid large payloads
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(chunk)
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(`Erro ao inserir em ${tableName}:`, text);
      }
    }
  }

  console.log('1. Lendo dados do SQLite local (eldorado_pesca.db)...');
  const localData = getAllData();

  console.log(`- Rifas: ${localData.raffles?.length || 0}`);
  console.log(`- Vales e Prêmios: ${localData.valesAndPrizes?.length || 0}`);
  console.log(`- Reservas de Pesca: ${localData.fishingBookings?.length || 0}`);
  console.log(`- Locações do Rancho: ${localData.ranchoBookings?.length || 0}`);
  console.log(`- Folha do Eduardo: ${Object.keys(localData.eduardoWorkDays || {}).length} dias`);

  console.log('\n2. Enviando dados para o Supabase...');

  // 1. Settings
  const settingsRows = [
    { key: 'eduardoDailyRate', value: localData.settings?.eduardoDailyRate || '62.00' },
    { key: 'eduardoHalfDayRate', value: localData.settings?.eduardoHalfDayRate || '31.00' },
    { key: 'ranchoDailyRate', value: localData.settings?.ranchoDailyRate || '250.00' }
  ];
  await supabasePost('settings', settingsRows);
  console.log('✓ Configurações migradas');

  // 2. Raffles & Numbers
  if (localData.raffles && localData.raffles.length > 0) {
    const rafflesRows = localData.raffles.map(r => ({
      id: r.id,
      number: r.number || '',
      title: r.title,
      subtitle: r.subtitle || '',
      price_per_number: r.pricePerNumber || 0,
      total_numbers: r.totalNumbers || 100,
      reservation_timeout_hours: r.reservationTimeoutHours || 24,
      pix_key: r.pixKey || '',
      pix_owner: r.pixOwner || '',
      shipping_note: r.shippingNote || '',
      live_draw_note: r.liveDrawNote || '',
      rules: r.rules || '',
      status: r.status || 'active',
      created_at: r.createdAt || new Date().toISOString()
    }));
    await supabasePost('raffles', rafflesRows);

    for (const r of localData.raffles) {
      if (r.numbers && r.numbers.length > 0) {
        const numRows = r.numbers.map(n => ({
          raffle_id: r.id,
          num: n.num,
          name: n.name || '',
          status: n.status || 'available',
          reserved_at: n.reservedAt || null,
          paid_at: n.paidAt || null
        }));
        await supabasePost('raffle_numbers', numRows);
      }

      if (r.prizes && r.prizes.length > 0) {
        const prizeRows = r.prizes.map(p => ({
          raffle_id: r.id,
          position: p.position || 1,
          description: p.description || '',
          winner_number: p.winnerNumber || null,
          winner_name: p.winnerName || ''
        }));
        await supabasePost('raffle_prizes', prizeRows);
      }
    }
    console.log('✓ Rifas, números e prêmios migrados');
  }

  // 3. Vales & Prêmios
  if (localData.valesAndPrizes && localData.valesAndPrizes.length > 0) {
    const valesRows = localData.valesAndPrizes.map(v => ({
      id: v.id,
      customer_name: v.customerName,
      customer_phone: v.customerPhone || '',
      type: v.type || 'dual_choice',
      raffle_ref: v.raffleRef || '',
      date_won: v.dateWon || new Date().toISOString().slice(0, 10),
      initial_amount: v.initialAmount || 0,
      current_balance: v.currentBalance || 0,
      description: v.description || '',
      status: v.status || 'pending_choice',
      delivered_at: v.deliveredAt || null,
      notes: v.notes || '',
      exchanged_item: v.exchangedItem || null,
      difference_paid: v.differencePaid || 0,
      exchange_notes: v.exchangeNotes || '',
      exchanged_at: v.exchangedAt || null
    }));
    await supabasePost('vales_prizes', valesRows);

    for (const v of localData.valesAndPrizes) {
      if (v.transactions && v.transactions.length > 0) {
        const txRows = v.transactions.map((tx, idx) => ({
          id: `${v.id}-tx-${idx}-${Date.now()}`,
          vale_id: v.id,
          date: tx.date || new Date().toISOString().slice(0, 10),
          item: tx.item || '',
          amount: tx.amount || 0,
          remaining_balance: tx.remainingBalance || 0,
          registered_by: tx.registeredBy || 'Eldorado Pesca'
        }));
        await supabasePost('vale_transactions', txRows);
      }
    }
    console.log('✓ Vales, prêmios e histórico de baixas migrados');
  }

  // 4. Fishing Bookings
  if (localData.fishingBookings && localData.fishingBookings.length > 0) {
    const fishRows = localData.fishingBookings.map(b => ({
      id: b.id,
      client_name: b.clientName,
      client_phone: b.clientPhone || '',
      booking_type: b.bookingType || 'direct',
      raffle_ref: b.raffleRef || '',
      prize_id: b.prizeId || null,
      start_date: b.startDate,
      end_date: b.endDate || b.startDate,
      dates: JSON.stringify(b.dates || [b.startDate]),
      total_days: b.totalDays || 1,
      raffle_days: b.raffleDays || 1,
      extra_days: b.extraDays || 0,
      package_name: b.packageName || 'Dupla (2 Pescadores)',
      structure_type: b.structureType || 'dupla',
      fishermen_count: b.fishermenCount || 2,
      boats_count: b.boatsCount || 1,
      kayaks_count: b.kayaksCount || 0,
      custom_structure: b.customStructure || '',
      total_amount: b.totalAmount || 0,
      deposit_amount: b.depositAmount || 0,
      remaining_amount: b.remainingAmount || 0,
      payment_status: b.paymentStatus || 'pending',
      payment_method: b.paymentMethod || 'Pix',
      notes: b.notes || '',
      guide_name: b.guideName || 'Thiago Witeck',
      status: b.status || 'scheduled'
    }));
    await supabasePost('fishing_bookings', fishRows);
    console.log('✓ Agenda de Pescaria migrada');
  }

  // 5. Rancho Bookings
  if (localData.ranchoBookings && localData.ranchoBookings.length > 0) {
    const ranchoRows = localData.ranchoBookings.map(r => ({
      id: r.id,
      client_name: r.clientName,
      client_phone: r.clientPhone || '',
      check_in_date: r.checkInDate,
      check_out_date: r.checkOutDate,
      total_days: r.totalDays || 1,
      guests_count: r.guestsCount || 2,
      total_amount: r.totalAmount || 0,
      deposit_amount: r.depositAmount || 0,
      remaining_amount: r.remainingAmount || 0,
      payment_status: r.paymentStatus || 'pending',
      payment_method: r.paymentMethod || 'Pix',
      notes: r.notes || '',
      status: r.status || 'scheduled'
    }));
    await supabasePost('rancho_bookings', ranchoRows);
    console.log('✓ Locações do Rancho migradas');
  }

  // 6. Eduardo Work Days
  if (localData.eduardoWorkDays && Object.keys(localData.eduardoWorkDays).length > 0) {
    const eduardoRows = Object.entries(localData.eduardoWorkDays).map(([date, data]) => ({
      date: date,
      type: typeof data === 'string' ? data : (data.type || 'off'),
      hours_weight: data.hoursWeight || 1.0,
      amount_due: data.amountDue || 0,
      notes: data.notes || ''
    }));
    await supabasePost('eduardo_work_days', eduardoRows);
    console.log('✓ Folha e Ponto do Eduardo migrados');
  }

  console.log('\n============================================================');
  console.log('  [SUCESSO] MIGRAÇÃO PARA O SUPABASE CONCLUÍDA!');
  console.log('============================================================\n');
}

migrateData().catch(err => {
  console.error('Falha na migração:', err);
});

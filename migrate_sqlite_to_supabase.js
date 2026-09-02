/**
 * Eldorado Pesca & Lake - Script de Migração SQLite -> Supabase (Multi-Tenant)
 * Executa a carga inicial de todos os dados locais do SQLite para a nuvem do Supabase
 * associando todas as entidades à organização padrão.
 */

const fs = require('fs');
const path = require('path');

// Parser nativo do .env sem dependência externa
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let val = (match[2] || '').trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
} catch (e) {}

const { db, getAllData } = require('./database.js');
const SUPABASE_CONFIG = require('./supabase_config.js');

const TARGET_ORG_ID = process.env.TARGET_ORG_ID || process.env.DEFAULT_ORG_ID || process.argv[2] || '00000000-0000-0000-0000-000000000001';

async function migrateData() {
  console.log('============================================================');
  console.log('  ELDORADO PESCA & LAKE - MIGRAÇÃO SQLITE -> SUPABASE');
  console.log('============================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || SUPABASE_CONFIG.SUPABASE_URL;
  // Use Secret Key if available for administrative CLI migration, otherwise Publishable Key
  const apiKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_CONFIG.SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl.includes('SEU_PROJETO')) {
    console.error('ERRO: Configure a SUPABASE_URL no arquivo .env antes de rodar.');
    process.exit(1);
  }

  const baseUrl = supabaseUrl.replace(/\/$/, '');

  async function supabasePost(tableName, rows, onConflict = null) {
    if (!rows || rows.length === 0) return;
    const conflictQuery = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    const url = `${baseUrl}/rest/v1/${tableName}${conflictQuery}`;
    
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
          'Authorization': `Bearer ${apiKey}`,
          'Prefer': onConflict ? 'resolution=merge-duplicates' : 'return=minimal'
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

  console.log('\n2. Garantindo existência da Organização no Supabase...');
  await supabasePost('organizations', [{
    id: TARGET_ORG_ID,
    name: 'Eldorado Pesca & Lake',
    slug: 'eldorado-pesca-principal'
  }], 'id');
  console.log(`✓ Organização alvo (${TARGET_ORG_ID}) verificada`);

  console.log('\n3. Enviando dados para o Supabase...');

  // 1. Settings
  const settingsRows = [
    { organization_id: TARGET_ORG_ID, key: 'eduardoDailyRate', value: JSON.stringify({ rate: localData.settings?.eduardoDailyRate || 62.00 }) },
    { organization_id: TARGET_ORG_ID, key: 'eduardoHalfRate', value: JSON.stringify({ rate: localData.settings?.eduardoHalfRate || 31.00 }) },
    { organization_id: TARGET_ORG_ID, key: 'ranchoDailyRate', value: JSON.stringify({ rate: localData.settings?.ranchoDailyRate || 250.00 }) }
  ];
  await supabasePost('settings', settingsRows, 'organization_id,key');
  console.log('✓ Configurações migradas');

  // 2. Raffles, Numbers & Prizes
  if (localData.raffles && localData.raffles.length > 0) {
    const rafflesRows = localData.raffles.map(r => ({
      organization_id: TARGET_ORG_ID,
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
    await supabasePost('raffles', rafflesRows, 'organization_id,id');

    for (const r of localData.raffles) {
      if (r.numbers && r.numbers.length > 0) {
        const numRows = r.numbers.map(n => ({
          organization_id: TARGET_ORG_ID,
          raffle_id: r.id,
          num: n.num,
          name: n.name || '',
          status: n.status || 'available',
          reserved_at: n.reservedAt || null,
          paid_at: n.paidAt || null
        }));
        await supabasePost('raffle_numbers', numRows, 'organization_id,raffle_id,num');
      }

      if (r.prizes && r.prizes.length > 0) {
        const prizeRows = r.prizes.map((p, idx) => ({
          organization_id: TARGET_ORG_ID,
          raffle_id: r.id,
          position: p.position || (idx + 1),
          description: p.description || '',
          winner_number: p.winnerNumber || null,
          winner_name: p.winnerName || ''
        }));
        await supabasePost('raffle_prizes', prizeRows, 'organization_id,raffle_id,position');
      }
    }
    console.log('✓ Rifas, números e prêmios migrados');
  }

  // 3. Vales & Prêmios
  if (localData.valesAndPrizes && localData.valesAndPrizes.length > 0) {
    const valesRows = localData.valesAndPrizes.map(v => ({
      organization_id: TARGET_ORG_ID,
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
    await supabasePost('vales_prizes', valesRows, 'organization_id,id');

    for (const v of localData.valesAndPrizes) {
      if (v.transactions && v.transactions.length > 0) {
        const txRows = v.transactions.map((tx, idx) => ({
          organization_id: TARGET_ORG_ID,
          id: tx.id || `${v.id}-tx-${idx}-${Date.now()}`,
          vale_id: v.id,
          date: tx.date || new Date().toISOString().slice(0, 10),
          item: tx.item || '',
          amount: tx.amount || 0,
          remaining_balance: tx.remainingBalance || 0,
          registered_by: tx.registeredBy || 'Eldorado Pesca'
        }));
        await supabasePost('vale_transactions', txRows, 'organization_id,id');
      }
    }
    console.log('✓ Vales, prêmios e histórico de baixas migrados');
  }

  // 4. Fishing Bookings
  if (localData.fishingBookings && localData.fishingBookings.length > 0) {
    const fishRows = localData.fishingBookings.map(b => ({
      organization_id: TARGET_ORG_ID,
      id: b.id,
      client_name: b.clientName,
      client_phone: b.clientPhone || '',
      booking_type: b.bookingType || 'direct',
      raffle_ref: b.raffleRef || '',
      prize_id: b.prizeId || null,
      start_date: b.startDate,
      end_date: b.endDate || b.startDate,
      dates: b.dates || [b.startDate],
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
    await supabasePost('fishing_bookings', fishRows, 'organization_id,id');
    console.log('✓ Agenda de Pescaria migrada');
  }

  // 5. Rancho Bookings
  if (localData.ranchoBookings && localData.ranchoBookings.length > 0) {
    const ranchoRows = localData.ranchoBookings.map(r => ({
      organization_id: TARGET_ORG_ID,
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
    await supabasePost('rancho_bookings', ranchoRows, 'organization_id,id');
    console.log('✓ Locações do Rancho migradas');
  }

  // 6. Eduardo Work Days
  if (localData.eduardoWorkDays) {
    const entries = Array.isArray(localData.eduardoWorkDays) 
      ? localData.eduardoWorkDays 
      : Object.entries(localData.eduardoWorkDays).map(([date, data]) => ({
          date: date,
          type: typeof data === 'string' ? data : (data.type || 'off'),
          hoursWeight: data.hoursWeight || 1.0,
          amountDue: data.amountDue || 0,
          notes: data.notes || ''
        }));

    if (entries.length > 0) {
      const eduardoRows = entries.map(d => ({
        organization_id: TARGET_ORG_ID,
        date: d.date,
        type: d.type || 'off',
        hours_weight: d.hoursWeight || 1.0,
        amount_due: d.amountDue || 0,
        notes: d.notes || ''
      }));
      await supabasePost('eduardo_work_days', eduardoRows, 'organization_id,date');
      console.log('✓ Folha e Ponto do Eduardo migrados');
    }
  }

  console.log('\n============================================================');
  console.log('  [SUCESSO] MIGRAÇÃO PARA O SUPABASE CONCLUÍDA!');
  console.log('============================================================\n');
}

migrateData().catch(err => {
  console.error('Falha na migração:', err);
});

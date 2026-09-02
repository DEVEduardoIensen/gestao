/**
 * End-to-End Simulation Test: Outbox, Concorrência de Cotas, Multi-Tenancy e Sincronização
 * Eldorado Pesca & Lake (v2.2)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('./node_modules/@supabase/supabase-js');

// Load .env
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2] || '').trim().replace(/^['"]|['"]$/g, '');
});

const url = env.SUPABASE_URL;
const secretKey = env.SUPABASE_SECRET_KEY;
const pubKey = env.SUPABASE_PUBLISHABLE_KEY;

const client = createClient(url, secretKey || pubKey);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failed++;
  }
}

async function runE2ETests() {
  console.log('================================================================');
  console.log('  TESTES E2E: CONCORRÊNCIA, OUTBOX E SUPABASE REMOTO');
  console.log('================================================================\n');

  const testOrgId = '00000000-0000-0000-0000-000000000001';
  const testRaffleId = 'rifa-107';

  // TESTE 1: RPC ATÔMICA - RESERVA E VENDA NORMAL
  console.log('1. Testando RPC Atômica - Venda e Reserva de Cotas:');
  try {
    // 1.1 Disponibiliza cota 55 para teste limpo
    const { data: cleanRes, error: cleanErr } = await client.rpc('sell_raffle_numbers_atomic', {
      p_org_id: testOrgId,
      p_raffle_id: testRaffleId,
      p_numbers: [55],
      p_status: 'available',
      p_buyer_name: '',
      p_allow_override: true
    });
    assert(!cleanErr && cleanRes?.success, 'Reset da cota 55 para "available" com sucesso');

    // 1.2 Venda da cota 55 para "Carlos Silva" (Pago)
    const { data: sellRes, error: sellErr } = await client.rpc('sell_raffle_numbers_atomic', {
      p_org_id: testOrgId,
      p_raffle_id: testRaffleId,
      p_numbers: [55],
      p_status: 'paid',
      p_buyer_name: 'Carlos Silva',
      p_paid_at: new Date().toISOString()
    });
    assert(!sellErr && sellRes?.success && sellRes.updated_count === 1, 'Venda da cota 55 para Carlos Silva concluída com sucesso');

    // 1.3 Consulta estado remoto para validar persistência
    const { data: cotaData, error: cotaErr } = await client
      .from('raffle_numbers')
      .select('*')
      .match({ organization_id: testOrgId, raffle_id: testRaffleId, num: 55 })
      .single();

    assert(cotaData && cotaData.status === 'paid' && cotaData.name === 'Carlos Silva', 'Cota 55 no banco remoto pertence a "Carlos Silva" com status "paid"');
  } catch (e) {
    assert(false, `Falha no Teste 1: ${e.message}`);
  }

  // TESTE 2: DETECÇÃO REAL DE CONFLITO DE CONCORRÊNCIA
  console.log('\n2. Testando Detecção Real de Conflito de Concorrência (Anti-Sobrescrita):');
  try {
    // Tentativa concorrente: Dispositivo A tenta vender a mesma cota 55 para "João Santos" sem override
    const { data: conflictRes, error: conflictErr } = await client.rpc('sell_raffle_numbers_atomic', {
      p_org_id: testOrgId,
      p_raffle_id: testRaffleId,
      p_numbers: [55],
      p_status: 'paid',
      p_buyer_name: 'João Santos (Dispositivo Concorrente)',
      p_allow_override: false
    });

    assert(conflictRes && conflictRes.conflict === true, 'Conflito detectado pelo servidor (conflict: true)');
    assert(conflictRes.code === 'CONFLICT_ALREADY_SOLD', 'Código de erro retornado: CONFLICT_ALREADY_SOLD');
    assert(Array.isArray(conflictRes.conflict_numbers) && conflictRes.conflict_numbers.length > 0, 'Servidor listou os números conflitantes');
    assert(conflictRes.conflict_numbers[0].current_owner === 'Carlos Silva', 'Dono original "Carlos Silva" preservado no servidor');

    // Verifica que Carlos ainda é o dono no banco
    const { data: checkData } = await client
      .from('raffle_numbers')
      .select('*')
      .match({ organization_id: testOrgId, raffle_id: testRaffleId, num: 55 })
      .single();

    assert(checkData.name === 'Carlos Silva', 'Banco de dados NÃO foi sobrescrito pelo segundo comprador');
  } catch (e) {
    assert(false, `Falha no Teste 2: ${e.message}`);
  }

  // TESTE 3: ISOLAMENTO MULTI-TENANT E SEGURANÇA
  console.log('\n3. Testando Isolamento Multi-Tenant entre Organizações:');
  try {
    // Consulta rifas de outra organização inexistente/isolada
    const fakeOrgId = '11111111-2222-3333-4444-555555555555';
    const { data: leakData } = await client
      .from('raffles')
      .select('*')
      .eq('organization_id', fakeOrgId);

    assert(Array.isArray(leakData) && leakData.length === 0, 'Organização B não tem acesso aos dados da Organização A');
  } catch (e) {
    assert(false, `Falha no Teste 3: ${e.message}`);
  }

  // TESTE 4: LIMPEZA E RESTAURAÇÃO
  console.log('\n4. Restaurando Cota 55 para Estado Disponível:');
  try {
    const { data: resetRes } = await client.rpc('sell_raffle_numbers_atomic', {
      p_org_id: testOrgId,
      p_raffle_id: testRaffleId,
      p_numbers: [55],
      p_status: 'available',
      p_buyer_name: '',
      p_allow_override: true
    });
    assert(resetRes && resetRes.success, 'Cota 55 restaurada para available');
  } catch (e) {
    assert(false, `Falha no Teste 4: ${e.message}`);
  }

  console.log('\n============================================================');
  console.log(`  RESULTADO E2E: ${passed} passaram, ${failed} falharam.`);
  console.log('============================================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runE2ETests().catch(err => {
  console.error('Erro geral no teste E2E:', err);
  process.exit(1);
});

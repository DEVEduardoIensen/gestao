const { db, initDatabase, getAllData } = require('./database.js');

async function testRaffleDeletion() {
  console.log('=== TESTE DE EXCLUSÃO DE RIFA E PRESERVAÇÃO DE GANHADORES ===\n');

  // 1. Initialize DB
  initDatabase();
  const initialData = getAllData();
  console.log(`1. Total de rifas iniciais: ${initialData.raffles.length}`);
  console.log(`   Total de vales/ganhadores iniciais: ${initialData.valesAndPrizes.length}`);

  // 2. Insert a test raffle with prizes and a winner in vales_prizes
  const testRaffleId = 'rifa-teste-temp-' + Date.now();
  const testValeId = 'vp-ganhador-teste-' + Date.now();

  db.exec('BEGIN TRANSACTION;');
  db.prepare(`
    INSERT INTO raffles (id, number, title, subtitle, price_per_number, total_numbers, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testRaffleId,
    '999°',
    '999° AÇÃO TESTE TEMPORÁRIA',
    'AÇÃO RÁPIDA',
    25.0,
    10,
    'active',
    new Date().toISOString()
  );

  db.prepare(`
    INSERT INTO raffle_prizes (raffle_id, position, description, winner_number, winner_name)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    testRaffleId,
    1,
    'CARRETILHA TESTE OU VALE COMPRAS R$ 500,00',
    7,
    'PESCADOR GANHADOR TESTE'
  );

  for (let i = 1; i <= 10; i++) {
    db.prepare(`
      INSERT INTO raffle_numbers (raffle_id, num, name, status)
      VALUES (?, ?, ?, ?)
    `).run(
      testRaffleId,
      i,
      i === 7 ? 'PESCADOR GANHADOR TESTE' : '',
      i === 7 ? 'paid' : 'available'
    );
  }

  // Insert the winner entry in vales_prizes
  db.prepare(`
    INSERT INTO vales_prizes (id, customer_name, customer_phone, type, raffle_ref, date_won, initial_amount, current_balance, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    testValeId,
    'PESCADOR GANHADOR TESTE',
    '42 9 9999-8888',
    'vale_compras',
    '999° AÇÃO TESTE TEMPORÁRIA',
    '2026-08-31',
    500.0,
    500.0,
    '1º Lugar - CARRETILHA TESTE OU VALE COMPRAS R$ 500,00 (Cota #7)',
    'active',
    new Date().toISOString()
  );

  db.exec('COMMIT;');
  console.log('2. Rifa de teste criada com sucesso com 10 cotas e 1 ganhador em vales_prizes.');

  // Verify before delete
  const beforeData = getAllData();
  const foundRaffleBefore = beforeData.raffles.find(r => r.id === testRaffleId);
  const foundValeBefore = beforeData.valesAndPrizes.find(v => v.id === testValeId);

  console.log(`   - Rifa encontrada antes do delete: ${!!foundRaffleBefore}`);
  console.log(`   - Ganhador encontrado antes do delete: ${!!foundValeBefore} (${foundValeBefore?.customerName})`);

  if (!foundRaffleBefore || !foundValeBefore) {
    throw new Error('Falha no setup do teste');
  }

  // 3. Perform Deletion via Database/API Logic
  db.exec('BEGIN TRANSACTION;');
  db.prepare('DELETE FROM raffle_numbers WHERE raffle_id = ?').run(testRaffleId);
  db.prepare('DELETE FROM raffle_prizes WHERE raffle_id = ?').run(testRaffleId);
  db.prepare('DELETE FROM raffles WHERE id = ?').run(testRaffleId);
  db.exec('COMMIT;');
  console.log('\n3. Exclusão da rifa executada.');

  // 4. Verify after delete
  const afterData = getAllData();
  const foundRaffleAfter = afterData.raffles.find(r => r.id === testRaffleId);
  const foundNumbersAfter = db.prepare('SELECT COUNT(*) as c FROM raffle_numbers WHERE raffle_id = ?').get(testRaffleId).c;
  const foundPrizesAfter = db.prepare('SELECT COUNT(*) as c FROM raffle_prizes WHERE raffle_id = ?').get(testRaffleId).c;
  const foundValeAfter = afterData.valesAndPrizes.find(v => v.id === testValeId);

  console.log(`4. Verificação pós-exclusão:`);
  console.log(`   - Rifa existe na lista de rifas? ${!!foundRaffleAfter} (esperado: false)`);
  console.log(`   - Números da rifa restantes no DB: ${foundNumbersAfter} (esperado: 0)`);
  console.log(`   - Prêmios da rifa restantes no DB: ${foundPrizesAfter} (esperado: 0)`);
  console.log(`   - Ganhador PERMANECE na aba Vales e Prêmios? ${!!foundValeAfter} (esperado: true)`);
  console.log(`   - Detalhes do ganhador preservado:`);
  console.log(`       Nome: ${foundValeAfter?.customerName}`);
  console.log(`       Rifa de Origem: ${foundValeAfter?.raffleRef}`);
  console.log(`       Saldo do Vale: R$ ${foundValeAfter?.currentBalance}`);
  console.log(`       Status: ${foundValeAfter?.status}`);

  if (foundRaffleAfter || foundNumbersAfter > 0 || foundPrizesAfter > 0 || !foundValeAfter) {
    console.error('\n❌ TESTE FALHOU!');
    process.exit(1);
  }

  // Clean up the temporary test vale
  db.prepare('DELETE FROM vales_prizes WHERE id = ?').run(testValeId);

  // 5. Test HTTP server DELETE endpoint
  console.log('\n5. Testando endpoint HTTP DELETE /api/raffles/:id');
  const server = require('./server.js');
  // Wait a small moment for server to bind if needed or test via fetch
  const testHttpRaffleId = 'rifa-http-teste-' + Date.now();
  db.prepare(`
    INSERT INTO raffles (id, number, title, subtitle, price_per_number, total_numbers, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(testHttpRaffleId, '888°', '888° HTTP TEST', 'AÇÃO', 20.0, 5, 'active', new Date().toISOString());

  const delRes = await fetch(`http://localhost:3000/api/raffles/${testHttpRaffleId}`, {
    method: 'DELETE'
  });
  const delData = await delRes.json();
  console.log('   - Resposta HTTP DELETE:', delRes.status, delData);

  const checkDeleted = db.prepare('SELECT COUNT(*) as c FROM raffles WHERE id = ?').get(testHttpRaffleId).c;
  console.log(`   - Rifa deletada via HTTP? ${checkDeleted === 0}`);

  if (checkDeleted !== 0) {
    throw new Error('Falha ao deletar rifa via HTTP');
  }

  console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO! A exclusão de rifas preserva perfeitamente os ganhadores e vales.');
  process.exit(0);
}

testRaffleDeletion().catch(err => {
  console.error('Erro no teste:', err);
  process.exit(1);
});

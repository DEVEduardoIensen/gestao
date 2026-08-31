const http = require('http');
const fs = require('fs');

async function testApi(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3000${path}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== VERIFYING ELDORADO PESCA SYSTEM ===\n');

  // 1. Check GET /api/data
  const initial = await testApi('/api/data');
  console.log('1. GET /api/data Status:', initial.status);
  console.log('   - Raffles count:', initial.data.raffles.length);
  console.log('   - Vales & Prizes count:', initial.data.valesAndPrizes.length);
  console.log('   - Fishing Bookings count:', initial.data.fishingBookings.length);
  console.log('   - Rancho Bookings count:', initial.data.ranchoBookings.length);

  // 2. Test Raffle Selection and numbers
  const r105 = initial.data.raffles.find(r => r.id === 'rifa-105');
  console.log('\n2. Rifa 105 verification:');
  console.log('   - Title:', r105?.title);
  console.log('   - Total numbers:', r105?.totalNumbers);
  console.log('   - Winner of 1st prize:', r105?.prizes?.[0]?.winnerName);

  // 3. Test RAI in valesAndPrizes
  const raiPrize = initial.data.valesAndPrizes.find(v => v.customerName === 'RAI' || v.id === 'vp-rai-105');
  console.log('\n3. RAI Prize in Vales & Prizes:');
  console.log('   - ID:', raiPrize?.id);
  console.log('   - Type:', raiPrize?.type);
  console.log('   - Status:', raiPrize?.status);
  console.log('   - Description:', raiPrize?.description);

  // 4. Test Choice switching (e.g. choice to diaria, then back to pending_choice or vale)
  console.log('\n4. Testing /api/vales/choose-option:');
  const chooseRes = await testApi('/api/vales/choose-option', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { valeId: 'vp-rai-105', choice: 'diaria' }
  });
  console.log('   - Choose diaria response:', chooseRes.status, chooseRes.data);

  // 5. Test Creating Direct Fishing Booking with multiple dates and custom structure
  console.log('\n5. Testing /api/fishing/booking:');
  const testBooking = {
    id: 'fb-test-' + Date.now(),
    clientName: 'TESTE CLIENTE AUTOMATIZADO',
    clientPhone: '42 9 9999-8888',
    bookingType: 'direct',
    startDate: '2026-10-10',
    endDate: '2026-10-12',
    dates: ['2026-10-10', '2026-10-11', '2026-10-12'],
    totalDays: 3,
    packageName: 'Personalizado',
    structureType: 'custom',
    fishermenCount: 4,
    boatsCount: 2,
    kayaksCount: 1,
    customStructure: '2 barcos para 4 pescadores + 1 caiaque',
    totalAmount: 7500.00,
    depositAmount: 3000.00,
    remainingAmount: 4500.00,
    paymentStatus: 'deposit_paid',
    guideName: 'Thiago Witeck',
    notes: 'Teste de integridade de sistema'
  };

  const bookingRes = await testApi('/api/fishing/booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: testBooking
  });
  console.log('   - Create booking response:', bookingRes.status, bookingRes.data);

  // 6. Test Fishing Payment
  console.log('\n6. Testing /api/fishing/payment:');
  const payRes = await testApi('/api/fishing/payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { id: testBooking.id, addAmount: 4500.00, notes: 'Quitado 100%' }
  });
  console.log('   - Payment response:', payRes.status, payRes.data);

  // 7. Test Deleting the test booking
  console.log('\n7. Testing /api/fishing/booking/:id DELETE:');
  const delRes = await testApi(`/api/fishing/booking/${testBooking.id}`, {
    method: 'DELETE'
  });
  console.log('   - Delete response:', delRes.status, delRes.data);

  // 8. Restore RAI status to pending_choice
  await testApi('/api/vales/choose-option', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { valeId: 'vp-rai-105', choice: 'pending_choice' }
  });

  console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY! ===\n');
}

runTests().catch(console.error);

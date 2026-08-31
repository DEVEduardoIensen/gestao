/**
 * Eldorado Pesca - Vercel Serverless Function Handler
 * Funciona na Nuvem da Vercel (https://eldorado-pesca.vercel.app)
 */

let cloudStore = null;

// Initial template data
const defaultData = {
  settings: {
    eduardoDailyRate: 62.00,
    eduardoHalfRate: 31.00,
    storeName: "ELDORADO PESCA LTDA",
    pixKey: "42999162340",
    phone: "42 9 9916-2340",
    instagram: "@lojaeldoradopesca"
  },
  raffles: [
    {
      id: "rifa-107",
      number: "107°",
      title: "107° AÇÃO ELDORADO PESCA",
      subtitle: "AÇÃO RÁPIDA",
      pricePerNumber: 25.00,
      totalNumbers: 60,
      reservationTimeoutHours: 2,
      pixKey: "42999162340",
      pixOwner: "ELDORADO PESCA LTDA",
      shippingNote: "Frete a parte - Envio para todo o Brasil.",
      liveDrawNote: "Sorteio ao vivo no Instagram @lojaeldoradopesca",
      privateContact: "42 9 99162340",
      rules: "",
      status: "active",
      createdAt: "2026-08-27T10:00:00.000Z",
      prizes: [
        { position: 1, description: "SHIMANO CURADO 200 DIREITA R$ 2200,00 OU 1000,00 EM VALE COMPRAS", winnerNumber: null, winnerName: null },
        { position: 2, description: "BONÉ SAPOZILLA 140,00 OU 70,00 EM VALE COMPRAS", winnerNumber: null, winnerName: null },
        { position: 3, description: "BONÉ BEAST SHAD 140,00 OU 70,00 EM VALE COMPRAS", winnerNumber: null, winnerName: null }
      ],
      numbers: Array.from({ length: 60 }, (_, i) => ({
        num: i + 1,
        name: "",
        status: "available",
        reservedAt: null,
        paidAt: null
      }))
    }
  ],
  valesAndPrizes: [],
  eduardoWorkDays: [],
  fishingBookings: [
    {
      id: "fb-sample-1",
      clientName: "MARCELO SOUZA",
      clientPhone: "42 9 9988-1122",
      bookingType: "direct",
      raffleRef: "",
      prizeId: null,
      startDate: "2026-08-29",
      endDate: "2026-08-29",
      totalDays: 1,
      packageName: "Pacote Eldorado 1 (Rancho + Barco)",
      fishermenCount: 2,
      totalAmount: 2500.00,
      depositAmount: 1000.00,
      remainingAmount: 1500.00,
      paymentStatus: "deposit_paid",
      paymentMethod: "Pix",
      notes: "Sinal de R$ 1.000,00 pago via Pix. Restante no dia da pescaria.",
      guideName: "Thiago Witeck",
      status: "scheduled",
      createdAt: "2026-08-20T10:00:00.000Z"
    }
  ]
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (!cloudStore) {
    cloudStore = JSON.parse(JSON.stringify(defaultData));
  }

  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // GET /api/data
  if (req.method === 'GET' && (pathname === '/api/data' || pathname === '/api')) {
    return res.status(200).json(cloudStore);
  }

  // POST /api/raffles/number
  if (req.method === 'POST' && pathname === '/api/raffles/number') {
    const body = req.body || {};
    const raffle = cloudStore.raffles.find(r => r.id === body.raffleId);
    if (raffle) {
      const numItem = raffle.numbers.find(n => n.num === body.num);
      if (numItem) {
        numItem.name = body.name || '';
        numItem.status = body.status || 'available';
        numItem.reservedAt = body.reservedAt || null;
        numItem.paidAt = body.paidAt || null;
      }
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/raffles/winner
  if (req.method === 'POST' && pathname === '/api/raffles/winner') {
    const body = req.body || {};
    const raffle = cloudStore.raffles.find(r => r.id === body.raffleId);
    if (raffle) {
      const prize = raffle.prizes.find(p => p.position === body.position);
      if (prize) {
        prize.winnerNumber = body.num;
        prize.winnerName = body.winnerName || '';
      }
      const isVale = /vale/i.test(body.prizeDescription || '');
      cloudStore.valesAndPrizes.unshift({
        id: 'vp-' + Date.now(),
        customerName: body.winnerName || `Cota #${body.num}`,
        customerPhone: '',
        type: isVale ? 'vale_compras' : 'premio_fisico',
        raffleRef: raffle.title,
        dateWon: new Date().toISOString().slice(0, 10),
        initialAmount: 0,
        currentBalance: 0,
        description: `${body.position}º Lugar - ${body.prizeDescription} (Cota #${body.num})`,
        status: isVale ? 'active' : 'pending_pickup',
        deliveredAt: null,
        transactions: [],
        notes: `Ganhador sorteado na loja`
      });
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/raffles
  if (req.method === 'POST' && pathname === '/api/raffles') {
    const body = req.body || {};
    const raffleId = 'rifa-' + Date.now();
    const totalNums = parseInt(body.totalNumbers) || 60;
    const newRaffle = {
      id: raffleId,
      number: body.number || body.title?.split(' ')[0] || 'Nova',
      title: body.title || 'Nova Rifa',
      subtitle: body.subtitle || 'AÇÃO RÁPIDA',
      pricePerNumber: parseFloat(body.pricePerNumber) || 25,
      totalNumbers: totalNums,
      reservationTimeoutHours: 2,
      pixKey: '42999162340',
      pixOwner: 'ELDORADO PESCA LTDA',
      shippingNote: 'Frete a parte - Envio para todo o Brasil.',
      liveDrawNote: 'Sorteio ao vivo no Instagram @lojaeldoradopesca',
      privateContact: '42 9 99162340',
      rules: '',
      status: 'active',
      createdAt: new Date().toISOString(),
      prizes: (body.prizes || []).map((p, idx) => ({
        position: p.position || (idx + 1),
        description: p.description || '',
        winnerNumber: null,
        winnerName: null
      })),
      numbers: Array.from({ length: totalNums }, (_, i) => ({
        num: i + 1,
        name: '',
        status: 'available',
        reservedAt: null,
        paidAt: null
      }))
    };
    if (!cloudStore.raffles) cloudStore.raffles = [];
    cloudStore.raffles.unshift(newRaffle);
    return res.status(200).json({ success: true, raffleId });
  }

  // DELETE /api/raffles/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/raffles/')) {
    const raffleId = decodeURIComponent(pathname.replace('/api/raffles/', '')).trim();
    if (cloudStore.raffles) {
      cloudStore.raffles = cloudStore.raffles.filter(r => String(r.id) !== String(raffleId));
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/vales/abater
  if (req.method === 'POST' && pathname === '/api/vales/abater') {
    const body = req.body || {};
    const item = cloudStore.valesAndPrizes.find(v => v.id === body.valeId);
    if (item) {
      const abaterVal = parseFloat(body.amount) || 0;
      item.currentBalance = Math.max(0, item.currentBalance - abaterVal);
      if (item.currentBalance === 0) item.status = 'completed';
      if (!item.transactions) item.transactions = [];
      item.transactions.unshift({
        id: 'tx-' + Date.now(),
        date: body.date || new Date().toISOString().slice(0, 10),
        item: body.item || 'Baixa de saldo',
        amount: abaterVal,
        remainingBalance: item.currentBalance,
        registeredBy: 'Loja'
      });
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/vales/exchange
  if (req.method === 'POST' && pathname === '/api/vales/exchange') {
    const body = req.body || {};
    const item = cloudStore.valesAndPrizes.find(v => v.id === body.valeId);
    if (item) {
      item.status = 'delivered';
      item.deliveredAt = body.exchangedAt || new Date().toISOString().slice(0, 10);
      item.exchangedItem = body.exchangedItem;
      item.differencePaid = parseFloat(body.differencePaid) || 0;
      item.exchangeNotes = body.exchangeNotes || '';
      item.exchangedAt = body.exchangedAt || new Date().toISOString().slice(0, 10);
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/vales/choose-option
  if (req.method === 'POST' && pathname === '/api/vales/choose-option') {
    const body = req.body || {};
    const item = cloudStore.valesAndPrizes.find(v => v.id === body.valeId);
    if (item) {
      if (body.choice === 'vale') {
        const amt = parseFloat(body.amount) || 450.00;
        item.type = 'vale_compras';
        item.status = 'active';
        item.initialAmount = amt;
        item.currentBalance = amt;
        item.notes = 'Ganhador optou pelo Vale-Compras de R$ 450,00';
      } else if (body.choice === 'diaria') {
        item.type = 'dual_choice';
        item.status = 'pending_schedule';
        item.notes = 'Ganhador optou pela Diária de Pesca (Aguardando Agendamento)';
      } else if (body.choice === 'pending_choice') {
        item.type = 'dual_choice';
        item.status = 'pending_choice';
        item.notes = 'Ganhador pendente de escolha (Diária de Pesca ou Vale-Compras)';
      }
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/vales/update
  if (req.method === 'POST' && pathname === '/api/vales/update') {
    const body = req.body || {};
    const item = cloudStore.valesAndPrizes.find(v => v.id === body.id);
    if (item) {
      if (body.customerName) item.customerName = body.customerName;
      if (body.customerPhone !== undefined) item.customerPhone = body.customerPhone;
      if (body.description) item.description = body.description;
      if (body.notes !== undefined) item.notes = body.notes;
      if (body.type) item.type = body.type;
      if (body.status) item.status = body.status;
      if (body.currentBalance !== undefined) item.currentBalance = parseFloat(body.currentBalance) || 0;
      if (body.initialAmount !== undefined) item.initialAmount = parseFloat(body.initialAmount) || 0;
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/eduardo/day
  if (req.method === 'POST' && pathname === '/api/eduardo/day') {
    const body = req.body || {};
    cloudStore.eduardoWorkDays = cloudStore.eduardoWorkDays.filter(d => d.date !== body.date);
    if (body.type !== 'off') {
      cloudStore.eduardoWorkDays.push({
        date: body.date,
        type: body.type,
        hoursWeight: body.hoursWeight,
        amountDue: body.amountDue,
        notes: body.notes || ''
      });
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/fishing/booking
  if (req.method === 'POST' && pathname === '/api/fishing/booking') {
    const body = req.body || {};
    if (!cloudStore.fishingBookings) cloudStore.fishingBookings = [];
    const bookingId = body.id || ('fb-' + Date.now());
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

    const bookingIndex = cloudStore.fishingBookings.findIndex(b => b.id === bookingId);
    const bookingData = {
      id: bookingId,
      clientName: (body.clientName || '').trim(),
      clientPhone: body.clientPhone || '',
      bookingType: body.bookingType || 'direct',
      raffleRef: body.raffleRef || '',
      prizeId: body.prizeId || null,
      startDate: body.startDate,
      endDate: body.endDate || body.startDate,
      dates: Array.isArray(body.dates) ? body.dates : (body.dates ? [body.dates] : [body.startDate]),
      totalDays: parseInt(body.totalDays) || (isRaffle ? (raffleDays + extraDays) : 1),
      raffleDays: raffleDays,
      extraDays: extraDays,
      packageName: body.packageName || 'Dupla (2 Pessoas)',
      structureType: body.structureType || 'dupla',
      fishermenCount: parseInt(body.fishermenCount) || (body.structureType === 'trio' ? 3 : 2),
      boatsCount: parseInt(body.boatsCount) || 1,
      kayaksCount: parseInt(body.kayaksCount) || 0,
      customStructure: body.customStructure || '',
      totalAmount: totalAmount,
      depositAmount: depositAmount,
      remainingAmount: remainingAmount,
      paymentStatus: paymentStatus,
      paymentMethod: 'Pix',
      notes: body.notes || '',
      guideName: body.guideName || 'Thiago Witeck',
      status: body.status || 'scheduled',
      createdAt: body.createdAt || new Date().toISOString()
    };

    if (bookingIndex >= 0) {
      cloudStore.fishingBookings[bookingIndex] = bookingData;
    } else {
      cloudStore.fishingBookings.push(bookingData);
    }
    return res.status(200).json({ success: true, bookingId });
  }

  // POST /api/fishing/payment
  if (req.method === 'POST' && pathname === '/api/fishing/payment') {
    const body = req.body || {};
    if (!cloudStore.fishingBookings) cloudStore.fishingBookings = [];
    const booking = cloudStore.fishingBookings.find(b => b.id === body.id);
    if (booking) {
      const totalAmount = booking.totalAmount || 0;
      let newDeposit = parseFloat(body.paidAmount !== undefined ? body.paidAmount : totalAmount);
      if (body.addAmount) {
        newDeposit = (booking.depositAmount || 0) + parseFloat(body.addAmount);
      }
      const newRemaining = Math.max(0, totalAmount - newDeposit);
      booking.depositAmount = newDeposit;
      booking.remainingAmount = newRemaining;
      booking.paymentStatus = newRemaining === 0 ? 'paid' : (newDeposit > 0 ? 'deposit_paid' : 'pending');
      if (body.paymentMethod) booking.paymentMethod = body.paymentMethod;
      if (body.notes) booking.notes = body.notes;
    }
    return res.status(200).json({ success: true });
  }

  // DELETE /api/fishing/booking/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/fishing/booking/')) {
    const bookingId = pathname.replace('/api/fishing/booking/', '');
    if (cloudStore.fishingBookings) {
      cloudStore.fishingBookings = cloudStore.fishingBookings.filter(b => b.id !== bookingId);
    }
    return res.status(200).json({ success: true });
  }

  // POST /api/rancho/booking
  if (req.method === 'POST' && pathname === '/api/rancho/booking') {
    const body = req.body || {};
    if (!cloudStore.ranchoBookings) cloudStore.ranchoBookings = [];
    const bookingId = body.id || ('rb-' + Date.now());
    const totalAmount = parseFloat(body.totalAmount) || 0;
    const depositAmount = parseFloat(body.depositAmount) || 0;
    const remainingAmount = Math.max(0, totalAmount - depositAmount);

    let paymentStatus = 'pending';
    if (remainingAmount === 0 && totalAmount > 0) {
      paymentStatus = 'paid';
    } else if (depositAmount > 0) {
      paymentStatus = 'deposit_paid';
    }

    const bookingIndex = cloudStore.ranchoBookings.findIndex(b => b.id === bookingId);
    const bookingData = {
      id: bookingId,
      clientName: (body.clientName || '').trim(),
      clientPhone: body.clientPhone || '',
      checkInDate: body.checkInDate,
      checkOutDate: body.checkOutDate || body.checkInDate,
      totalDays: parseInt(body.totalDays) || 1,
      guestsCount: parseInt(body.guestsCount) || 4,
      totalAmount: totalAmount,
      depositAmount: depositAmount,
      remainingAmount: remainingAmount,
      paymentStatus: paymentStatus,
      paymentMethod: 'Pix',
      notes: body.notes || '',
      status: body.status || 'scheduled',
      createdAt: body.createdAt || new Date().toISOString()
    };

    if (bookingIndex >= 0) {
      cloudStore.ranchoBookings[bookingIndex] = bookingData;
    } else {
      cloudStore.ranchoBookings.push(bookingData);
    }
    return res.status(200).json({ success: true, bookingId });
  }

  // POST /api/rancho/payment
  if (req.method === 'POST' && pathname === '/api/rancho/payment') {
    const body = req.body || {};
    if (!cloudStore.ranchoBookings) cloudStore.ranchoBookings = [];
    const booking = cloudStore.ranchoBookings.find(b => b.id === body.id);
    if (booking) {
      const totalAmount = booking.totalAmount || 0;
      let newDeposit = parseFloat(body.paidAmount !== undefined ? body.paidAmount : totalAmount);
      if (body.addAmount) {
        newDeposit = (booking.depositAmount || 0) + parseFloat(body.addAmount);
      }
      const newRemaining = Math.max(0, totalAmount - newDeposit);
      booking.depositAmount = newDeposit;
      booking.remainingAmount = newRemaining;
      booking.paymentStatus = newRemaining === 0 ? 'paid' : (newDeposit > 0 ? 'deposit_paid' : 'pending');
      if (body.notes) booking.notes = body.notes;
    }
    return res.status(200).json({ success: true });
  }

  // DELETE /api/rancho/booking/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/rancho/booking/')) {
    const bookingId = pathname.replace('/api/rancho/booking/', '');
    if (cloudStore.ranchoBookings) {
      cloudStore.ranchoBookings = cloudStore.ranchoBookings.filter(b => b.id !== bookingId);
    }
    return res.status(200).json({ success: true });
  }

  return res.status(200).json(cloudStore);
};

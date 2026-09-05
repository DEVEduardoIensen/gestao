/**
 * Eldorado Pesca & Lake - Canonical Raffle Normalizer
 * Normalização centralizada e consistente para Web, Service Worker, Node e IndexedDB.
 */

function normalizeRaffle(r) {
  if (!r || typeof r !== 'object') return null;

  const rawPrizes = Array.isArray(r.prizes) ? r.prizes : [];
  const rawNumbers = Array.isArray(r.numbers) ? r.numbers : [];

  const total = parseInt(r.totalNumbers ?? r.total_numbers, 10) || (rawNumbers.length > 0 ? rawNumbers.length : 60);

  const normalizedPrizes = rawPrizes.map((p, idx) => {
    const pos = parseInt(p.position, 10) || (idx + 1);
    const desc = String(p.description || '').trim();
    
    let winnerNum = null;
    const rawWinNum = p.winnerNumber ?? p.winner_number;
    if (rawWinNum !== undefined && rawWinNum !== null && rawWinNum !== '') {
      const parsed = parseInt(rawWinNum, 10);
      if (!isNaN(parsed)) winnerNum = parsed;
    }

    const winnerName = String(p.winnerName ?? p.winner_name ?? '').trim();

    return {
      id: p.id !== undefined ? p.id : undefined,
      position: pos,
      description: desc,
      winnerNumber: winnerNum,
      winnerName: winnerName
    };
  }).sort((a, b) => a.position - b.position);

  let normalizedNumbers = [];
  if (rawNumbers.length > 0) {
    normalizedNumbers = rawNumbers.map((n, idx) => {
      const num = parseInt(n.num ?? idx + 1, 10);
      const name = String(n.name || '').trim();
      const status = n.status || 'available';
      const reservedAt = n.reservedAt ?? n.reserved_at ?? null;
      const paidAt = n.paidAt ?? n.paid_at ?? null;

      return {
        num,
        name: (status === 'available') ? '' : name,
        status,
        reservedAt: (status === 'available') ? null : reservedAt,
        paidAt: (status === 'paid') ? paidAt : null
      };
    });
  }

  const rawPrice = r.pricePerNumber ?? r.price_per_number;
  const price = typeof rawPrice === 'number' ? rawPrice : (parseFloat(rawPrice) || 0);

  return {
    id: String(r.id),
    organization_id: r.organization_id || r.orgId || undefined,
    number: String(r.number || '').trim(),
    title: String(r.title || '').replace(/\s*\((?:ativa|ativas|finalizada|finalizadas)\)/gi, '').trim(),
    subtitle: String(r.subtitle || 'AÇÃO RÁPIDA').trim(),
    pricePerNumber: price,
    totalNumbers: total,
    reservationTimeoutHours: parseInt(r.reservationTimeoutHours ?? r.reservation_timeout_hours, 10) || 24,
    pixKey: String(r.pixKey ?? r.pix_key ?? '').trim(),
    pixOwner: String(r.pixOwner ?? r.pix_owner ?? '').trim(),
    shippingNote: String(r.shippingNote ?? r.shipping_note ?? '').trim(),
    liveDrawNote: String(r.liveDrawNote ?? r.live_draw_note ?? '').trim(),
    privateContact: String(r.privateContact ?? r.private_contact ?? '').trim(),
    rules: String(r.rules || '').trim(),
    status: r.status || 'active',
    createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString(),
    prizes: normalizedPrizes,
    numbers: normalizedNumbers
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeRaffle };
}
if (typeof window !== 'undefined') {
  window.normalizeRaffle = normalizeRaffle;
}
if (typeof self !== 'undefined') {
  self.normalizeRaffle = normalizeRaffle;
}

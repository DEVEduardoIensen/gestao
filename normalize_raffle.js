/**
 * Eldorado Pesca & Lake - Canonical Raffle Normalizer
 * Normalização centralizada e consistente para Web, Service Worker, Node e IndexedDB.
 */

function normalizeRaffle(r, isPartial = false) {
  if (!r || typeof r !== 'object') return null;

  const hasExplicitPrizes = Array.isArray(r.prizes);
  const rawPrizes = hasExplicitPrizes ? r.prizes : [];
  const hasExplicitNumbers = Array.isArray(r.numbers);
  const rawNumbers = hasExplicitNumbers ? r.numbers : [];

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
  const price = (rawPrice !== undefined && rawPrice !== null)
    ? (typeof rawPrice === 'number' ? rawPrice : (parseFloat(rawPrice) || 0))
    : undefined;

  const result = {
    id: String(r.id),
    organization_id: r.organization_id || r.orgId || undefined,
    number: r.number !== undefined ? String(r.number || '').trim() : undefined,
    title: r.title !== undefined ? String(r.title || '').replace(/\s*\((?:ativa|ativas|finalizada|finalizadas)\)/gi, '').trim() : undefined,
    subtitle: r.subtitle !== undefined ? String(r.subtitle || 'AÇÃO RÁPIDA').trim() : undefined,
    pricePerNumber: price,
    totalNumbers: total,
    reservationTimeoutHours: parseInt(r.reservationTimeoutHours ?? r.reservation_timeout_hours, 10) || 24,
    pixKey: r.pixKey !== undefined ? String(r.pixKey ?? r.pix_key ?? '').trim() : undefined,
    pixOwner: r.pixOwner !== undefined ? String(r.pixOwner ?? r.pix_owner ?? '').trim() : undefined,
    shippingNote: r.shippingNote !== undefined ? String(r.shippingNote ?? r.shipping_note ?? '').trim() : undefined,
    liveDrawNote: r.liveDrawNote !== undefined ? String(r.liveDrawNote ?? r.live_draw_note ?? '').trim() : undefined,
    privateContact: r.privateContact !== undefined ? String(r.privateContact ?? r.private_contact ?? '').trim() : undefined,
    rules: r.rules !== undefined ? String(r.rules || '').trim() : undefined,
    status: r.status || 'active',
    createdAt: r.createdAt ?? r.created_at ?? new Date().toISOString()
  };

  if (hasExplicitPrizes || !isPartial) {
    result.prizes = normalizedPrizes;
  }
  if (hasExplicitNumbers || !isPartial) {
    result.numbers = normalizedNumbers;
  }

  return result;
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

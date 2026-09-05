/**
 * Eldorado Pesca & Lake - Sync Engine (Outbox Queue & Realtime Sync) (v2.1)
 * Processamento robusto de fila offline, RPCs atômicas, resolução de conflitos, deleções e idempotência.
 */

class SyncEngine {
  constructor() {
    this.isOnline = navigator.onLine;
    this.isSyncing = false;
    this.status = this.isOnline ? 'synced' : 'offline'; // 'synced', 'offline', 'syncing', 'conflict'
    this.conflicts = [];
    this.listeners = [];
    this.syncInterval = null;
    this.realtimeChannel = null;
    this._refreshTimer = null;

    this.init();
  }

  init() {
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Conexão restabelecida! Iniciando sincronização...');
        this.isOnline = true;
        this.updateStatus('syncing');
        this.initRealtimeSubscription();
        this.processQueue();
      });

      window.addEventListener('offline', () => {
        console.log('[SyncEngine] Conexão perdida. Modo offline ativado.');
        this.isOnline = false;
        this.updateStatus('offline');
      });

      window.addEventListener('pageshow', () => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          this.isOnline = true;
          this.processQueue();
        }
      });

      window.addEventListener('focus', () => {
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          this.isOnline = true;
          this.initRealtimeSubscription();
          this.processQueue();
        }
      });
    }

    // Ao focar na janela ou voltar de segundo plano, processa fila pendente
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && ((typeof navigator !== 'undefined' && navigator.onLine) || this.isOnline)) {
          this.isOnline = true;
          this.initRealtimeSubscription();
          this.processQueue();
        }
      });
    }

    // Escuta canal BroadcastChannel para atualizações em segundo plano vindas do Service Worker
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.broadcastChannel = new BroadcastChannel('eldorado-sync-channel');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data && event.data.type === 'BACKGROUND_SYNC_COMPLETE') {
            console.log('[SyncEngine] Notificação de Background Sync recebida do Service Worker.');
            this.scheduleDebouncedRemoteRefresh();
          }
        };
      }
    } catch (e) {}

    // Escuta mensagens diretas do Service Worker (Mobile PWA)
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'BACKGROUND_SYNC_COMPLETE') {
          console.log('[SyncEngine] Notificação direta do Service Worker recebida.');
          this.scheduleDebouncedRemoteRefresh();
        }
      });
    }

    // Escuta gatilho de sincronização em segundo plano do Electron Desktop (System Tray)
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.onTriggerBackgroundSync === 'function') {
      window.electronAPI.onTriggerBackgroundSync(() => {
        console.log('[SyncEngine] Sinal de sincronização em segundo plano recebido do Electron Desktop.');
        if (typeof navigator !== 'undefined' && navigator.onLine) this.isOnline = true;
        this.processQueue();
      });
    }

    // Auto-recuperação inicial de operações syncing abandonadas
    if (typeof window !== 'undefined' && window.localDB && typeof window.localDB.recoverAbandonedOperations === 'function') {
      window.localDB.recoverAbandonedOperations().catch(() => {});
    }

    // Auto-recuperação e processamento periódico a cada 5 segundos
    this.syncInterval = setInterval(() => {
      if (typeof window !== 'undefined' && window.localDB && typeof window.localDB.recoverAbandonedOperations === 'function') {
        window.localDB.recoverAbandonedOperations().catch(() => {});
      }
      if (typeof navigator !== 'undefined' && navigator.onLine && !this.isOnline) {
        this.isOnline = true;
        this.initRealtimeSubscription();
      }
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        this.isOnline = true;
      }
      if (this.isOnline && !this.isSyncing) {
        this.processQueue();
      }
    }, 5000);

    // Inicializa Realtime imediatamente se online
    if (this.isOnline) {
      setTimeout(() => this.initRealtimeSubscription(), 1000);
    }
  }

  initRealtimeSubscription() {
    if (!window.supabaseClient || !this.isOnline) return;

    if (this.realtimeChannel) {
      try {
        window.supabaseClient.removeChannel(this.realtimeChannel);
      } catch (e) {}
      this.realtimeChannel = null;
    }

    try {
      this.realtimeChannel = window.supabaseClient.channel('eldorado-sync-channel-' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
          console.log('[Realtime] Mudança remota recebida do Supabase:', payload.table, payload.eventType);
          if (this.isSyncing) return;
          this.handleRealtimePayload(payload);
        })
        .subscribe((status) => {
          console.log('[Realtime] Status do canal:', status);
        });
    } catch (e) {
      console.warn('[Realtime] Falha ao assinar Realtime:', e);
    }
  }

  async handleRealtimePayload(payload) {
    const { table, eventType, new: newRec } = payload;
    if (!window.appData) return;

    // Se for atualização pontual de cota da rifa
    if (table === 'raffle_numbers' && newRec) {
      const orgId = (window.authManager && window.authManager.getOrganizationId()) || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');
      
      // Protege contra sobrescrita de alterações locais pendentes na Outbox
      if (window.localDB) {
        try {
          const pending = await window.localDB.getPendingOperations(orgId);
          const cotaNum = parseInt(newRec.num, 10);
          const isPending = pending.some(op => {
            if (op.type === 'SELL_NUMBERS' && String(op.payload?.raffleId) === String(newRec.raffle_id)) {
              return Array.isArray(op.payload?.numbers) && op.payload.numbers.includes(cotaNum);
            }
            if (op.type === 'BATCH_SET_NUMBERS' && String(op.payload?.raffleId) === String(newRec.raffle_id)) {
              return Array.isArray(op.payload?.numbersList) && op.payload.numbersList.some(n => n.num === cotaNum);
            }
            return false;
          });
          if (isPending) {
            console.log('[Realtime] Ignorando payload remoto para cota pendente na Outbox:', cotaNum);
            return;
          }
        } catch (e) {}
      }

      const raffle = (window.appData.raffles || []).find(r => String(r.id) === String(newRec.raffle_id));
      if (raffle && Array.isArray(raffle.numbers)) {
        const numItem = raffle.numbers.find(n => n.num === parseInt(newRec.num, 10));
        if (numItem) {
          numItem.status = newRec.status;
          numItem.name = newRec.name || '';
          numItem.reservedAt = newRec.reserved_at;
          numItem.paidAt = newRec.paid_at;
          if (typeof window.renderRaffleNumbersGrid === 'function') {
            window.renderRaffleNumbersGrid();
          }
          if (typeof window.updateRaffleStats === 'function') {
            window.updateRaffleStats();
          }
          return;
        }
      }
    }

    // Para demais tabelas ou alterações estruturais, agenda recarga remota suave
    this.scheduleDebouncedRemoteRefresh();
  }

  scheduleDebouncedRemoteRefresh() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(async () => {
      const orgId = (window.authManager && window.authManager.getOrganizationId()) || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');
      if (!orgId || !this.isOnline || this.isSyncing) return;
      const remoteData = await this.fetchRemoteData(orgId);
      if (remoteData && typeof window.mergeRemoteData === 'function') {
        await window.mergeRemoteData(remoteData);
      }
    }, 1200);
  }

  updateStatus(newStatus) {
    this.status = newStatus;
    this.notifyStatusChange();
  }

  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  notifyStatusChange() {
    this.listeners.forEach(cb => {
      try { cb(this.status, this.conflicts); } catch (e) { console.error(e); }
    });
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.notifySyncStatus === 'function') {
      try { window.electronAPI.notifySyncStatus(this.status); } catch (e) {}
    }
  }

  // --- BUSCAR DADOS COMPLETOS DO SUPABASE PARA O TENANT ---
  async fetchRemoteData(orgId) {
    if (!window.supabaseClient || !this.isOnline || !orgId) return null;

    try {
      const [
        { data: settingsData, error: sErr },
        { data: rafflesData, error: rErr },
        { data: raffleNumbersData, error: rnErr },
        { data: rafflePrizesData, error: rpErr },
        { data: valesData, error: vErr },
        { data: valeTxData, error: vtErr },
        { data: fishingData, error: fErr },
        { data: ranchoData, error: raErr },
        { data: eduardoData, error: eErr }
      ] = await Promise.all([
        window.supabaseClient.from('settings').select('*').eq('organization_id', orgId),
        window.supabaseClient.from('raffles').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
        window.supabaseClient.from('raffle_numbers').select('*').eq('organization_id', orgId).limit(10000),
        window.supabaseClient.from('raffle_prizes').select('*').eq('organization_id', orgId).order('position', { ascending: true }),
        window.supabaseClient.from('vales_prizes').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
        window.supabaseClient.from('vale_transactions').select('*').eq('organization_id', orgId).order('date', { ascending: false }),
        window.supabaseClient.from('fishing_bookings').select('*').eq('organization_id', orgId).order('start_date', { ascending: false }),
        window.supabaseClient.from('rancho_bookings').select('*').eq('organization_id', orgId).order('check_in_date', { ascending: false }),
        window.supabaseClient.from('eduardo_work_days').select('*').eq('organization_id', orgId)
      ]);

      if (sErr || rErr || rnErr || rpErr || vErr || vtErr || fErr || raErr || eErr) {
        console.warn('[SyncEngine] Erro parcial no fetchRemoteData:', { sErr, rErr, rnErr, rpErr, vErr, vtErr, fErr, raErr, eErr });
      }

      // Monta objeto settings
      const settings = {};
      (settingsData || []).forEach(s => {
        try { settings[s.key] = JSON.parse(s.value); } catch (e) { settings[s.key] = s.value; }
      });

      // Reconstrói as rifas com seus números e prêmios aninhados
      const raffles = (rafflesData || []).map(r => {
        const numberMap = new Map();
        (raffleNumbersData || []).forEach(n => {
          if (String(n.raffle_id) === String(r.id)) {
            numberMap.set(parseInt(n.num, 10), n);
          }
        });
        const prizesForThisRaffle = (rafflePrizesData || []).filter(p => String(p.raffle_id) === String(r.id));

        let numbersArray = [];
        const total = r.total_numbers || 60;
        for (let i = 1; i <= total; i++) {
          const found = numberMap.get(i);
          numbersArray.push(found ? {
            num: found.num,
            name: found.name || '',
            status: found.status || 'available',
            reservedAt: found.reserved_at,
            paidAt: found.paid_at
          } : {
            num: i,
            name: '',
            status: 'available',
            reservedAt: null,
            paidAt: null
          });
        }

        const rawRaffle = {
          id: r.id,
          number: r.number,
          title: r.title,
          subtitle: r.subtitle,
          pricePerNumber: parseFloat(r.price_per_number) || 25,
          totalNumbers: total,
          reservationTimeoutHours: r.reservation_timeout_hours || 24,
          pixKey: r.pix_key,
          pixOwner: r.pix_owner,
          shippingNote: r.shipping_note,
          liveDrawNote: r.live_draw_note,
          privateContact: r.private_contact,
          rules: r.rules,
          status: r.status,
          createdAt: r.created_at,
          prizes: prizesForThisRaffle.map(p => ({
            position: p.position,
            description: p.description,
            winnerNumber: p.winner_number,
            winnerName: p.winner_name
          })),
          numbers: numbersArray
        };

        return (typeof normalizeRaffle === 'function') ? normalizeRaffle(rawRaffle) : rawRaffle;
      });

      // Vales & Prêmios com suas transações
      const valesAndPrizes = (valesData || []).map(v => {
        const txs = (valeTxData || []).filter(t => t.vale_id === v.id).map(t => ({
          id: t.id,
          date: t.date,
          item: t.item,
          amount: parseFloat(t.amount) || 0,
          remainingBalance: parseFloat(t.remaining_balance) || 0,
          registeredBy: t.registered_by
        }));

        return {
          id: v.id,
          customerName: v.customer_name,
          customerPhone: v.customer_phone,
          type: v.type,
          raffleRef: v.raffle_ref,
          dateWon: v.date_won,
          initialAmount: parseFloat(v.initial_amount) || 0,
          currentBalance: parseFloat(v.current_balance) || 0,
          description: v.description,
          status: v.status,
          deliveredAt: v.delivered_at,
          notes: v.notes,
          exchangedItem: v.exchanged_item,
          differencePaid: parseFloat(v.difference_paid) || 0,
          exchangeNotes: v.exchange_notes,
          exchangedAt: v.exchanged_at,
          transactions: txs
        };
      });

      // Fishing Bookings
      const fishingBookings = (fishingData || []).map(f => ({
        id: f.id,
        clientName: f.client_name,
        clientPhone: f.client_phone,
        bookingType: f.booking_type,
        raffleRef: f.raffle_ref,
        prizeId: f.prize_id,
        startDate: f.start_date,
        endDate: f.end_date,
        dates: f.dates,
        totalDays: f.total_days,
        raffleDays: f.raffle_days,
        extraDays: f.extra_days,
        packageName: f.package_name,
        structureType: f.structure_type,
        fishermenCount: f.fishermen_count,
        boatsCount: f.boats_count,
        kayaksCount: f.kayaks_count,
        customStructure: f.custom_structure,
        totalAmount: parseFloat(f.total_amount) || 0,
        depositAmount: parseFloat(f.deposit_amount) || 0,
        remainingAmount: parseFloat(f.remaining_amount) || 0,
        paymentStatus: f.payment_status,
        paymentMethod: f.payment_method,
        notes: f.notes,
        guideName: f.guide_name,
        status: f.status,
        createdAt: f.created_at
      }));

      // Rancho Bookings
      const ranchoBookings = (ranchoData || []).map(r => ({
        id: r.id,
        clientName: r.client_name,
        clientPhone: r.client_phone,
        checkInDate: r.check_in_date,
        checkOutDate: r.check_out_date,
        totalDays: r.total_days,
        guestsCount: r.guests_count,
        totalAmount: parseFloat(r.total_amount) || 0,
        depositAmount: parseFloat(r.deposit_amount) || 0,
        remainingAmount: parseFloat(r.remaining_amount) || 0,
        paymentStatus: r.payment_status,
        paymentMethod: r.payment_method,
        notes: r.notes,
        status: r.status,
        createdAt: r.created_at
      }));

      // Eduardo Work Days
      const eduardoWorkDays = (eduardoData || []).map(d => ({
        date: d.date,
        type: d.type,
        hoursWeight: parseFloat(d.hours_weight) || 1.0,
        amountDue: parseFloat(d.amount_due) || 0,
        notes: d.notes
      }));

      return {
        settings: Object.keys(settings).length > 0 ? settings : null,
        raffles: raffles.length > 0 ? raffles : null,
        valesAndPrizes: valesAndPrizes.length > 0 ? valesAndPrizes : null,
        fishingBookings: fishingBookings.length > 0 ? fishingBookings : null,
        ranchoBookings: ranchoBookings.length > 0 ? ranchoBookings : null,
        eduardoWorkDays: eduardoWorkDays.length > 0 ? eduardoWorkDays : null
      };
    } catch (err) {
      console.warn('[SyncEngine] Erro ao buscar dados do Supabase:', err);
      return null;
    }
  }

  // --- PROCESSAR FILA OUTBOX ---
  async processQueue() {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.isOnline = true;
    }

    // Se já estiver em processamento, marca necessidade de novo ciclo e aguarda promessa ativa
    if (this.isSyncing) {
      this._needsRecheck = true;
      return this._activeQueuePromise || Promise.resolve();
    }

    if (!this.isOnline || !window.supabaseClient) {
      return Promise.resolve();
    }

    this._activeQueuePromise = (async () => {
      this.isSyncing = true;
      const orgId = (window.authManager && window.authManager.getOrganizationId()) || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');

      if (!orgId) {
        this.isSyncing = false;
        return;
      }

      try {
        const pendingOps = await window.localDB.getPendingOperations(orgId);

        if (pendingOps.length === 0) {
          this.updateStatus(this.conflicts.length > 0 ? 'conflict' : 'synced');
          return;
        }

        this.updateStatus('syncing');

        for (const op of pendingOps) {
          // Se a operação já está marcada como conflito não resolvido, pula para o próximo item
          if (op.status === 'conflict') {
            continue;
          }

          // Backoff exponencial para retentativas de falha
          if (op.retryCount > 0 && op.lastAttempt) {
            const delay = Math.min(1000 * Math.pow(2, Math.min(op.retryCount, 6)), 60000);
            if (Date.now() - op.lastAttempt < delay) {
              continue;
            }
          }

          try {
            await window.localDB.updateOperationStatus(op.id, 'syncing');
            op.lastAttempt = Date.now();

            const result = await this.executeOperation(op);

            if (result === true || (result && result.success)) {
              await window.localDB.removeOperation(op.id);
              // Remove de eventuais conflitos resolvidos
              this.conflicts = this.conflicts.filter(c => c.opId !== op.id);
            } else if (result && result.conflict) {
              // Conflito registrado — mantém na fila para decisão do operador
              console.warn('[SyncEngine] Conflito retornado pelo servidor:', result);
            }
          } catch (err) {
            console.error(`[SyncEngine] Falha ao sincronizar operação ${op.id} (${op.type}):`, err);
            await window.localDB.updateOperationStatus(op.id, 'failed', err.message || 'Erro de rede');
          }
        }

        const remaining = await window.localDB.getPendingOperations(orgId);
        const hasConflicts = remaining.some(o => o.status === 'conflict');
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          this.isOnline = false;
          this.updateStatus('offline');
        } else if (hasConflicts) {
          this.updateStatus('conflict');
        } else {
          this.updateStatus('synced');
          // Sincronização concluída com sucesso: atualiza estado remoto suavemente
          this.scheduleDebouncedRemoteRefresh();
        }
      } finally {
        this.isSyncing = false;
        this._activeQueuePromise = null;
        if (this._needsRecheck) {
          this._needsRecheck = false;
          setTimeout(() => this.processQueue(), 250);
        }
      }
    })();

    return this._activeQueuePromise;
  }

  async executeOperation(op) {
    const orgId = op.orgId || (window.authManager && window.authManager.getOrganizationId()) || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');
    if (!orgId) {
      throw new Error(`[SyncEngine] Operação ${op.id} (${op.type}) bloqueada: ausência de organization_id.`);
    }

    switch (op.type) {
      // 1. Venda de Cotas (Atômica Anti-Conflito com Suporte a Override Administrativo)
      case 'SELL_NUMBERS': {
        const { raffleId, numbers, status, buyerName, reservedAt, paidAt, allowOverride } = op.payload;
        const shouldOverride = (allowOverride !== undefined) ? !!allowOverride : true;
        const { data, error } = await window.supabaseClient.rpc('sell_raffle_numbers_atomic', {
          p_org_id: orgId,
          p_raffle_id: raffleId,
          p_numbers: numbers,
          p_status: status,
          p_buyer_name: (status === 'available') ? '' : (buyerName || ''),
          p_reserved_at: (status === 'available') ? null : (reservedAt || null),
          p_paid_at: (status === 'available') ? null : (paidAt || null),
          p_allow_override: shouldOverride
        });

        if (error) throw error;

        if (data && data.conflict) {
          console.warn('[SyncEngine] Conflito detectado na venda de cotas:', data);
          await window.localDB.updateOperationStatus(op.id, 'conflict', data.message);
          
          const conflictEntry = {
            opId: op.id,
            type: 'RAFFLE_NUMBERS_CONFLICT',
            raffleId,
            conflictingNumbers: data.conflict_numbers || [],
            buyerName,
            attemptedNumbers: numbers,
            timestamp: op.timestamp
          };

          this.conflicts = this.conflicts.filter(c => c.opId !== op.id);
          this.conflicts.push(conflictEntry);

          // Atualiza o estado da cota localmente para refletir o estado real do servidor
          if (Array.isArray(data.conflict_numbers) && window.appData && Array.isArray(window.appData.raffles)) {
            const raffle = window.appData.raffles.find(r => r.id === raffleId);
            if (raffle && Array.isArray(raffle.numbers)) {
              data.conflict_numbers.forEach(c => {
                const item = raffle.numbers.find(n => n.num === c.num);
                if (item) {
                  item.status = c.status;
                  item.name = c.current_owner || '';
                }
              });
              if (window.renderRaffleNumbersGrid) window.renderRaffleNumbersGrid();
            }
          }

          return { success: false, conflict: true, data };
        }

        if (data && data.success === false) {
          throw new Error(data.error || data.message || 'Falha ao processar venda de cotas na RPC');
        }

        return true;
      }

      // 2. Venda / Atualização de Cotas em Lote (ex: Importação do WhatsApp)
      case 'BATCH_SET_NUMBERS': {
        const { raffleId, numbersList } = op.payload; // array de { num, name, status, reservedAt, paidAt }
        if (!Array.isArray(numbersList) || numbersList.length === 0) return true;

        const rows = numbersList.map(n => ({
          organization_id: orgId,
          raffle_id: raffleId,
          num: parseInt(n.num, 10) || n.num,
          name: (n.status === 'available') ? '' : (n.name || ''),
          status: n.status || 'available',
          reserved_at: (n.status === 'available') ? null : (n.reservedAt || (n.status === 'reserved' ? new Date().toISOString() : null)),
          paid_at: (n.status === 'paid') ? (n.paidAt || new Date().toISOString()) : null
        }));

        const { error } = await window.supabaseClient
          .from('raffle_numbers')
          .upsert(rows, { onConflict: 'organization_id,raffle_id,num' });

        if (error) throw error;
        return true;
      }

      // 3. Criar ou Atualizar Rifa
      case 'CREATE_RAFFLE':
      case 'UPDATE_RAFFLE': {
        const r = typeof normalizeRaffle === 'function' ? normalizeRaffle(op.payload) : op.payload;
        const { error: rError } = await window.supabaseClient.from('raffles').upsert({
          organization_id: orgId,
          id: r.id,
          number: String(r.number || ''),
          title: r.title,
          subtitle: r.subtitle || '',
          price_per_number: parseFloat(r.pricePerNumber) || 0,
          total_numbers: parseInt(r.totalNumbers, 10) || 60,
          reservation_timeout_hours: parseInt(r.reservationTimeoutHours, 10) || 24,
          pix_key: r.pixKey || '',
          pix_owner: r.pixOwner || '',
          shipping_note: r.shippingNote || '',
          live_draw_note: r.liveDrawNote || '',
          private_contact: r.privateContact || '',
          rules: r.rules || '',
          status: r.status || 'active'
        }, { onConflict: 'organization_id,id' });
        if (rError) throw rError;

        // Sincronização estrita e bidirecional de prêmios (raffle_prizes)
        if (Array.isArray(r.prizes)) {
          if (r.prizes.length > 0) {
            const prizeRecords = r.prizes.map((p, idx) => ({
              organization_id: orgId,
              raffle_id: r.id,
              position: p.position || (idx + 1),
              description: p.description || `${idx + 1}º Prêmio`,
              winner_number: p.winnerNumber || null,
              winner_name: p.winnerName || ''
            }));
            const { error: pError } = await window.supabaseClient
              .from('raffle_prizes')
              .upsert(prizeRecords, { onConflict: 'organization_id,raffle_id,position' });
            if (pError) throw pError;

            // Remove prêmios obsoletos que foram excluídos na edição (ex: rifa passou de 3 para 2 prêmios)
            const keepPositions = r.prizes.map((p, idx) => p.position || (idx + 1));
            const { error: dError } = await window.supabaseClient
              .from('raffle_prizes')
              .delete()
              .eq('organization_id', orgId)
              .eq('raffle_id', r.id)
              .not('position', 'in', `(${keepPositions.join(',')})`);
            if (dError) throw dError;
          } else {
            // Rifa sem prêmios (ex: criada sem prêmio ou todos os prêmios foram removidos)
            const { error: dError } = await window.supabaseClient
              .from('raffle_prizes')
              .delete()
              .eq('organization_id', orgId)
              .eq('raffle_id', r.id);
            if (dError) throw dError;
          }
        }

        // Persiste as cotas 1 a N na criação ou atualização
        if (Array.isArray(r.numbers) && r.numbers.length > 0) {
          const numbersRows = r.numbers.map(n => ({
            organization_id: orgId,
            raffle_id: r.id,
            num: parseInt(n.num, 10) || n.num,
            name: (n.status === 'available') ? '' : (n.name || ''),
            status: n.status || 'available',
            reserved_at: (n.status === 'available') ? null : (n.reservedAt || (n.status === 'reserved' ? new Date().toISOString() : null)),
            paid_at: (n.status === 'paid') ? (n.paidAt || new Date().toISOString()) : null
          }));
          const { error: nError } = await window.supabaseClient
            .from('raffle_numbers')
            .upsert(numbersRows, { onConflict: 'organization_id,raffle_id,num' });
          if (nError) throw nError;
        }
        return true;
      }

      // 4. Excluir Rifa
      case 'DELETE_RAFFLE': {
        const { id } = op.payload;
        const { error } = await window.supabaseClient
          .from('raffles')
          .delete()
          .match({ organization_id: orgId, id: id });
        if (error) throw error;
        return true;
      }

      // 5. Criar / Atualizar Vale ou Prêmio
      case 'UPDATE_VALE':
      case 'CREATE_VALE': {
        const v = op.payload;
        const { error } = await window.supabaseClient.from('vales_prizes').upsert({
          organization_id: orgId,
          id: v.id,
          customer_name: v.customerName,
          customer_phone: v.customerPhone,
          type: v.type,
          raffle_ref: v.raffleRef,
          date_won: v.dateWon,
          initial_amount: v.initialAmount,
          current_balance: v.currentBalance,
          description: v.description,
          status: v.status,
          delivered_at: v.deliveredAt,
          notes: v.notes,
          exchanged_item: v.exchangedItem,
          difference_paid: v.differencePaid,
          exchange_notes: v.exchangeNotes,
          exchanged_at: v.exchangedAt
        });
        if (error) throw error;
        return true;
      }

      // 6. Excluir Vale
      case 'DELETE_VALE': {
        const { id } = op.payload;
        const { error } = await window.supabaseClient
          .from('vales_prizes')
          .delete()
          .match({ organization_id: orgId, id: id });
        if (error) throw error;
        return true;
      }

      // 7. Adicionar Transação de Vale
      case 'ADD_VALE_TRANSACTION': {
        const tx = op.payload;
        const { error } = await window.supabaseClient.from('vale_transactions').upsert({
          organization_id: orgId,
          id: tx.id,
          vale_id: tx.valeId,
          date: tx.date,
          item: tx.item,
          amount: tx.amount,
          remaining_balance: tx.remainingBalance,
          registered_by: tx.registeredBy
        });
        if (error) throw error;
        return true;
      }

      // 8. Criar / Atualizar Agendamento de Pesca
      case 'BOOK_FISHING':
      case 'UPDATE_FISHING': {
        const f = op.payload;
        const { error } = await window.supabaseClient.from('fishing_bookings').upsert({
          organization_id: orgId,
          id: f.id,
          client_name: f.clientName,
          client_phone: f.clientPhone,
          booking_type: f.bookingType,
          raffle_ref: f.raffleRef,
          prize_id: f.prizeId,
          start_date: f.startDate,
          end_date: f.endDate,
          dates: f.dates,
          total_days: f.totalDays,
          raffle_days: f.raffleDays,
          extra_days: f.extraDays,
          package_name: f.packageName,
          structure_type: f.structureType,
          fishermen_count: f.fishermenCount,
          boats_count: f.boatsCount,
          kayaks_count: f.kayaksCount,
          custom_structure: f.customStructure,
          total_amount: f.totalAmount,
          deposit_amount: f.depositAmount,
          remaining_amount: f.remainingAmount,
          payment_status: f.paymentStatus,
          payment_method: f.paymentMethod,
          notes: f.notes,
          guide_name: f.guideName,
          status: f.status
        });
        if (error) throw error;
        return true;
      }

      // 9. Excluir Agendamento de Pesca
      case 'DELETE_FISHING_BOOKING': {
        const { id } = op.payload;
        const { error } = await window.supabaseClient
          .from('fishing_bookings')
          .delete()
          .match({ organization_id: orgId, id: id });
        if (error) throw error;
        return true;
      }

      // 10. Criar / Atualizar Locação do Rancho
      case 'BOOK_RANCHO':
      case 'UPDATE_RANCHO': {
        const r = op.payload;
        const { error } = await window.supabaseClient.from('rancho_bookings').upsert({
          organization_id: orgId,
          id: r.id,
          client_name: r.clientName,
          client_phone: r.clientPhone,
          check_in_date: r.checkInDate,
          check_out_date: r.checkOutDate,
          total_days: r.totalDays,
          guests_count: r.guestsCount,
          total_amount: r.totalAmount,
          deposit_amount: r.depositAmount,
          remaining_amount: r.remainingAmount,
          payment_status: r.paymentStatus,
          payment_method: r.paymentMethod,
          notes: r.notes,
          status: r.status
        });
        if (error) throw error;
        return true;
      }

      // 11. Excluir Locação do Rancho
      case 'DELETE_RANCHO_BOOKING': {
        const { id } = op.payload;
        const { error } = await window.supabaseClient
          .from('rancho_bookings')
          .delete()
          .match({ organization_id: orgId, id: id });
        if (error) throw error;
        return true;
      }

      // 12. Ponto do Eduardo (Definir Dia)
      case 'SET_EDUARDO_DAY': {
        const d = op.payload;
        if (d.type === 'off') {
          await window.supabaseClient.from('eduardo_work_days')
            .delete()
            .match({ organization_id: orgId, date: d.date });
        } else {
          const { error } = await window.supabaseClient.from('eduardo_work_days').upsert({
            organization_id: orgId,
            date: d.date,
            type: d.type,
            hours_weight: d.hoursWeight,
            amount_due: d.amountDue,
            notes: d.notes
          });
          if (error) throw error;
        }
        return true;
      }

      // 13. Excluir Ponto do Eduardo
      case 'DELETE_EDUARDO_DAY': {
        const { date } = op.payload;
        const { error } = await window.supabaseClient
          .from('eduardo_work_days')
          .delete()
          .match({ organization_id: orgId, date: date });
        if (error) throw error;
        return true;
      }

      // 14. Atualizar Configurações Globais da Organização
      case 'UPDATE_SETTINGS': {
        const { key, value } = op.payload;
        const valStr = typeof value === 'string' ? value : JSON.stringify(value);
        const { error } = await window.supabaseClient.from('settings').upsert({
          organization_id: orgId,
          key: key,
          value: valStr
        });
        if (error) throw error;
        return true;
      }

      default:
        // NUNCA descartar silenciosamente operações desconhecidas!
        console.error('[SyncEngine] Tipo de operação desconhecido:', op.type);
        throw new Error(`Operação não suportada pelo motor de sincronização: ${op.type}`);
    }
  }

  // Resolução de Conflitos pelo Usuário na Central de Sincronização
  async resolveConflict(opId, action = 'accept_server') {
    const orgId = window.authManager ? window.authManager.getOrganizationId() : null;
    if (!orgId) return;

    if (action === 'accept_server' || action === 'dismiss') {
      await window.localDB.removeOperation(opId);
      this.conflicts = this.conflicts.filter(c => c.opId !== opId);
      // Recarrega os dados remotos para sincronizar a interface
      if (window.initAppState) {
        await window.initAppState();
        if (window.renderAll) window.renderAll();
      }
      this.updateStatus(this.conflicts.length > 0 ? 'conflict' : 'synced');
    } else if (action === 'force_override') {
      const op = await window.localDB.get('sync_queue', opId);
      if (op && op.payload) {
        op.payload.allowOverride = true;
        op.status = 'pending';
        op.retryCount = 0;
        await window.localDB.put('sync_queue', op);
        this.processQueue();
      }
    }
  }
}

window.syncEngine = new SyncEngine();

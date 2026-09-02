-- ==============================================================================
-- ELDORADO PESCA & LAKE - SUPABASE CONSOLIDATED SCHEMA & MIGRATIONS (v2.2)
-- Execute este script no "SQL Editor" do painel Supabase (https://supabase.com)
-- Totalmente seguro e idempotente (NÃO destrói dados existentes)
-- ==============================================================================

-- Habilita extensão pgcrypto / uuid
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABELAS DE MULTI-TENANCY, ORGANIZAÇÕES E MEMBROS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, user_id)
);

-- Tabela de Convites de Funcionários para a Organização
CREATE TABLE IF NOT EXISTS public.organization_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member', -- 'admin', 'member'
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + interval '7 days'),
    used_at TIMESTAMP WITH TIME ZONE
);

-- Função auxiliar para listar as organizações às quais o usuário autenticado pertence
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

-- Trigger para vincular novo usuário à organização ao se cadastrar
CREATE OR REPLACE FUNCTION public.handle_new_user_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    new_org_id UUID;
    org_name TEXT;
    org_slug TEXT;
    invite_token TEXT;
    invite_rec RECORD;
BEGIN
    invite_token := NEW.raw_user_meta_data->>'invite_token';

    -- Se tiver token de convite válido, vincula o usuário à organização correspondente
    IF invite_token IS NOT NULL AND invite_token <> '' THEN
        SELECT * INTO invite_rec FROM public.organization_invites
        WHERE token = invite_token
          AND used_at IS NULL
          AND expires_at > now()
        LIMIT 1;

        IF FOUND THEN
            INSERT INTO public.organization_members (organization_id, user_id, role)
            VALUES (invite_rec.organization_id, NEW.id, invite_rec.role)
            ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

            UPDATE public.organization_invites
            SET used_at = now()
            WHERE id = invite_rec.id;

            RETURN NEW;
        END IF;
    END IF;

    -- Caso contrário, cria uma nova organização padrão para o usuário como owner
    org_name := COALESCE(NEW.raw_user_meta_data->>'organization_name', 'Empresa ' || SUBSTRING(NEW.email FROM '^[^@]+'));
    org_slug := 'org-' || SUBSTRING(NEW.id::text FROM 1 FOR 8) || '-' || (EXTRACT(EPOCH FROM now())::BIGINT);

    INSERT INTO public.organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org_id, NEW.id, 'owner');

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_organization();

-- RPC para aceitar convite após login
CREATE OR REPLACE FUNCTION public.join_organization_via_invite(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_invite RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado', 'code', 'UNAUTHORIZED');
    END IF;

    SELECT * INTO v_invite FROM public.organization_invites
    WHERE token = p_token AND used_at IS NULL AND expires_at > now()
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Convite inválido ou expirado', 'code', 'INVALID_INVITE');
    END IF;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_invite.organization_id, v_user_id, v_invite.role)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    UPDATE public.organization_invites
    SET used_at = now()
    WHERE id = v_invite.id;

    RETURN jsonb_build_object('success', true, 'organization_id', v_invite.organization_id);
END;
$$;

-- ==============================================================================
-- 2. TABELAS DE DADOS DO SISTEMA (VINCULADAS À ORGANIZAÇÃO)
-- ==============================================================================

-- 2.1 Configurações Globais da Organização (settings)
CREATE TABLE IF NOT EXISTS public.settings (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (organization_id, key)
);

-- 2.2 Tabela de Rifas / Ações (raffles)
CREATE TABLE IF NOT EXISTS public.raffles (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    number TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    price_per_number NUMERIC(10, 2) DEFAULT 0,
    total_numbers INTEGER NOT NULL,
    reservation_timeout_hours INTEGER DEFAULT 24,
    pix_key TEXT,
    pix_owner TEXT,
    shipping_note TEXT,
    live_draw_note TEXT,
    private_contact TEXT,
    rules TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (organization_id, id)
);

-- 2.3 Números das Rifas (raffle_numbers) com Versionamento Otimista
CREATE TABLE IF NOT EXISTS public.raffle_numbers (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    raffle_id TEXT NOT NULL,
    num INTEGER NOT NULL,
    name TEXT DEFAULT '',
    status TEXT DEFAULT 'available', -- 'available', 'reserved', 'paid'
    reserved_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    version INTEGER DEFAULT 1,
    PRIMARY KEY (organization_id, raffle_id, num),
    FOREIGN KEY (organization_id, raffle_id) REFERENCES public.raffles(organization_id, id) ON DELETE CASCADE
);

-- 2.4 Prêmios Definidos por Rifa (raffle_prizes) com Constraint Única Anti-Duplicação
CREATE TABLE IF NOT EXISTS public.raffle_prizes (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    raffle_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    description TEXT NOT NULL,
    winner_number INTEGER,
    winner_name TEXT,
    UNIQUE(organization_id, raffle_id, position),
    FOREIGN KEY (organization_id, raffle_id) REFERENCES public.raffles(organization_id, id) ON DELETE CASCADE
);

-- 2.5 Vales e Prêmios / Haver / Trocas (vales_prizes)
CREATE TABLE IF NOT EXISTS public.vales_prizes (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    type TEXT NOT NULL, -- 'dual_choice', 'vale_compras', 'premio_fisico'
    raffle_ref TEXT,
    date_won DATE DEFAULT CURRENT_DATE,
    initial_amount NUMERIC(10, 2) DEFAULT 0,
    current_balance NUMERIC(10, 2) DEFAULT 0,
    description TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending_choice', 'pending_schedule', 'scheduled', 'active', 'pending_pickup', 'delivered', 'completed'
    delivered_at DATE,
    notes TEXT,
    exchanged_item TEXT,
    difference_paid NUMERIC(10, 2) DEFAULT 0,
    exchange_notes TEXT,
    exchanged_at DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (organization_id, id)
);

-- 2.6 Transações e Baixas de Vales-Compras (vale_transactions)
CREATE TABLE IF NOT EXISTS public.vale_transactions (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    vale_id TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    item TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    remaining_balance NUMERIC(10, 2) NOT NULL,
    registered_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (organization_id, id),
    FOREIGN KEY (organization_id, vale_id) REFERENCES public.vales_prizes(organization_id, id) ON DELETE CASCADE
);

-- 2.7 Agenda de Pescaria - Eldorado Lake (fishing_bookings)
CREATE TABLE IF NOT EXISTS public.fishing_bookings (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    booking_type TEXT DEFAULT 'direct', -- 'direct', 'raffle_prize'
    raffle_ref TEXT,
    prize_id TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    dates JSONB,
    total_days INTEGER DEFAULT 1,
    raffle_days INTEGER DEFAULT 1,
    extra_days INTEGER DEFAULT 0,
    package_name TEXT,
    structure_type TEXT DEFAULT 'dupla',
    fishermen_count INTEGER DEFAULT 2,
    boats_count INTEGER DEFAULT 1,
    kayaks_count INTEGER DEFAULT 0,
    custom_structure TEXT,
    total_amount NUMERIC(10, 2) DEFAULT 0,
    deposit_amount NUMERIC(10, 2) DEFAULT 0,
    remaining_amount NUMERIC(10, 2) DEFAULT 0,
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'deposit_paid', 'paid', 'raffle_covered'
    payment_method TEXT DEFAULT 'Pix',
    notes TEXT,
    guide_name TEXT DEFAULT 'Thiago Witeck',
    status TEXT DEFAULT 'scheduled', -- 'scheduled', 'completed', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (organization_id, id)
);

-- 2.8 Locações do Rancho Eldorado (rancho_bookings)
CREATE TABLE IF NOT EXISTS public.rancho_bookings (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    total_days INTEGER DEFAULT 1,
    guests_count INTEGER DEFAULT 2,
    total_amount NUMERIC(10, 2) DEFAULT 0,
    deposit_amount NUMERIC(10, 2) DEFAULT 0,
    remaining_amount NUMERIC(10, 2) DEFAULT 0,
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'deposit_paid', 'paid'
    payment_method TEXT DEFAULT 'Pix',
    notes TEXT,
    status TEXT DEFAULT 'scheduled', -- 'scheduled', 'completed', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (organization_id, id)
);

-- 2.9 Folha e Ponto do Eduardo (eduardo_work_days)
CREATE TABLE IF NOT EXISTS public.eduardo_work_days (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type TEXT NOT NULL, -- 'full', 'half', 'off'
    hours_weight NUMERIC(4, 2) DEFAULT 1.0,
    amount_due NUMERIC(10, 2) DEFAULT 0,
    notes TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (organization_id, date)
);

-- ==============================================================================
-- 3. ÍNDICES PARA ALTA PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_members_user_org ON public.organization_members(user_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_invites_org ON public.organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS idx_raffles_org_status ON public.raffles(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_raffle_numbers_org_raffle ON public.raffle_numbers(organization_id, raffle_id, num);
CREATE INDEX IF NOT EXISTS idx_vales_org_status ON public.vales_prizes(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_fishing_org_date ON public.fishing_bookings(organization_id, start_date);
CREATE INDEX IF NOT EXISTS idx_rancho_org_checkin ON public.rancho_bookings(organization_id, check_in_date);

-- ==============================================================================
-- 4. OPERAÇÃO ATÔMICA ANTI-CONFLITO DE COTAS COM ISOLAMENTO ESTRITO (RPC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.sell_raffle_numbers_atomic(
    p_org_id UUID,
    p_raffle_id TEXT,
    p_numbers INT[],
    p_status TEXT, -- 'available', 'reserved', 'paid'
    p_buyer_name TEXT,
    p_reserved_at TIMESTAMPTZ DEFAULT NULL,
    p_paid_at TIMESTAMPTZ DEFAULT NULL,
    p_allow_override BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    conflict_rec RECORD;
    conflicts JSONB := '[]'::JSONB;
    target_num INT;
    res_time TIMESTAMPTZ := COALESCE(p_reserved_at, now());
    pay_time TIMESTAMPTZ := COALESCE(p_paid_at, now());
BEGIN
    -- 1. Exige permissão estrita na organização
    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = p_org_id AND user_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acesso negado à organização',
            'code', 'PERMISSION_DENIED'
        );
    END IF;

    -- 2. Se não for liberação ('available') e nem substituição forçada, checar conflitos com bloqueio de linha
    IF p_status <> 'available' AND NOT p_allow_override THEN
        FOR conflict_rec IN
            SELECT num, status, name FROM public.raffle_numbers
            WHERE organization_id = p_org_id
              AND raffle_id = p_raffle_id
              AND num = ANY(p_numbers)
              AND (
                  (p_status = 'reserved' AND status IN ('reserved', 'paid') AND name <> p_buyer_name)
                  OR (p_status = 'paid' AND status = 'paid' AND name <> p_buyer_name)
              )
            FOR UPDATE
        LOOP
            conflicts := conflicts || jsonb_build_object(
                'num', conflict_rec.num,
                'status', conflict_rec.status,
                'current_owner', conflict_rec.name
            );
        END LOOP;

        IF jsonb_array_length(conflicts) > 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'conflict', true,
                'code', 'CONFLICT_ALREADY_SOLD',
                'conflict_numbers', conflicts,
                'message', 'Algumas cotas já foram vendidas ou reservadas no servidor'
            );
        END IF;
    END IF;

    -- 3. Atualiza ou insere as cotas atomicamente
    FOREACH target_num IN ARRAY p_numbers
    LOOP
        INSERT INTO public.raffle_numbers (
            organization_id, raffle_id, num, name, status,
            reserved_at, paid_at, version
        ) VALUES (
            p_org_id, p_raffle_id, target_num,
            CASE WHEN p_status = 'available' THEN '' ELSE p_buyer_name END,
            p_status,
            CASE WHEN p_status = 'reserved' THEN res_time WHEN p_status = 'paid' THEN COALESCE(res_time, pay_time) ELSE NULL END,
            CASE WHEN p_status = 'paid' THEN pay_time ELSE NULL END,
            1
        )
        ON CONFLICT (organization_id, raffle_id, num) DO UPDATE SET
            name = CASE WHEN p_status = 'available' THEN '' ELSE p_buyer_name END,
            status = p_status,
            reserved_at = CASE 
                WHEN p_status = 'reserved' THEN res_time 
                WHEN p_status = 'paid' THEN COALESCE(public.raffle_numbers.reserved_at, res_time, pay_time) 
                ELSE NULL 
            END,
            paid_at = CASE WHEN p_status = 'paid' THEN pay_time ELSE NULL END,
            version = public.raffle_numbers.version + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', array_length(p_numbers, 1)
    );
END;
$$;

-- ==============================================================================
-- 5. POLÍTICAS DE ACESSO (Row Level Security - RLS)
-- ==============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vales_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fishing_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rancho_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eduardo_work_days ENABLE ROW LEVEL SECURITY;

-- 5.1 Organizations
DROP POLICY IF EXISTS "Membros veem sua organização" ON public.organizations;
CREATE POLICY "Membros veem sua organização" ON public.organizations
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND id IN (SELECT public.get_user_organizations())
    );

DROP POLICY IF EXISTS "Owners e Admins atualizam organização" ON public.organizations;
CREATE POLICY "Owners e Admins atualizam organização" ON public.organizations
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- 5.2 Organization Members
DROP POLICY IF EXISTS "Membros veem seus colegas de organização" ON public.organization_members;
CREATE POLICY "Membros veem seus colegas de organização" ON public.organization_members
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations())
    );

DROP POLICY IF EXISTS "Owners gerenciam membros" ON public.organization_members;
CREATE POLICY "Owners gerenciam membros" ON public.organization_members
    FOR ALL USING (
        auth.uid() IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.uid() IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- 5.3 Organization Invites
DROP POLICY IF EXISTS "Membros veem convites da sua organização" ON public.organization_invites;
CREATE POLICY "Membros veem convites da sua organização" ON public.organization_invites
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations())
    );

DROP POLICY IF EXISTS "Owners gerenciam convites" ON public.organization_invites;
CREATE POLICY "Owners gerenciam convites" ON public.organization_invites
    FOR ALL USING (
        auth.uid() IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        auth.uid() IS NOT NULL AND organization_id IN (
            SELECT organization_id FROM public.organization_members 
            WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- 5.4 Settings
DROP POLICY IF EXISTS "RLS Settings" ON public.settings;
CREATE POLICY "RLS Settings" ON public.settings
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- 5.5 Raffles
DROP POLICY IF EXISTS "RLS Raffles" ON public.raffles;
CREATE POLICY "RLS Raffles" ON public.raffles
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- 5.6 Raffle Numbers
DROP POLICY IF EXISTS "RLS Raffle Numbers" ON public.raffle_numbers;
CREATE POLICY "RLS Raffle Numbers" ON public.raffle_numbers
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- 5.7 Raffle Prizes
DROP POLICY IF EXISTS "RLS Raffle Prizes" ON public.raffle_prizes;
CREATE POLICY "RLS Raffle Prizes" ON public.raffle_prizes
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- 5.8 Vales & Prêmios
DROP POLICY IF EXISTS "RLS Vales" ON public.vales_prizes;
CREATE POLICY "RLS Vales" ON public.vales_prizes
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- 5.9 Transações de Vales
DROP POLICY IF EXISTS "RLS Vale Transactions" ON public.vale_transactions;
CREATE POLICY "RLS Vale Transactions" ON public.vale_transactions
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- 5.10 Agenda Pescaria
DROP POLICY IF EXISTS "RLS Fishing" ON public.fishing_bookings;
CREATE POLICY "RLS Fishing" ON public.fishing_bookings
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- 5.11 Rancho
DROP POLICY IF EXISTS "RLS Rancho" ON public.rancho_bookings;
CREATE POLICY "RLS Rancho" ON public.rancho_bookings
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- 5.12 Ponto Eduardo
DROP POLICY IF EXISTS "RLS Eduardo" ON public.eduardo_work_days;
CREATE POLICY "RLS Eduardo" ON public.eduardo_work_days
    FOR ALL USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()))
    WITH CHECK (auth.uid() IS NOT NULL AND organization_id IN (SELECT public.get_user_organizations()));

-- ==============================================================================
-- 6. ATIVAR REALTIME DO SUPABASE
-- ==============================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.raffles;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.raffle_numbers;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vales_prizes;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fishing_bookings;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rancho_bookings;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.eduardo_work_days;
  EXCEPTION WHEN OTHERS THEN
    -- Publicação já continha as tabelas
    NULL;
  END;
END $$;

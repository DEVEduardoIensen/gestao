/**
 * Eldorado Pesca & Lake - Supabase Auth & Multi-Tenant Manager (v2.2)
 * Gerencia autenticação de usuários, persistência de sessão, tokens, isolamento estrito e operação 100% offline.
 */

class AuthManager {
  constructor() {
    this.client = null;
    this.session = null;
    this.user = null;
    this.organizations = [];
    this.currentOrg = null;
    this.listeners = [];
    this.isPasswordRecovery = false;
    this.init();
  }

  init() {
    if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.USE_SUPABASE) {
      console.log('[AuthManager] Supabase desativado nas configurações locais.');
      return;
    }

    const { createClient } = window.supabase || (typeof supabase !== 'undefined' ? supabase : {});
    if (typeof createClient === 'function') {
      this.client = createClient(SUPABASE_CONFIG.SUPABASE_URL, SUPABASE_CONFIG.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      });
      window.supabaseClient = this.client;

      // Escuta mudanças de sessão e recuperação de senha
      this.client.auth.onAuthStateChange(async (event, session) => {
        console.log('[AuthManager] Evento Auth:', event);
        this.session = session;
        this.user = session ? session.user : null;

        if (event === 'PASSWORD_RECOVERY') {
          this.isPasswordRecovery = true;
        }

        if (this.user) {
          await this.loadUserOrganizations();
        } else {
          this.currentOrg = null;
          this.organizations = [];
          localStorage.removeItem('ELDORADO_ACTIVE_ORG_ID');
          localStorage.removeItem('ELDORADO_CACHED_ORGS');
        }

        this.notifyListeners(event, session);
      });
    }
  }

  async checkInitialSession() {
    if (!this.client) return null;
    try {
      const { data: { session }, error } = await this.client.auth.getSession();
      if (error) throw error;
      this.session = session;
      this.user = session ? session.user : null;

      // Verifica se a URL contém hash de recuperação
      if (window.location.hash && window.location.hash.includes('type=recovery')) {
        this.isPasswordRecovery = true;
      }

      if (this.user) {
        await this.loadUserOrganizations();
      } else {
        this.currentOrg = null;
        this.organizations = [];
      }
      return this.session;
    } catch (e) {
      console.warn('[AuthManager] Falha ao recuperar sessão inicial via rede. Tentando cache offline:', e);
      // Fallback offline se já existe usuário ou sessão local
      if (this.user) {
        this.restoreCachedOrganizations();
      }
      return this.session;
    }
  }

  restoreCachedOrganizations() {
    try {
      const cachedOrgsStr = localStorage.getItem('ELDORADO_CACHED_ORGS');
      if (cachedOrgsStr) {
        const cachedOrgs = JSON.parse(cachedOrgsStr);
        if (Array.isArray(cachedOrgs) && cachedOrgs.length > 0) {
          this.organizations = cachedOrgs;
          const savedOrgId = localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');
          this.currentOrg = this.organizations.find(o => o.id === savedOrgId) || this.organizations[0];
          console.log('[AuthManager] Organização recuperada do cache offline com sucesso:', this.currentOrg.name);
          return true;
        }
      }
    } catch (err) {
      console.warn('[AuthManager] Erro ao restaurar cache offline de organização:', err);
    }
    return false;
  }

  async loadUserOrganizations() {
    if (!this.client || !this.user) {
      this.currentOrg = null;
      this.organizations = [];
      return;
    }

    try {
      const { data, error } = await this.client
        .from('organization_members')
        .select(`
          organization_id,
          role,
          organizations:organization_id (id, name, slug)
        `)
        .eq('user_id', this.user.id);

      if (error) {
        console.warn('[AuthManager] Erro ao carregar organizações remotas. Tentando cache:', error);
        if (this.restoreCachedOrganizations()) return;
        return;
      }

      if (Array.isArray(data) && data.length > 0) {
        this.organizations = data.map(item => ({
          id: item.organizations?.id || item.organization_id,
          name: item.organizations?.name || 'Minha Organização',
          slug: item.organizations?.slug || 'org',
          role: item.role
        }));

        const savedOrgId = localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');
        const match = this.organizations.find(o => o.id === savedOrgId) || this.organizations[0];
        this.currentOrg = match;
        
        // Persiste cache para abertura offline no celular
        localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', this.currentOrg.id);
        localStorage.setItem('ELDORADO_CACHED_ORGS', JSON.stringify(this.organizations));
      } else {
        // Se usuário autenticado mas tabela remota vazia, tenta cache antes de zerar
        if (!this.restoreCachedOrganizations()) {
          this.organizations = [];
          this.currentOrg = null;
          localStorage.removeItem('ELDORADO_ACTIVE_ORG_ID');
          localStorage.removeItem('ELDORADO_CACHED_ORGS');
        }
      }
    } catch (err) {
      console.warn('[AuthManager] Falha de conexão ao buscar organizações. Acionando cache offline:', err);
      this.restoreCachedOrganizations();
    }
  }

  async login(email, password) {
    if (!this.client) throw new Error('Cliente Supabase não inicializado.');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.session = data.session;
    this.user = data.user;
    await this.loadUserOrganizations();
    return data;
  }

  async register(email, password, organizationName, inviteToken = null) {
    if (!this.client) throw new Error('Cliente Supabase não inicializado.');
    const metaData = {
      organization_name: organizationName || 'Minha Empresa'
    };
    if (inviteToken) {
      metaData.invite_token = inviteToken.trim();
    }

    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: metaData
      }
    });
    if (error) throw error;
    return data;
  }

  async recoverPassword(email) {
    if (!this.client) throw new Error('Cliente Supabase não inicializado.');
    const { data, error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    return data;
  }

  async updatePassword(newPassword) {
    if (!this.client) throw new Error('Cliente Supabase não inicializado.');
    const { data, error } = await this.client.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
    this.isPasswordRecovery = false;
    return data;
  }

  async joinOrganization(inviteToken) {
    if (!this.client) throw new Error('Cliente Supabase não inicializado.');
    const { data, error } = await this.client.rpc('join_organization_via_invite', {
      p_token: inviteToken.trim()
    });
    if (error) throw error;
    if (data && !data.success) {
      throw new Error(data.error || 'Falha ao ingressar na organização.');
    }
    await this.loadUserOrganizations();
    return data;
  }

  async logout() {
    if (this.client) {
      try {
        await this.client.auth.signOut();
      } catch (e) {
        console.warn('[AuthManager] Erro no signOut:', e);
      }
    }
    this.session = null;
    this.user = null;
    this.organizations = [];
    this.currentOrg = null;
    this.isPasswordRecovery = false;
    localStorage.removeItem('ELDORADO_ACTIVE_ORG_ID');
    localStorage.removeItem('ELDORADO_CACHED_ORGS');
  }

  getOrganizationId() {
    return this.currentOrg?.id || null;
  }

  getOrganizationName() {
    return this.currentOrg?.name || '';
  }

  isAuthenticated() {
    return !!(this.user && this.currentOrg && this.currentOrg.id);
  }

  onAuthStateChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }

  notifyListeners(event, session) {
    this.listeners.forEach(cb => {
      try { cb(event, session); } catch (e) { console.error(e); }
    });
  }
}

window.authManager = new AuthManager();

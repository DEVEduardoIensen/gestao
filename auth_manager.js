/**
 * Eldorado Pesca & Lake - Supabase Auth & Multi-Tenant Manager
 * Gerencia autenticação de usuários, persistência de sessão, tokens e organizações.
 */

class AuthManager {
  constructor() {
    this.client = null;
    this.session = null;
    this.user = null;
    this.organizations = [];
    this.currentOrg = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Eldorado Pesca & Lake',
      slug: 'eldorado-pesca-principal'
    };
    this.listeners = [];
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

      // Escuta mudanças de sessão
      this.client.auth.onAuthStateChange(async (event, session) => {
        console.log('[AuthManager] Evento Auth:', event);
        this.session = session;
        this.user = session ? session.user : null;
        if (this.user) {
          await this.loadUserOrganizations();
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
      if (this.user) {
        await this.loadUserOrganizations();
      }
      return this.session;
    } catch (e) {
      console.warn('[AuthManager] Falha ao recuperar sessão inicial:', e);
      return null;
    }
  }

  async loadUserOrganizations() {
    if (!this.client || !this.user) return;
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
        console.warn('[AuthManager] Erro ao carregar organizações:', error);
        return;
      }

      if (Array.isArray(data) && data.length > 0) {
        this.organizations = data.map(item => ({
          id: item.organizations?.id || item.organization_id,
          name: item.organizations?.name || 'Minha Organização',
          slug: item.organizations?.slug || 'org',
          role: item.role
        }));

        // Seleciona a última organização usada salva no localStorage ou a primeira da lista
        const savedOrgId = localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');
        const match = this.organizations.find(o => o.id === savedOrgId) || this.organizations[0];
        this.currentOrg = match;
        localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', this.currentOrg.id);
      }
    } catch (err) {
      console.warn('[AuthManager] Erro ao buscar tenants:', err);
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

  async register(email, password, organizationName) {
    if (!this.client) throw new Error('Cliente Supabase não inicializado.');
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          organization_name: organizationName || 'Minha Empresa'
        }
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

  async logout() {
    if (this.client) {
      await this.client.auth.signOut();
    }
    this.session = null;
    this.user = null;
    this.organizations = [];
    localStorage.removeItem('ELDORADO_ACTIVE_ORG_ID');
  }

  getOrganizationId() {
    return this.currentOrg?.id || '00000000-0000-0000-0000-000000000001';
  }

  getOrganizationName() {
    return this.currentOrg?.name || 'Eldorado Pesca';
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

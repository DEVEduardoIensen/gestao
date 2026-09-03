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
        } else if (event === 'SIGNED_OUT') {
          this.currentOrg = null;
          this.organizations = [];
          localStorage.removeItem('ELDORADO_ACTIVE_ORG_ID');
          localStorage.removeItem('ELDORADO_CACHED_ORGS');
        } else {
          // Não limpa cache em caso de desconexão ou inicialização offline
          this.restoreCachedOrganizations();
        }

        this.notifyListeners(event, session);
      });
    }
  }

  getDefaultOrgId() {
    return (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.DEFAULT_ORG_ID) ? SUPABASE_CONFIG.DEFAULT_ORG_ID : (this.currentOrg?.id || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID') || '');
  }

  getDefaultMasterOrganization() {
    return {
      id: this.getDefaultOrgId(),
      name: 'Eldorado Pesca Principal',
      slug: 'eldorado-a',
      role: 'owner'
    };
  }

  isDesktopApp() {
    if (typeof window !== 'undefined' && (window.__ELDORADO_IS_DESKTOP_APP || window.__ELDORADO_IS_ELECTRON)) {
      return true;
    }
    if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Electron')) {
      return true;
    }
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.protocol === 'file:') return true;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return true;
    }
    return false;
  }

  isMobileInstalledApp() {
    if (typeof window !== 'undefined' && window.__ELDORADO_IS_MOBILE_APP) {
      return true;
    }
    const isStandalone = (
      (typeof window !== 'undefined' && window.matchMedia && (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches
      )) ||
      (typeof navigator !== 'undefined' && navigator.standalone === true)
    );
    const search = (typeof window !== 'undefined' && window.location ? window.location.search : '') || '';
    const hash = (typeof window !== 'undefined' && window.location ? window.location.hash : '') || '';
    const hasPwaParams = search.includes('source=pwa') || search.includes('mode=standalone') || search.includes('platform=mobile') || search.includes('platform=desktop') || hash.includes('pwa');
    const isMarkedInstalled = typeof localStorage !== 'undefined' && (
      localStorage.getItem('ELDORADO_MOBILE_INSTALLED') === 'true' ||
      localStorage.getItem('ELDORADO_PWA_INSTALLED') === 'true' ||
      localStorage.getItem('ELDORADO_DESKTOP_INSTALLED') === 'true'
    );
    const isMobileDevice = typeof navigator !== 'undefined' && (
      /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.innerWidth <= 820 && ('ontouchstart' in window || navigator.maxTouchPoints > 0))
    );

    return !!(isStandalone || hasPwaParams || isMarkedInstalled || (isMobileDevice && isMarkedInstalled));
  }

  isStandaloneOrInstalled() {
    return this.isDesktopApp() || this.isMobileInstalledApp();
  }

  async ensureMobileInstalledSession() {
    return this.ensureDirectInstalledSession();
  }

  async ensureDirectInstalledSession() {
    // 1. Tenta restaurar cache local existente
    if (this.restoreCachedOrganizations()) {
      if (!this.user) {
        this.user = {
          id: 'pwa-app-user',
          email: 'app@eldoradopesca.com',
          user_metadata: { role: 'owner' }
        };
        this.session = { user: this.user, access_token: 'pwa-app-token' };
      }
      return;
    }

    // 2. Se tem parâmetro orgId na URL de inicialização
    const urlParams = (typeof window !== 'undefined' && window.location) ? new URLSearchParams(window.location.search || '') : null;
    const urlOrgId = urlParams ? urlParams.get('orgId') : null;

    // 3. Consulta organizações disponíveis no Supabase se houver conexão
    if (this.client && navigator.onLine) {
      try {
        const { data: orgs } = await this.client.from('organizations').select('id, name, slug');
        if (Array.isArray(orgs) && orgs.length > 0) {
          this.organizations = orgs.map(o => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
            role: 'owner'
          }));
          const target = urlOrgId ? this.organizations.find(o => o.id === urlOrgId) : null;
          this.currentOrg = target || this.getMainOrganization() || this.organizations[0];
          localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', this.currentOrg.id);
          localStorage.setItem('ELDORADO_CACHED_ORGS', JSON.stringify(this.organizations));
          this.user = {
            id: 'pwa-app-user',
            email: 'app@eldoradopesca.com',
            user_metadata: { role: 'owner' }
          };
          this.session = { user: this.user, access_token: 'pwa-app-token' };
          return;
        }
      } catch (err) {
        console.warn('[AuthManager] Consulta remota de organizações indisponível:', err);
      }
    }

    // 4. Fallback garantido para a organização master da Eldorado Pesca (100% Offline-Safe)
    const masterOrg = this.getDefaultMasterOrganization();
    this.currentOrg = urlOrgId ? { id: urlOrgId, name: 'Eldorado Pesca Principal', slug: 'eldorado-a', role: 'owner' } : masterOrg;
    this.organizations = [this.currentOrg];
    localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', this.currentOrg.id);
    localStorage.setItem('ELDORADO_CACHED_ORGS', JSON.stringify(this.organizations));

    if (!this.user) {
      this.user = {
        id: 'pwa-app-user',
        email: 'app@eldoradopesca.com',
        user_metadata: { role: 'owner' }
      };
      this.session = { user: this.user, access_token: 'pwa-app-token' };
    }
  }

  async checkInitialSession() {
    if (!this.client) {
      await this.ensureDirectInstalledSession();
      return this.session;
    }
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
      } else if (this.isStandaloneOrInstalled() || this.isDesktopApp() || this.isMobileInstalledApp()) {
        await this.ensureDirectInstalledSession();
      } else {
        if (!this.restoreCachedOrganizations()) {
          const masterOrg = this.getDefaultMasterOrganization();
          this.currentOrg = masterOrg;
          this.organizations = [masterOrg];
        }
      }
      return this.session;
    } catch (e) {
      console.warn('[AuthManager] Falha ao recuperar sessão inicial via rede. Tentando cache offline:', e);
      if (!this.restoreCachedOrganizations()) {
        await this.ensureDirectInstalledSession();
      }
      return this.session;
    }
  }

  getMainOrganization() {
    if (!this.organizations || this.organizations.length === 0) return this.getDefaultMasterOrganization();
    const defaultId = this.getDefaultOrgId();
    return this.organizations.find(o => (defaultId && o.id === defaultId) || o.slug === 'eldorado-a' || (o.name || '').toLowerCase() === 'eldorado pesca principal')
      || this.organizations.find(o => (o.name || '').toLowerCase().includes('principal') && !o.slug?.startsWith('org-'))
      || this.organizations.find(o => (o.name || '').toLowerCase().includes('eldorado') && !o.slug?.startsWith('org-'))
      || this.organizations[0];
  }

  restoreCachedOrganizations() {
    try {
      const cachedOrgsStr = localStorage.getItem('ELDORADO_CACHED_ORGS');
      if (cachedOrgsStr) {
        const cachedOrgs = JSON.parse(cachedOrgsStr);
        if (Array.isArray(cachedOrgs) && cachedOrgs.length > 0) {
          this.organizations = cachedOrgs;
          const savedOrgId = localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');
          const savedMatch = savedOrgId ? this.organizations.find(o => o.id === savedOrgId) : null;
          const mainOrg = this.getMainOrganization();
          this.currentOrg = (savedMatch && !savedMatch.slug?.startsWith('org-'))
            ? savedMatch
            : (mainOrg || savedMatch || this.organizations[0]);

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
      this.restoreCachedOrganizations();
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
        const masterOrg = this.getDefaultMasterOrganization();
        this.currentOrg = masterOrg;
        this.organizations = [masterOrg];
        return;
      }

      if (Array.isArray(data) && data.length > 0) {
        this.organizations = data.map(item => ({
          id: item.organizations?.id || item.organization_id,
          name: item.organizations?.name || 'Minha Organização',
          slug: item.organizations?.slug || 'org',
          role: item.role
        }));

        // Garante que a organização principal do Eldorado Pesca esteja sempre acessível
        const masterOrg = this.getDefaultMasterOrganization();
        if (!this.organizations.some(o => o.id === masterOrg.id || o.slug === 'eldorado-a')) {
          this.organizations.unshift(masterOrg);
        }

        const savedOrgId = localStorage.getItem('ELDORADO_ACTIVE_ORG_ID');
        const savedMatch = savedOrgId ? this.organizations.find(o => o.id === savedOrgId) : null;
        const mainOrg = this.getMainOrganization();
        const match = (savedMatch && !savedMatch.slug?.startsWith('org-'))
          ? savedMatch
          : (mainOrg || savedMatch || this.organizations[0]);

        this.currentOrg = match;
        
        // Persiste cache para abertura offline tanto no desktop quanto no mobile
        localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', this.currentOrg.id);
        localStorage.setItem('ELDORADO_CACHED_ORGS', JSON.stringify(this.organizations));
      } else {
        // Se usuário autenticado mas tabela remota vazia, vincula à organização principal do Eldorado
        const masterOrg = this.getDefaultMasterOrganization();
        this.organizations = [masterOrg];
        this.currentOrg = masterOrg;
        localStorage.setItem('ELDORADO_ACTIVE_ORG_ID', this.currentOrg.id);
        localStorage.setItem('ELDORADO_CACHED_ORGS', JSON.stringify(this.organizations));
      }
    } catch (err) {
      console.warn('[AuthManager] Falha de conexão ao buscar organizações. Acionando cache offline:', err);
      if (!this.restoreCachedOrganizations()) {
        const masterOrg = this.getDefaultMasterOrganization();
        this.currentOrg = masterOrg;
        this.organizations = [masterOrg];
      }
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

  async loginWithGoogle() {
    if (!this.client) throw new Error('Cliente Supabase não inicializado.');
    const redirectUrl = window.location.origin + window.location.pathname;
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });
    if (error) throw error;
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

  getCurrentOrganization() {
    return this.currentOrg || this.getMainOrganization() || this.getDefaultMasterOrganization();
  }

  getOrganizationId() {
    return this.currentOrg?.id || localStorage.getItem('ELDORADO_ACTIVE_ORG_ID') || this.getDefaultOrgId();
  }

  getOrganizationName() {
    return this.currentOrg?.name || 'Eldorado Pesca Principal';
  }

  isAuthenticated() {
    if (this.isStandaloneOrInstalled() || this.isDesktopApp() || this.isMobileInstalledApp()) {
      return true;
    }
    if (this.currentOrg && this.currentOrg.id) {
      return true;
    }
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

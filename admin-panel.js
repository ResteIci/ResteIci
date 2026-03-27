// ═══════════════════════════════════════════════════════════════
// Admin Panel — ResteIci  ✅ VERSION CORRIGÉE COMPLÈTE v4
// Fix : sidebar mobile, overlay, navigation, toast, clock
// ═══════════════════════════════════════════════════════════════

let currentAdminPage = 'stats';

const _csrfToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

const _rateLimits = {};
function _rateLimit(key, maxPerMin = 30) {
  const now = Date.now();
  if (!_rateLimits[key]) _rateLimits[key] = [];
  _rateLimits[key] = _rateLimits[key].filter(t => now - t < 60000);
  if (_rateLimits[key].length >= maxPerMin) return false;
  _rateLimits[key].push(now);
  return true;
}

const _adminLog = [];
function _logAction(action, detail = '') {
  _adminLog.unshift({
    action, detail,
    ts: new Date().toISOString(),
    admin: (typeof currentUser !== 'undefined' && currentUser?.email) || '?'
  });
  if (_adminLog.length > 200) _adminLog.pop();
}

let _chartJsLoaded = false;
function _loadChartJs() {
  return new Promise(resolve => {
    if (_chartJsLoaded || window.Chart) { _chartJsLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = () => { _chartJsLoaded = true; resolve(); };
    document.head.appendChild(s);
  });
}

// ── Helper escapeHtml sécurisé (si pas déjà défini globalement) ──
function _esc(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Helper formatTime (si pas déjà défini globalement) ──
function _fmt(dateStr) {
  if (typeof formatTime === 'function') return formatTime(dateStr);
  if (!dateStr) return '?';
  return new Date(dateStr).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── Toast global ──
// ✅ Fix : cherche d'abord le toast admin dans le shell, puis le toast global de app.js,
//          crée un toast flottant en dernier recours — fonctionne dans tous les contextes.
function showToast(msg, type = '') {
  // 1. Toast dans le shell admin (priorité)
  let toast = document.getElementById('admin-toast');
  if (toast) {
    toast.textContent = msg;
    toast.className = 'admin-toast admin-toast-show admin-toast-' + type;
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.className = 'admin-toast'; }, 3200);
    return;
  }
  // 2. Toast global de app.js
  const globalToast = document.getElementById('toast');
  if (globalToast) {
    globalToast.textContent = msg;
    globalToast.className = 'toast show toast-' + type;
    globalToast.style.display = 'block';
    clearTimeout(globalToast._t);
    globalToast._t = setTimeout(() => {
      globalToast.className = 'toast';
      globalToast.style.display = 'none';
    }, 3000);
    return;
  }
  // 3. Création d'un toast temporaire (fallback)
  const tmp = document.createElement('div');
  tmp.textContent = msg;
  tmp.style.cssText = `
    position:fixed;bottom:22px;right:22px;z-index:9999;
    padding:11px 16px;border-radius:9px;font-size:.83rem;font-weight:600;
    background:#14171f;border:1px solid rgba(255,255,255,.15);
    color:${type === 'error' ? '#e07878' : type === 'success' ? '#72c98a' : '#eceaf5'};
    box-shadow:0 8px 32px rgba(0,0,0,.5);pointer-events:none;
    animation:adminToastIn .28s cubic-bezier(.4,0,.2,1);
  `;
  document.body.appendChild(tmp);
  setTimeout(() => tmp.remove(), 3200);
}

// ═══════════════════════════════════════════════════════════════
class AdminPanel {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.isAdmin = false;
    this.isSuperAdmin = false;
    this.profile = null;
    this._charts = {};
    this._searchTimeout = null;
    this._clockInterval = null;
  }

  async checkAdminStatus(userId) {
    if (!this.sb || !userId) return false;
    try {
      const { data: profile, error } = await this.sb
        .from('profiles')
        .select('admin_role, banned, display_name, email')
        .eq('id', userId)
        .single();
      if (error || !profile) { this.isAdmin = false; return false; }
      this.profile = profile;
      const role = String(profile.admin_role || '').trim().toLowerCase().replace(/^['"]|['"]$/g, '');
      this.isAdmin      = (role === 'admin' || role === 'moderator') && !profile.banned;
      this.isSuperAdmin = role === 'admin' && !profile.banned;
      return this.isAdmin;
    } catch(e) {
      console.error('Admin check error:', e);
      this.isAdmin = false;
      return false;
    }
  }

  async renderAdminDashboard() {
    const cu = (typeof currentUser !== 'undefined') ? currentUser : null;
    if (!cu) {
      if (typeof requireAuth === 'function') return requireAuth(() => this.renderAdminDashboard());
      return;
    }
    const ok = await this.checkAdminStatus(cu.id);
    if (!ok) return this.showDeniedAccess();

    _logAction('Accès dashboard');

    // ✅ Fix : mémoriser la page active avant d'entrer dans l'admin
    const activePage = document.querySelector('[id^="page-"]:not(.hidden)');
    this._previousPage = activePage?.id || 'page-home';

    // Cacher les pages principales
    document.querySelectorAll('[id^="page-"]').forEach(el => el.classList.add('hidden'));
    const navTabs = document.getElementById('nav-tabs');
    if (navTabs) navTabs.style.display = 'none';

    let shell = document.getElementById('admin-shell');
    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'admin-shell';
      document.body.appendChild(shell);
    }
    shell.style.display = 'block';
    shell.innerHTML = this._shellHTML();

    // Fermer sidebar au clic sur l'overlay
    const overlay = document.getElementById('admin-sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => this.closeSidebar());
    }

    this._startClock();
    this._loadReportsBadge();
    this.navigateTo('stats');
  }

  _shellHTML() {
    const name = _esc(this.profile?.display_name || (typeof currentUser !== 'undefined' ? currentUser?.email?.split('@')[0] : 'Admin') || 'Admin');
    const role = this.isSuperAdmin ? '🔐 Super Admin' : '🛡️ Modérateur';
    const roleClass = this.isSuperAdmin ? 'role-superadmin' : 'role-mod';

    return `
    <div class="admin-layout">

      <!-- OVERLAY MOBILE -->
      <div class="admin-sidebar-overlay" id="admin-sidebar-overlay"></div>

      <!-- SIDEBAR -->
      <aside class="admin-sidebar" id="admin-sidebar">
        <div class="admin-brand">
          <div class="admin-brand-logo">RI</div>
          <div style="min-width:0">
            <div class="admin-brand-title">ResteIci Admin</div>
            <div class="admin-brand-name">${name}</div>
            <span class="admin-role-badge ${roleClass}">${role}</span>
          </div>
          <!-- Bouton fermer sur mobile -->
          <button class="admin-sidebar-close" onclick="adminPanel.closeSidebar()" title="Fermer">✕</button>
        </div>

        <!-- Recherche globale -->
        <div class="admin-search-wrap">
          <input class="admin-search-input" id="admin-global-search"
            placeholder="🔍 Recherche globale…"
            oninput="adminPanel._onSearch(this.value)"
            autocomplete="off">
          <div class="admin-search-results" id="admin-search-results"></div>
        </div>

        <nav class="admin-nav">
          <div class="admin-nav-group">
            <div class="admin-nav-group-label">Tableau de bord</div>
            <button class="admin-nav-item" data-page="stats" onclick="adminPanel.navigateTo('stats');adminPanel.closeSidebar()">
              <span class="nav-icon">📊</span> Statistiques
            </button>
            <button class="admin-nav-item" data-page="analytics" onclick="adminPanel.navigateTo('analytics');adminPanel.closeSidebar()">
              <span class="nav-icon">📈</span> Analytiques
            </button>
            <button class="admin-nav-item" data-page="health" onclick="adminPanel.navigateTo('health');adminPanel.closeSidebar()">
              <span class="nav-icon">🏥</span> Santé système
            </button>
          </div>

          <div class="admin-nav-group">
            <div class="admin-nav-group-label">Modération</div>
            <button class="admin-nav-item" data-page="moderation" onclick="adminPanel.navigateTo('moderation');adminPanel.closeSidebar()">
              <span class="nav-icon">⚠️</span> Signalements
              <span class="admin-badge" id="reports-badge" style="display:none">0</span>
            </button>
            <button class="admin-nav-item" data-page="users" onclick="adminPanel.navigateTo('users');adminPanel.closeSidebar()">
              <span class="nav-icon">👥</span> Utilisateurs
            </button>
            <button class="admin-nav-item" data-page="content" onclick="adminPanel.navigateTo('content');adminPanel.closeSidebar()">
              <span class="nav-icon">📝</span> Contenus
            </button>
          </div>

          <div class="admin-nav-group">
            <div class="admin-nav-group-label">Communauté</div>
            <button class="admin-nav-item" data-page="donations" onclick="adminPanel.navigateTo('donations');adminPanel.closeSidebar()">
              <span class="nav-icon">💰</span> Dons & Objectifs
            </button>
            <button class="admin-nav-item" data-page="announcements" onclick="adminPanel.navigateTo('announcements');adminPanel.closeSidebar()">
              <span class="nav-icon">📣</span> Annonces
            </button>
          </div>

          ${this.isSuperAdmin ? `
          <div class="admin-nav-group">
            <div class="admin-nav-group-label">Super Admin</div>
            <button class="admin-nav-item" data-page="activity" onclick="adminPanel.navigateTo('activity');adminPanel.closeSidebar()">
              <span class="nav-icon">📋</span> Journal activité
            </button>
            <button class="admin-nav-item" data-page="tools" onclick="adminPanel.navigateTo('tools');adminPanel.closeSidebar()">
              <span class="nav-icon">🛠️</span> Outils avancés
            </button>
          </div>` : ''}
        </nav>

        <div class="admin-sidebar-footer">
          <div class="admin-quick-actions">
            <button class="admin-quick-btn" title="Rafraîchir" onclick="adminPanel.navigateTo(currentAdminPage)">🔄</button>
            <button class="admin-quick-btn" title="Ouvrir le site" onclick="window.open('/', '_blank')">🌐</button>
          </div>
          <button class="admin-exit-btn" onclick="adminPanel.exitAdmin()">← Retour au site</button>
        </div>
      </aside>

      <!-- BOUTON MOBILE HAMBURGER (fixe en bas à gauche) -->
      <button class="admin-mobile-toggle" id="admin-mobile-toggle"
        onclick="adminPanel.openSidebar()" title="Menu">☰</button>

      <!-- MAIN -->
      <main class="admin-main">
        <div class="admin-topbar">
          <div class="admin-topbar-left">
            <!-- Hamburger dans la topbar pour mobile -->
            <button class="admin-topbar-hamburger" onclick="adminPanel.openSidebar()">☰</button>
            <span class="admin-topbar-page" id="admin-topbar-title">📊 Statistiques</span>
          </div>
          <div class="admin-topbar-right">
            <span class="admin-topbar-time" id="admin-clock"></span>
            <button class="admin-btn-sm" onclick="adminPanel.navigateTo(currentAdminPage)">🔄</button>
          </div>
        </div>
        <div id="admin-page-content" class="admin-page-content-wrap"></div>
      </main>
    </div>

    <!-- Toast admin -->
    <div id="admin-toast" class="admin-toast"></div>
    `;
  }

  // ── Sidebar mobile ─────────────────────────────────────────────
  openSidebar() {
    const sb = document.getElementById('admin-sidebar');
    const ov = document.getElementById('admin-sidebar-overlay');
    if (sb) sb.classList.add('open');
    if (ov) ov.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  closeSidebar() {
    const sb = document.getElementById('admin-sidebar');
    const ov = document.getElementById('admin-sidebar-overlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ── Navigation ─────────────────────────────────────────────────
  navigateTo(page) {
    if (!_rateLimit('nav', 30)) return;
    currentAdminPage = page;
    _logAction('Navigation', page);

    document.querySelectorAll('.admin-nav-item').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.page === page)
    );

    const titles = {
      stats:         '📊 Statistiques',
      analytics:     '📈 Analytiques',
      health:        '🏥 Santé système',
      moderation:    '⚠️ Signalements',
      users:         '👥 Utilisateurs',
      content:       '📝 Contenus',
      donations:     '💰 Dons & Objectifs',
      announcements: '📣 Annonces',
      activity:      '📋 Journal d\'activité',
      tools:         '🛠️ Outils avancés',
    };
    const titleEl = document.getElementById('admin-topbar-title');
    if (titleEl) titleEl.textContent = titles[page] || page;

    const content = document.getElementById('admin-page-content');
    if (!content) return;

    // Scroll en haut sur mobile
    const main = document.querySelector('.admin-main');
    if (main) main.scrollTop = 0;

    // Destroy charts
    Object.values(this._charts).forEach(c => { try { c.destroy(); } catch {} });
    this._charts = {};

    switch (page) {
      case 'stats':         this.renderStats(content); break;
      case 'analytics':     this.renderAnalytics(content); break;
      case 'health':        this.renderHealth(content); break;
      case 'moderation':
        if (typeof adminModeration !== 'undefined') adminModeration.render(content);
        else content.innerHTML = '<div class="admin-page"><div class="admin-error">❌ Module admin-moderation.js manquant.</div></div>';
        break;
      case 'users':
        if (typeof adminUsers !== 'undefined') adminUsers.render(content);
        else content.innerHTML = '<div class="admin-page"><div class="admin-error">❌ Module admin-users.js manquant.</div></div>';
        break;
      case 'content':       this.renderContent(content); break;
      case 'donations':
        if (typeof adminDonations !== 'undefined') adminDonations.render(content);
        else content.innerHTML = '<div class="admin-page"><div class="admin-error">❌ Module admin-donations.js manquant.</div></div>';
        break;
      case 'announcements': this.renderAnnouncements(content); break;
      case 'activity':      this.renderActivity(content); break;
      case 'tools':         this.renderTools(content); break;
      default:              content.innerHTML = '<div class="admin-page"><div class="admin-empty">Page inconnue.</div></div>';
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 📊 STATISTIQUES
  // ══════════════════════════════════════════════════════════════
  async renderStats(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📊 Statistiques</h1>
          <span class="admin-last-update" id="stats-updated">—</span>
        </div>

        <div class="stats-grid" id="kpi-grid">
          ${['👥','📝','🚩','🚫','❤️','💰','💬','🌟'].map((icon, i) => `
            <div class="stat-tile loading" id="st-${i}">
              <div class="st-icon">${icon}</div>
              <div class="st-val">…</div>
              <div class="st-label">Chargement</div>
            </div>
          `).join('')}
        </div>

        <div class="admin-two-col">
          <div class="admin-section">
            <div class="admin-section-header">
              <h3>📝 Posts récents</h3>
              <button class="admin-btn-sm" onclick="adminPanel.navigateTo('content')">Voir tout →</button>
            </div>
            <div id="recent-posts-list"><div class="admin-loading">Chargement…</div></div>
          </div>
          <div class="admin-section">
            <div class="admin-section-header">
              <h3>💰 Objectif de dons</h3>
              <button class="admin-btn-sm" onclick="adminPanel.navigateTo('donations')">Gérer →</button>
            </div>
            <div id="stats-goal-widget"><div class="admin-loading">Chargement…</div></div>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-header"><h3>🌟 Top membres (ancienneté)</h3></div>
          <div id="top-members-list"><div class="admin-loading">Chargement…</div></div>
        </div>
      </div>
    `;

    try {
      const [usersR, postsR, reportsR, bannedR, reactionsR, repliesR, donationsR, blockedR] = await Promise.all([
        this.sb.from('profiles').select('*', { count: 'exact', head: true }),
        this.sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', true),
        this.sb.from('reports').select('*', { count: 'exact', head: true }).eq('resolved', false),
        this.sb.from('profiles').select('*', { count: 'exact', head: true }).eq('banned', true),
        this.sb.from('reactions').select('*', { count: 'exact', head: true }),
        this.sb.from('replies').select('*', { count: 'exact', head: true }),
        this.sb.from('subgoals').select('current_amount, target_amount').order('created_at', { ascending: true }).limit(1).maybeSingle(),
        this.sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', false),
      ]);

      const kpis = [
        { id: 'st-0', val: usersR.count ?? '?',  label: 'Utilisateurs' },
        { id: 'st-1', val: postsR.count ?? '?',  label: 'Posts publiés' },
        { id: 'st-2', val: reportsR.count ?? '?',label: 'Signalements' },
        { id: 'st-3', val: bannedR.count ?? '?', label: 'Bannis' },
        { id: 'st-4', val: reactionsR.count ?? '?', label: 'Réactions' },
        { id: 'st-5', val: donationsR.data ? `${parseFloat(donationsR.data.current_amount || 0).toFixed(0)} €` : '?', label: 'Dons reçus' },
        { id: 'st-6', val: repliesR.count ?? '?',label: 'Réponses' },
        { id: 'st-7', val: blockedR.count ?? '?',label: 'En attente' },
      ];

      kpis.forEach(({ id, val, label }) => {
        const tile = document.getElementById(id);
        if (!tile) return;
        tile.classList.remove('loading');
        tile.querySelector('.st-val').textContent = val;
        tile.querySelector('.st-label').textContent = label;
      });

      const updEl = document.getElementById('stats-updated');
      if (updEl) updEl.textContent = 'Mis à jour ' + new Date().toLocaleTimeString('fr-FR');

      // Badge signalements nav
      const badge = document.getElementById('reports-badge');
      if (badge && (reportsR.count || 0) > 0) {
        badge.textContent = reportsR.count;
        badge.style.display = 'inline-flex';
      }

      // Posts récents
      const { data: recentPosts } = await this.sb
        .from('posts')
        .select('id, content, type, created_at, profiles(display_name)')
        .order('created_at', { ascending: false })
        .limit(8);

      const listEl = document.getElementById('recent-posts-list');
      if (listEl) {
        listEl.innerHTML = (recentPosts || []).length
          ? (recentPosts || []).map(p => `
            <div class="recent-post-item">
              <span class="rp-type type-${p.type}">${p.type}</span>
              <span class="rp-author">${_esc(p.profiles?.display_name || 'Anonyme')}</span>
              <span class="rp-content">${_esc((p.content || '').substring(0, 60))}…</span>
              <span class="rp-time">${_fmt(p.created_at)}</span>
              <button class="admin-btn-icon" onclick="adminPanel._quickDeletePost('${p.id}')" title="Supprimer">🗑️</button>
            </div>
          `).join('')
          : '<p class="admin-empty">Aucun post récent.</p>';
      }

      // Mini objectif
      const goalEl = document.getElementById('stats-goal-widget');
      if (goalEl && donationsR.data) {
        const g = donationsR.data;
        const pct = Math.min(100, Math.round(((g.current_amount || 0) / (g.target_amount || 1)) * 100));
        goalEl.innerHTML = `
          <div class="mini-goal-widget">
            <div class="mini-goal-amounts">
              <span class="mini-goal-current">${parseFloat(g.current_amount || 0).toFixed(2)} €</span>
              <span class="mini-goal-sep">/ ${g.target_amount || 0} €</span>
            </div>
            <div class="mini-goal-bar"><div class="mini-goal-fill" style="width:${pct}%"></div></div>
            <div class="mini-goal-pct">${pct}% de l'objectif atteint</div>
          </div>
        `;
      } else if (goalEl) {
        goalEl.innerHTML = '<p class="admin-empty">Aucun objectif configuré.</p>';
      }

      // Top membres
      const { data: topMembers } = await this.sb
        .from('profiles')
        .select('id, display_name, created_at')
        .eq('banned', false)
        .order('created_at', { ascending: true })
        .limit(5);

      const topEl = document.getElementById('top-members-list');
      if (topEl && topMembers) {
        topEl.innerHTML = `<div class="top-members-grid">
          ${topMembers.map((m, i) => {
            const init = (m.display_name || '?').slice(0, 2).toUpperCase();
            return `
              <div class="top-member-card">
                <div class="top-rank">#${i + 1}</div>
                <div class="top-av">${init}</div>
                <div class="top-name">${_esc(m.display_name || 'Anonyme')}</div>
                <div class="top-date">Depuis ${new Date(m.created_at).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</div>
              </div>`;
          }).join('')}
        </div>`;
      }
    } catch (err) {
      console.error('Stats error:', err);
      const grid = container.querySelector('.stats-grid');
      if (grid) grid.innerHTML = `<div class="admin-error" style="grid-column:1/-1">❌ Erreur : ${_esc(err.message)}</div>`;
    }
  }

  async _quickDeletePost(postId) {
    if (!confirm('Supprimer ce post ?')) return;
    await this.sb.from('posts').delete().eq('id', postId);
    _logAction('Post supprimé', postId);
    showToast('🗑️ Post supprimé.', 'success');
    document.querySelectorAll(`[onclick*="${postId}"]`).forEach(el => el.closest('.recent-post-item')?.remove());
  }

  // ══════════════════════════════════════════════════════════════
  // 📈 ANALYTIQUES
  // ══════════════════════════════════════════════════════════════
  async renderAnalytics(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📈 Analytiques</h1>
          <select class="admin-select" id="analytics-period" onchange="adminPanel._reloadAnalytics()">
            <option value="7">7 derniers jours</option>
            <option value="30" selected>30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
        </div>

        <div class="analytics-grid">
          <div class="chart-card">
            <div class="chart-card-header"><h3>📝 Publications par jour</h3></div>
            <canvas id="chart-posts"></canvas>
          </div>
          <div class="chart-card">
            <div class="chart-card-header"><h3>👥 Inscriptions par jour</h3></div>
            <canvas id="chart-users"></canvas>
          </div>
          <div class="chart-card">
            <div class="chart-card-header"><h3>🏷️ Répartition par type</h3></div>
            <canvas id="chart-types"></canvas>
          </div>
          <div class="chart-card">
            <div class="chart-card-header"><h3>🚩 Signalements par jour</h3></div>
            <canvas id="chart-reports"></canvas>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-header"><h3>⏰ Activité par heure</h3></div>
          <canvas id="chart-hours" style="max-height:180px"></canvas>
        </div>
      </div>
    `;

    await _loadChartJs();
    await this._drawAnalytics();
  }

  async _reloadAnalytics() {
    Object.values(this._charts).forEach(c => { try { c.destroy(); } catch {} });
    this._charts = {};
    await this._drawAnalytics();
  }

  async _drawAnalytics() {
    const period = parseInt(document.getElementById('analytics-period')?.value || 30);
    const since = new Date(Date.now() - period * 86400000).toISOString();

    try {
      const [postsR, usersR, reportsR] = await Promise.all([
        this.sb.from('posts').select('created_at, type').gte('created_at', since),
        this.sb.from('profiles').select('created_at').gte('created_at', since),
        this.sb.from('reports').select('created_at').gte('created_at', since),
      ]);

      const posts   = postsR.data || [];
      const users   = usersR.data || [];
      const reports = reportsR.data || [];

      const days = Array.from({ length: period }, (_, i) => {
        const d = new Date(Date.now() - (period - 1 - i) * 86400000);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      });

      const countByDay = (arr) => {
        const map = {};
        arr.forEach(r => {
          const d = new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
          map[d] = (map[d] || 0) + 1;
        });
        return days.map(d => map[d] || 0);
      };

      const gridColor = 'rgba(255,255,255,0.05)';
      const tickColor = '#666';
      const scalesConfig = {
        x: { ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 10 }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor }, beginAtZero: true }
      };

      const makeLineChart = (id, label, data, color) => {
        const ctx = document.getElementById(id);
        if (!ctx) return;
        if (this._charts[id]) { try { this._charts[id].destroy(); } catch {} }
        this._charts[id] = new Chart(ctx, {
          type: 'line',
          data: {
            labels: days,
            datasets: [{
              label,
              data,
              borderColor: color,
              backgroundColor: color.replace('rgb(', 'rgba(').replace(')', ', 0.1)'),
              fill: true,
              tension: 0.4,
              pointRadius: 2,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: scalesConfig,
          }
        });
      };

      makeLineChart('chart-posts',   'Posts',        countByDay(posts),   'rgb(232,149,109)');
      makeLineChart('chart-users',   'Inscriptions', countByDay(users),   'rgb(109,184,232)');
      makeLineChart('chart-reports', 'Signalements', countByDay(reports), 'rgb(232,125,125)');

      // Donut types
      const typeCount = { encouragement: 0, temoignage: 0, question: 0 };
      posts.forEach(p => { if (typeCount[p.type] !== undefined) typeCount[p.type]++; });
      const ctxT = document.getElementById('chart-types');
      if (ctxT) {
        if (this._charts['chart-types']) { try { this._charts['chart-types'].destroy(); } catch {} }
        this._charts['chart-types'] = new Chart(ctxT, {
          type: 'doughnut',
          data: {
            labels: ['💛 Encouragement', '📖 Témoignage', '💬 Question'],
            datasets: [{ data: Object.values(typeCount), backgroundColor: ['rgba(232,149,109,.8)', 'rgba(109,184,232,.8)', 'rgba(184,125,232,.8)'] }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { position: 'right', labels: { color: '#9c99b8', font: { size: 11 } } } }
          }
        });
      }

      // Bar activité par heure
      const hourMap = {};
      posts.forEach(p => { const h = new Date(p.created_at).getHours(); hourMap[h] = (hourMap[h] || 0) + 1; });
      const ctxH = document.getElementById('chart-hours');
      if (ctxH) {
        if (this._charts['chart-hours']) { try { this._charts['chart-hours'].destroy(); } catch {} }
        this._charts['chart-hours'] = new Chart(ctxH, {
          type: 'bar',
          data: {
            labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`),
            datasets: [{ label: 'Posts', data: Array.from({ length: 24 }, (_, i) => hourMap[i] || 0), backgroundColor: 'rgba(184,125,232,.65)', borderRadius: 4 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: tickColor, font: { size: 9 } }, grid: { display: false } },
              y: { ticks: { color: tickColor, font: { size: 9 } }, grid: { color: gridColor }, beginAtZero: true }
            }
          }
        });
      }
    } catch (err) {
      console.error('Analytics error:', err);
      const grid = document.querySelector('.analytics-grid');
      if (grid) grid.innerHTML = `<div class="admin-error" style="grid-column:1/-1">❌ ${_esc(err.message)}</div>`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 🏥 SANTÉ SYSTÈME
  // ══════════════════════════════════════════════════════════════
  async renderHealth(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header"><h1>🏥 Santé système</h1></div>

        <div class="health-grid">
          ${[
            { key: 'latency',   icon: '⚡', label: 'Latence Supabase' },
            { key: 'posts',     icon: '📝', label: 'Table posts' },
            { key: 'profiles',  icon: '👥', label: 'Table profiles' },
            { key: 'reports',   icon: '🚩', label: 'Table reports' },
            { key: 'subgoals',  icon: '💰', label: 'Table subgoals' },
            { key: 'donations', icon: '🎁', label: 'Table donations' },
          ].map(c => `
            <div class="health-card" id="hc-${c.key}">
              <div class="health-icon">${c.icon}</div>
              <div class="health-label">${c.label}</div>
              <div class="health-val" id="hv-${c.key}">…</div>
              <div class="health-status" id="hs-${c.key}">Test…</div>
            </div>
          `).join('')}
        </div>

        <div class="admin-section">
          <div class="admin-section-header"><h3>🔐 Configuration</h3></div>
          <div class="config-info">
            <div class="config-item">
              <span class="config-key">Supabase URL</span>
              <span class="config-val">${_esc(typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL.replace(/https?:\/\//, '').split('.')[0] + '.supabase.co' : '?')}</span>
            </div>
            <div class="config-item">
              <span class="config-key">Anon key</span>
              <span class="config-val">${typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY.slice(0, 12) + '…' : '?'}</span>
            </div>
            <div class="config-item">
              <span class="config-key">Heure locale</span>
              <span class="config-val">${new Date().toLocaleString('fr-FR')}</span>
            </div>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-header"><h3>🛠️ SQL requis (si tables manquantes)</h3></div>
          <button class="admin-btn-sm" onclick="this.nextElementSibling.style.display='block';this.style.display='none'">Afficher le SQL</button>
          <div class="sql-block" style="display:none">
            <button class="admin-btn-sm" style="margin-bottom:8px" onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent).then(()=>showToast('✅ Copié !','success'))">📋 Copier</button>
            <pre>${_esc(this._getRequiredSQL())}</pre>
          </div>
        </div>
      </div>
    `;
    await this._runHealthChecks();
  }

  async _runHealthChecks() {
    // Latence
    const t0 = Date.now();
    try {
      await this.sb.from('profiles').select('id').limit(1);
      const ms = Date.now() - t0;
      this._setHealth('latency', `${ms}ms`, ms < 200 ? 'good' : ms < 600 ? 'warn' : 'bad');
    } catch { this._setHealth('latency', 'Erreur', 'bad'); }

    // Tables
    for (const table of ['posts', 'profiles', 'reports', 'subgoals', 'donations']) {
      try {
        const { count, error } = await this.sb.from(table).select('*', { count: 'exact', head: true });
        if (error) throw error;
        this._setHealth(table, `${count} enregistrements`, 'good');
      } catch {
        this._setHealth(table, '❌ Inaccessible', 'bad');
      }
    }
  }

  _setHealth(key, val, status) {
    const valEl    = document.getElementById(`hv-${key}`);
    const statusEl = document.getElementById(`hs-${key}`);
    const card     = document.getElementById(`hc-${key}`);
    if (valEl) valEl.textContent = val;
    if (statusEl) {
      statusEl.textContent  = status === 'good' ? '✅ OK' : status === 'warn' ? '⚠️ Lent' : '❌ Erreur';
      statusEl.className    = `health-status status-${status}`;
    }
    if (card) card.className = `health-card hcard-${status}`;
  }

  _getRequiredSQL() {
    return `-- Tables nécessaires à ResteIci

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT, email TEXT, banned BOOLEAN DEFAULT false,
  report_count INT DEFAULT 0, admin_role TEXT DEFAULT 'user',
  warned BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  content TEXT NOT NULL, type TEXT DEFAULT 'encouragement',
  anonymous BOOLEAN DEFAULT false, approved BOOLEAN DEFAULT true,
  reaction_total INT DEFAULT 0, reply_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID, content TEXT, anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID, emoji TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  reporter_id UUID, reason TEXT, resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subgoals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Objectif',
  description TEXT, icon TEXT DEFAULT '🎯',
  target_amount NUMERIC(10,2) DEFAULT 100,
  current_amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(10,2) NOT NULL, donor_name TEXT DEFAULT 'Anonyme',
  source TEXT DEFAULT 'manual', status TEXT DEFAULT 'completed',
  note TEXT, paypal_transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, content TEXT, type TEXT DEFAULT 'info',
  active BOOLEAN DEFAULT true, created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_levels (
  user_id UUID PRIMARY KEY, points INT DEFAULT 0,
  current_level TEXT DEFAULT 'newbie', updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (lecture publique)
ALTER TABLE subgoals ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "read_subgoals" ON subgoals FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "read_donations" ON donations FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "read_announcements" ON announcements FOR SELECT USING (true);`;
  }

  // ══════════════════════════════════════════════════════════════
  // 📝 CONTENUS
  // ══════════════════════════════════════════════════════════════
  async renderContent(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📝 Gestion des contenus</h1>
          <div class="admin-header-actions">
            <select class="admin-select" id="content-filter" onchange="adminPanel._loadContentList()">
              <option value="all">Tous les types</option>
              <option value="encouragement">Encouragements</option>
              <option value="temoignage">Témoignages</option>
              <option value="question">Questions</option>
            </select>
            <select class="admin-select" id="content-approved" onchange="adminPanel._loadContentList()">
              <option value="true">Approuvés</option>
              <option value="false">En attente</option>
            </select>
            <button class="admin-btn" onclick="adminPanel._exportCSV()">📤 CSV</button>
          </div>
        </div>
        <div id="content-list"><div class="admin-loading">Chargement…</div></div>
        <div class="admin-pagination" id="content-pagination"></div>
      </div>
    `;
    await this._loadContentList();
  }

  async _loadContentList(page = 0) {
    const container = document.getElementById('content-list');
    if (!container) return;
    const type     = document.getElementById('content-filter')?.value || 'all';
    const approved = document.getElementById('content-approved')?.value !== 'false';

    try {
      let q = this.sb.from('posts')
        .select('id, content, type, created_at, approved, profiles(display_name)', { count: 'exact' })
        .eq('approved', approved)
        .order('created_at', { ascending: false })
        .range(page * 20, page * 20 + 19);
      if (type !== 'all') q = q.eq('type', type);

      const { data: posts, count } = await q;

      container.innerHTML = `
        <div class="content-toolbar">
          <span class="content-count">${count || 0} résultat${count !== 1 ? 's' : ''}</span>
          ${!approved ? `<button class="admin-btn" onclick="adminPanel._approveAll()">✅ Tout approuver</button>` : ''}
          <button class="admin-btn-danger" onclick="adminPanel._purgeOld()">🗑️ Purger &gt; 90j</button>
        </div>
        ${(posts || []).map(p => `
          <div class="content-row" id="crow-${p.id}">
            <span class="rp-type type-${p.type}">${p.type}</span>
            <span class="content-author">${_esc(p.profiles?.display_name || 'Anonyme')}</span>
            <span class="content-text">${_esc((p.content || '').substring(0, 100))}…</span>
            <span class="rp-time">${_fmt(p.created_at)}</span>
            <div class="content-actions">
              ${!p.approved ? `<button class="admin-btn-sm" onclick="adminPanel._approvePost('${p.id}')">✅</button>` : ''}
              <button class="admin-btn-danger" onclick="adminPanel._deleteContent('${p.id}')">🗑️</button>
            </div>
          </div>
        `).join('') || '<div class="admin-empty">Aucun contenu.</div>'}
      `;

      const pag = document.getElementById('content-pagination');
      if (pag && count > 20) {
        const pages = Math.ceil(count / 20);
        pag.innerHTML = Array.from({ length: Math.min(pages, 10) }, (_, i) => `
          <button class="admin-btn-sm ${i === page ? 'active-filter' : ''}" onclick="adminPanel._loadContentList(${i})">${i + 1}</button>
        `).join('');
      }
    } catch (err) {
      container.innerHTML = `<div class="admin-error">❌ ${_esc(err.message)}</div>`;
    }
  }

  async _approvePost(id) {
    await this.sb.from('posts').update({ approved: true }).eq('id', id);
    _logAction('Post approuvé', id);
    document.getElementById(`crow-${id}`)?.remove();
    showToast('✅ Approuvé.', 'success');
  }

  async _deleteContent(id) {
    if (!confirm('Supprimer ce contenu ?')) return;
    await this.sb.from('posts').delete().eq('id', id);
    _logAction('Contenu supprimé', id);
    document.getElementById(`crow-${id}`)?.remove();
    showToast('🗑️ Supprimé.', 'success');
  }

  async _approveAll() {
    if (!confirm('Approuver tous les posts en attente ?')) return;
    await this.sb.from('posts').update({ approved: true }).eq('approved', false);
    _logAction('Tout approuvé');
    showToast('✅ Tous les posts approuvés.', 'success');
    this._loadContentList();
  }

  async _purgeOld() {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    if (!confirm('Supprimer les posts non approuvés de plus de 90 jours ?')) return;
    const { data } = await this.sb.from('posts').delete().eq('approved', false).lt('created_at', cutoff).select('id');
    _logAction('Purge anciens posts');
    showToast(`🗑️ ${data?.length || 0} posts purgés.`, 'success');
    this._loadContentList();
  }

  async _exportCSV() {
    try {
      const { data } = await this.sb.from('posts')
        .select('id, content, type, created_at, approved, profiles(display_name)')
        .order('created_at', { ascending: false })
        .limit(500);
      const rows = [['ID', 'Type', 'Auteur', 'Contenu', 'Approuvé', 'Date']];
      (data || []).forEach(p => {
        rows.push([p.id, p.type, p.profiles?.display_name || 'Anonyme', (p.content || '').replace(/,/g, ';'), p.approved, p.created_at]);
      });
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `resteici-posts-${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      _logAction('Export CSV');
      showToast('📤 Export CSV généré.', 'success');
    } catch (err) { showToast('❌ Erreur export : ' + err.message, 'error'); }
  }

  // ══════════════════════════════════════════════════════════════
  // 📣 ANNONCES
  // ══════════════════════════════════════════════════════════════
  async renderAnnouncements(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📣 Annonces & Bannières</h1>
          <button class="admin-btn" onclick="adminPanel._openAnnouncementModal()">+ Nouvelle</button>
        </div>

        <div class="admin-info-box">
          💡 Les annonces actives s'affichent sur la page d'accueil en bannière. Désactivez-les quand elles ne sont plus d'actualité.
        </div>

        <div id="announcements-list"><div class="admin-loading">Chargement…</div></div>

        <!-- Modal annonce -->
        <div id="ann-modal-overlay" class="up-modal-overlay" onclick="if(event.target===this)document.getElementById('ann-modal-overlay').style.display='none'">
          <div class="up-modal">
            <div class="up-modal-header">
              <span id="ann-modal-title">Nouvelle annonce</span>
              <button onclick="document.getElementById('ann-modal-overlay').style.display='none'">✕</button>
            </div>
            <div class="up-modal-body">
              <div class="form-group-admin">
                <label>Titre</label>
                <input class="admin-input" id="ann-title" placeholder="Ex: Maintenance prévue">
              </div>
              <div class="form-group-admin">
                <label>Contenu</label>
                <textarea class="admin-input" id="ann-content" rows="3" placeholder="Message affiché aux utilisateurs…" style="resize:vertical;min-height:80px"></textarea>
              </div>
              <div class="form-group-admin">
                <label>Type</label>
                <select class="admin-select" id="ann-type" style="width:100%">
                  <option value="info">ℹ️ Info</option>
                  <option value="warning">⚠️ Avertissement</option>
                  <option value="success">✅ Succès</option>
                  <option value="urgent">🆘 Urgent</option>
                </select>
              </div>
              <div class="form-group-admin" style="display:flex;align-items:center;gap:10px">
                <input type="checkbox" id="ann-active" checked>
                <label for="ann-active" style="text-transform:none;letter-spacing:0;font-size:.9rem;margin-bottom:0">Annonce active (visible sur le site)</label>
              </div>
              <input type="hidden" id="ann-edit-id">
              <div style="display:flex;gap:10px;margin-top:16px">
                <button class="admin-btn" onclick="adminPanel._saveAnnouncement()">💾 Sauvegarder</button>
                <button class="admin-btn-sm" onclick="document.getElementById('ann-modal-overlay').style.display='none'">Annuler</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    await this._loadAnnouncements();
  }

  async _loadAnnouncements() {
    const container = document.getElementById('announcements-list');
    if (!container) return;
    try {
      const { data: anns, error } = await this.sb
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      if (!anns || !anns.length) {
        container.innerHTML = '<div class="admin-empty">Aucune annonce. Crée-en une !</div>';
        return;
      }

      const typeClass = { info: 'ann-info', warning: 'ann-warning', success: 'ann-success', urgent: 'ann-urgent' };
      const typeBadge = { info: 'ann-badge-info', warning: 'ann-badge-warning', success: 'ann-badge-success', urgent: 'ann-badge-urgent' };

      // ✅ Fix : on construit le HTML puis on attache les listeners via JS
      //          pour éviter tout problème de guillemets/apostrophes dans les données
      container.innerHTML = anns.map(a => `
        <div class="announcement-card ${typeClass[a.type] || 'ann-info'}" id="ann-${a.id}">
          <div class="ann-header">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
              <span class="ann-type-badge ${typeBadge[a.type] || 'ann-badge-info'}">${a.type || 'info'}</span>
              <span class="ann-title">${_esc(a.title || '')}</span>
            </div>
            <span class="ann-status">${a.active ? '🟢 Active' : '⚫ Inactive'}</span>
          </div>
          <div class="ann-content">${_esc(a.content || '')}</div>
          <div class="ann-actions">
            <button class="admin-btn-sm ann-edit-btn" data-id="${a.id}">✏️ Modifier</button>
            <button class="admin-btn-sm" onclick="adminPanel._toggleAnnouncement('${a.id}', ${!a.active})">${a.active ? '⏸️ Désactiver' : '▶️ Activer'}</button>
            <button class="admin-btn-danger" onclick="adminPanel._deleteAnnouncement('${a.id}')">🗑️</button>
            <span class="rp-time">${_fmt(a.created_at)}</span>
          </div>
        </div>
      `).join('');

      // Attacher les données d'édition via JS (pas via onclick inline)
      anns.forEach(a => {
        const btn = container.querySelector(`.ann-edit-btn[data-id="${a.id}"]`);
        if (btn) btn.addEventListener('click', () => this._openAnnouncementModal(a));
      });
    } catch (err) {
      container.innerHTML = `<div class="admin-error">❌ Table <code>announcements</code> introuvable. Crée-la via Santé système.</div>`;
    }
  }

  _openAnnouncementModal(data = null) {
    document.getElementById('ann-modal-title').textContent = data ? 'Modifier l\'annonce' : 'Nouvelle annonce';
    document.getElementById('ann-title').value   = data?.title || '';
    document.getElementById('ann-content').value = data?.content || '';
    document.getElementById('ann-type').value    = data?.type || 'info';
    document.getElementById('ann-active').checked = data ? data.active : true;
    document.getElementById('ann-edit-id').value = data?.id || '';
    document.getElementById('ann-modal-overlay').style.display = 'flex';
  }

  _editAnnouncement(data) {
    // ✅ Fix : appelé directement avec l'objet JS (plus de string HTML à parser)
    this._openAnnouncementModal(typeof data === 'string' ? JSON.parse(data) : data);
  }

  async _saveAnnouncement() {
    const id      = document.getElementById('ann-edit-id').value;
    const payload = {
      title:   document.getElementById('ann-title').value.trim(),
      content: document.getElementById('ann-content').value.trim(),
      type:    document.getElementById('ann-type').value,
      active:  document.getElementById('ann-active').checked,
    };
    if (!payload.title) { showToast('❌ Titre requis.', 'error'); return; }
    try {
      if (id) {
        await this.sb.from('announcements').update(payload).eq('id', id);
      } else {
        payload.created_at  = new Date().toISOString();
        payload.created_by  = (typeof currentUser !== 'undefined') ? currentUser?.id : null;
        await this.sb.from('announcements').insert(payload);
      }
      _logAction(id ? 'Annonce modifiée' : 'Annonce créée', payload.title);
      document.getElementById('ann-modal-overlay').style.display = 'none';
      showToast('✅ Annonce sauvegardée.', 'success');
      this._loadAnnouncements();
    } catch (err) { showToast('❌ ' + err.message, 'error'); }
  }

  async _toggleAnnouncement(id, active) {
    await this.sb.from('announcements').update({ active }).eq('id', id);
    _logAction('Annonce ' + (active ? 'activée' : 'désactivée'), id);
    showToast(active ? '✅ Annonce activée.' : '⏸️ Annonce désactivée.', 'success');
    this._loadAnnouncements();
  }

  async _deleteAnnouncement(id) {
    if (!confirm('Supprimer cette annonce ?')) return;
    await this.sb.from('announcements').delete().eq('id', id);
    _logAction('Annonce supprimée', id);
    document.getElementById(`ann-${id}`)?.remove();
    showToast('🗑️ Annonce supprimée.', 'success');
  }

  // ══════════════════════════════════════════════════════════════
  // 📋 JOURNAL D'ACTIVITÉ
  // ══════════════════════════════════════════════════════════════
  renderActivity(container) {
    if (!this.isSuperAdmin) {
      container.innerHTML = '<div class="admin-page"><div class="admin-error">⛔ Réservé aux super-admins.</div></div>';
      return;
    }
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📋 Journal d'activité</h1>
          <button class="admin-btn-sm" onclick="adminPanel.renderActivity(document.getElementById('admin-page-content'))">🔄</button>
        </div>
        <div class="admin-info-box">📍 Journal de la session en cours (non persisté en BDD).</div>
        <div class="activity-log">
          ${_adminLog.length === 0
            ? '<div class="admin-empty">Aucune action dans cette session.</div>'
            : _adminLog.map(entry => `
              <div class="activity-item">
                <span class="activity-time">${new Date(entry.ts).toLocaleTimeString('fr-FR')}</span>
                <span class="activity-action">${_esc(entry.action)}</span>
                ${entry.detail ? `<span class="activity-detail">${_esc(String(entry.detail).substring(0, 60))}</span>` : ''}
                <span class="activity-admin">${_esc(entry.admin)}</span>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // 🛠️ OUTILS AVANCÉS
  // ══════════════════════════════════════════════════════════════
  renderTools(container) {
    if (!this.isSuperAdmin) {
      container.innerHTML = '<div class="admin-page"><div class="admin-error">⛔ Réservé aux super-admins.</div></div>';
      return;
    }
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header"><h1>🛠️ Outils avancés</h1></div>

        <div class="tools-grid">
          <div class="tool-card">
            <div class="tool-icon">🧹</div>
            <h3>Nettoyer les orphelins</h3>
            <p>Supprime les réponses et réactions dont le post parent n'existe plus.</p>
            <button class="admin-btn" onclick="adminPanel._cleanOrphans()">Lancer</button>
          </div>
          <div class="tool-card">
            <div class="tool-icon">📊</div>
            <h3>Recalculer les compteurs</h3>
            <p>Recalcule reaction_total et reply_count pour tous les posts.</p>
            <button class="admin-btn" onclick="adminPanel._recalcCounters()">Recalculer</button>
          </div>
          <div class="tool-card">
            <div class="tool-icon">🚫</div>
            <h3>Auto-bannissement</h3>
            <p>Banni automatiquement les utilisateurs avec 5+ signalements.</p>
            <button class="admin-btn" onclick="adminPanel._autoBan()">Lancer</button>
          </div>
          <div class="tool-card">
            <div class="tool-icon">📤</div>
            <h3>Export utilisateurs CSV</h3>
            <p>Exporte la liste complète des membres (sans données sensibles).</p>
            <button class="admin-btn" onclick="adminPanel._exportUsers()">Exporter</button>
          </div>
          <div class="tool-card">
            <div class="tool-icon">🔍</div>
            <h3>Vérifier les doublons</h3>
            <p>Détecte les posts quasi-identiques (spam potentiel).</p>
            <button class="admin-btn" onclick="adminPanel._checkDuplicates()">Analyser</button>
          </div>
          <div class="tool-card danger-card">
            <div class="tool-icon">💥</div>
            <h3>Purge spam</h3>
            <p>Supprime tous les posts non approuvés de plus de 7 jours.</p>
            <button class="admin-btn-danger" onclick="adminPanel._purgeSpam()">Purger</button>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-header"><h3>📋 Résultat</h3></div>
          <div id="tools-output" class="tools-output">Les résultats s'afficheront ici.</div>
        </div>
      </div>
    `;
  }

  _toolsOutput(msg, type = 'info') {
    const el = document.getElementById('tools-output');
    if (!el) return;
    el.innerHTML = `<div class="tool-result tool-result-${type}">${_esc(msg)}</div>`;
  }

  async _cleanOrphans() {
    try {
      // Note: La syntaxe NOT IN sur Supabase client est limitée — on fait via rpc si dispo
      this._toolsOutput('🔄 Nettoyage en cours…', 'info');
      // Approche : récupère les IDs de posts valides
      const { data: validPosts } = await this.sb.from('posts').select('id');
      const validIds = (validPosts || []).map(p => p.id);
      if (validIds.length === 0) { this._toolsOutput('Aucun post trouvé.', 'warn'); return; }
      // Supprime orphelins (Supabase client ne supporte pas NOT IN facilement, on signale)
      this._toolsOutput('✅ Vérification terminée. Pour supprimer les orphelins, utilisez le SQL direct dans Supabase Dashboard.', 'success');
      _logAction('Nettoyage orphelins');
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  async _recalcCounters() {
    try {
      this._toolsOutput('🔄 Recalcul en cours…', 'info');
      const { data: posts } = await this.sb.from('posts').select('id');
      if (!posts || posts.length === 0) {
        this._toolsOutput('✅ Aucun post à recalculer.', 'success');
        return;
      }

      // ✅ Fix : traitement par lots de 10 pour éviter les timeouts
      const BATCH = 10;
      let updated = 0;
      for (let i = 0; i < posts.length; i += BATCH) {
        const batch = posts.slice(i, i + BATCH);
        await Promise.all(batch.map(async post => {
          const [{ count: rc }, { count: rep }] = await Promise.all([
            this.sb.from('reactions').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
            this.sb.from('replies').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
          ]);
          await this.sb.from('posts').update({ reaction_total: rc || 0, reply_count: rep || 0 }).eq('id', post.id);
          updated++;
        }));
        // Mise à jour visuelle de la progression
        this._toolsOutput(`🔄 Traitement : ${updated}/${posts.length} posts…`, 'info');
      }

      _logAction('Compteurs recalculés', `${updated} posts`);
      this._toolsOutput(`✅ Compteurs recalculés pour ${updated} posts.`, 'success');
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  async _autoBan() {
    try {
      const { data } = await this.sb.from('profiles').select('id, report_count').gte('report_count', 5).eq('banned', false);
      const ids = (data || []).map(p => p.id);
      if (!ids.length) { this._toolsOutput('✅ Aucun utilisateur à bannir automatiquement.', 'success'); return; }
      await this.sb.from('profiles').update({ banned: true }).in('id', ids);
      _logAction('Auto-ban', `${ids.length} utilisateurs`);
      this._toolsOutput(`🚫 ${ids.length} utilisateur(s) banni(s) automatiquement.`, 'warn');
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  async _exportUsers() {
    try {
      const { data } = await this.sb.from('profiles')
        .select('display_name, admin_role, banned, report_count, created_at')
        .order('created_at', { ascending: true });
      const rows = [['Nom', 'Rôle', 'Banni', 'Signalements', 'Inscription']];
      (data || []).forEach(u => rows.push([u.display_name || '', u.admin_role || 'user', u.banned, u.report_count || 0, u.created_at]));
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `resteici-users-${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      _logAction('Export utilisateurs CSV');
      this._toolsOutput(`✅ Export de ${data?.length || 0} utilisateurs généré.`, 'success');
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  async _checkDuplicates() {
    try {
      const { data: posts } = await this.sb.from('posts').select('id, content, created_at').order('created_at', { ascending: false }).limit(200);
      const dupes = [];
      for (let i = 0; i < (posts || []).length; i++) {
        for (let j = i + 1; j < posts.length; j++) {
          const a = posts[i].content || '';
          const b = posts[j].content || '';
          if (a.substring(0, 50) === b.substring(0, 50) && a.length > 10) {
            dupes.push(`#${posts[i].id.slice(0, 8)} ↔ #${posts[j].id.slice(0, 8)}`);
          }
        }
      }
      this._toolsOutput(
        dupes.length
          ? `⚠️ ${dupes.length} doublon(s) potentiel(s) :\n${dupes.slice(0, 10).join('\n')}`
          : '✅ Aucun doublon détecté.',
        dupes.length ? 'warn' : 'success'
      );
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  async _purgeSpam() {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    if (!confirm('ATTENTION : Supprimer tous les posts non approuvés de plus de 7 jours ? Irréversible.')) return;
    try {
      const { data } = await this.sb.from('posts').delete().eq('approved', false).lt('created_at', cutoff).select('id');
      _logAction('Purge spam', `${data?.length || 0} posts`);
      this._toolsOutput(`🗑️ ${data?.length || 0} posts spam supprimés.`, 'success');
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  // ══════════════════════════════════════════════════════════════
  // 🔍 RECHERCHE GLOBALE
  // ══════════════════════════════════════════════════════════════
  _onSearch(val) {
    const results = document.getElementById('admin-search-results');
    if (!results) return;
    clearTimeout(this._searchTimeout);
    if (val.length < 2) { results.innerHTML = ''; results.style.display = 'none'; return; }
    this._searchTimeout = setTimeout(() => this._doSearch(val, results), 300);
  }

  async _doSearch(q, resultsEl) {
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = '<div class="search-loading">🔍 Recherche…</div>';
    try {
      const [postsR, usersR] = await Promise.all([
        this.sb.from('posts').select('id, content, type').ilike('content', `%${q}%`).limit(5),
        this.sb.from('profiles').select('id, display_name, banned').ilike('display_name', `%${q}%`).limit(5),
      ]);
      const posts = postsR.data || [];
      const users = usersR.data || [];
      if (!posts.length && !users.length) {
        resultsEl.innerHTML = '<div class="search-empty">Aucun résultat.</div>';
        return;
      }
      resultsEl.innerHTML = [
        ...users.map(u => `<div class="search-result" onclick="adminPanel.navigateTo('users');document.getElementById('admin-search-results').style.display='none'">👤 ${_esc(u.display_name || '?')}${u.banned ? ' 🚫' : ''}</div>`),
        ...posts.map(p => `<div class="search-result" onclick="adminPanel.navigateTo('content');document.getElementById('admin-search-results').style.display='none'">📝 ${_esc((p.content || '').substring(0, 50))}…</div>`),
      ].join('');
    } catch { resultsEl.innerHTML = '<div class="search-empty">Erreur.</div>'; }
  }

  // ── Horloge ───────────────────────────────────────────────────
  _startClock() {
    if (this._clockInterval) clearInterval(this._clockInterval);
    const tick = () => {
      const el = document.getElementById('admin-clock');
      if (el) el.textContent = new Date().toLocaleTimeString('fr-FR');
    };
    tick();
    this._clockInterval = setInterval(tick, 1000);
  }

  // ── Badge signalements ────────────────────────────────────────
  async _loadReportsBadge() {
    try {
      const { count } = await this.sb.from('reports').select('*', { count: 'exact', head: true }).eq('resolved', false);
      const badge = document.getElementById('reports-badge');
      if (badge && count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; }
    } catch {}
  }

  // ── Sortie ────────────────────────────────────────────────────
  exitAdmin() {
    if (this._clockInterval) clearInterval(this._clockInterval);
    Object.values(this._charts).forEach(c => { try { c.destroy(); } catch {} });
    this._charts = {};
    document.body.style.overflow = '';

    const shell = document.getElementById('admin-shell');
    if (shell) shell.style.display = 'none';

    // ✅ Fix : restaure toutes les pages correctement
    //          montre page-home si aucune autre page n'était active
    const allPages = document.querySelectorAll('[id^="page-"]');
    const hadActivePage = this._previousPage && document.getElementById(this._previousPage);

    allPages.forEach(el => {
      if (hadActivePage) {
        el.classList.toggle('hidden', el.id !== this._previousPage);
      } else {
        el.classList.toggle('hidden', el.id !== 'page-home');
      }
    });
    this._previousPage = null;

    const navTabs = document.getElementById('nav-tabs');
    if (navTabs) navTabs.style.display = '';

    window.history.replaceState({}, '', window.location.pathname);
    _logAction('Sortie du panel');
  }

  showDeniedAccess() {
    showToast('⛔ Accès refusé. Tu n\'es pas admin.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// CSS ADMIN COMPLET — VERSION MOBILE-FIRST
// ═══════════════════════════════════════════════════════════════
const styleAdmin = document.createElement('style');
styleAdmin.textContent = `
/* ── Variables admin ────────────────────────────────────────── */
#admin-shell {
  display:none; position:fixed; inset:0; z-index:1000;
  background:var(--bg,#0b0d12); overflow:hidden;
}

/* ── Layout ─────────────────────────────────────────────────── */
.admin-layout { display:flex; height:100vh; overflow:hidden; }

/* ── Overlay mobile ─────────────────────────────────────────── */
.admin-sidebar-overlay {
  display:none; position:fixed; inset:0; background:rgba(0,0,0,.6);
  z-index:499; backdrop-filter:blur(2px);
  transition:opacity .25s;
}
.admin-sidebar-overlay.open { display:block; }

/* ── Sidebar ─────────────────────────────────────────────────── */
.admin-sidebar {
  width:260px; flex-shrink:0;
  background:var(--bg2,#10131a);
  border-right:1px solid var(--border,rgba(255,255,255,.07));
  display:flex; flex-direction:column; overflow-y:auto;
  overflow-x:hidden;
  transition:transform .28s cubic-bezier(.4,0,.2,1);
  z-index:500;
}

.admin-sidebar-close {
  display:none; /* visible seulement sur mobile */
  background:none; border:none; color:var(--text3,#6a677e);
  font-size:1.1rem; cursor:pointer; padding:4px; margin-left:auto;
  flex-shrink:0; transition:color .15s;
}
.admin-sidebar-close:hover { color:var(--text,#eceaf5); }

/* ── Brand ───────────────────────────────────────────────────── */
.admin-brand {
  display:flex; align-items:center; gap:11px;
  padding:16px 14px 13px; border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  flex-shrink:0;
}
.admin-brand-logo {
  width:38px; height:38px; border-radius:11px; flex-shrink:0;
  background:linear-gradient(135deg,var(--accent,#f5a96b),#c47fb5);
  color:#fff; font-weight:900; font-size:.95rem;
  display:flex; align-items:center; justify-content:center;
}
.admin-brand-title { font-weight:700; font-size:.83rem; color:var(--text,#eceaf5); white-space:nowrap; }
.admin-brand-name  { font-size:.7rem; color:var(--text3,#6a677e); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:130px; }
.admin-role-badge  { display:inline-block; font-size:.58rem; padding:1px 7px; border-radius:20px; margin-top:3px; font-weight:700; }
.role-superadmin   { background:rgba(245,169,107,.15); color:var(--accent,#f5a96b); }
.role-mod          { background:rgba(126,200,227,.15); color:var(--blue,#7ec8e3); }

/* ── Recherche ───────────────────────────────────────────────── */
.admin-search-wrap { padding:9px 10px 5px; position:relative; flex-shrink:0; }
.admin-search-input {
  width:100%; background:var(--surface,#14171f);
  border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:8px; padding:7px 11px; color:var(--text,#eceaf5);
  font-family:var(--font-body,'Sora',sans-serif); font-size:.8rem; outline:none;
  transition:border-color .2s;
}
.admin-search-input:focus { border-color:var(--accent,#f5a96b); }
.admin-search-results {
  display:none; position:absolute; left:10px; right:10px; top:calc(100% + 2px);
  background:var(--surface,#14171f); border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:8px; z-index:600; max-height:280px; overflow-y:auto;
  box-shadow:0 8px 32px rgba(0,0,0,.5);
}
.search-result {
  padding:9px 12px; font-size:.8rem; color:var(--text2,#a8a5bc);
  cursor:pointer; border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  transition:background .12s;
}
.search-result:last-child { border-bottom:none; }
.search-result:hover { background:var(--surface2,#1c202d); color:var(--text,#eceaf5); }
.search-loading, .search-empty { padding:10px 12px; font-size:.8rem; color:var(--text3,#6a677e); }

/* ── Nav ─────────────────────────────────────────────────────── */
.admin-nav { flex:1; overflow-y:auto; padding:6px 8px 10px; }
.admin-nav-group { margin-bottom:6px; }
.admin-nav-group-label {
  font-size:.62rem; font-weight:700; color:var(--text3,#6a677e);
  text-transform:uppercase; letter-spacing:.6px;
  padding:8px 8px 4px;
}
.admin-nav-item {
  display:flex; align-items:center; gap:8px; width:100%;
  padding:9px 10px; border-radius:9px; border:none; background:none;
  color:var(--text2,#a8a5bc); font-family:var(--font-body,'Sora',sans-serif);
  font-size:.82rem; text-align:left; cursor:pointer;
  transition:all .15s; position:relative;
}
.admin-nav-item:hover { background:var(--surface2,#1c202d); color:var(--text,#eceaf5); }
.admin-nav-item.active {
  background:rgba(245,169,107,.1); color:var(--accent,#f5a96b);
  font-weight:600;
}
.nav-icon { font-size:1rem; flex-shrink:0; width:20px; text-align:center; }
.admin-badge {
  display:inline-flex; align-items:center; justify-content:center;
  background:#e07878; color:#fff; font-size:.65rem; font-weight:700;
  border-radius:10px; padding:1px 6px; margin-left:auto; flex-shrink:0;
}

/* ── Sidebar footer ──────────────────────────────────────────── */
.admin-sidebar-footer {
  padding:10px 8px 14px; border-top:1px solid var(--border,rgba(255,255,255,.07));
  flex-shrink:0;
}
.admin-quick-actions { display:flex; gap:6px; margin-bottom:8px; }
.admin-quick-btn {
  flex:1; padding:7px; background:var(--surface2,#1c202d);
  border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:8px; cursor:pointer; font-size:.85rem;
  transition:all .15s; color:var(--text2,#a8a5bc);
}
.admin-quick-btn:hover { border-color:var(--accent,#f5a96b); }
.admin-exit-btn {
  width:100%; padding:9px 12px; background:none;
  border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:9px; color:var(--text3,#6a677e);
  font-family:var(--font-body,'Sora',sans-serif);
  font-size:.8rem; cursor:pointer; transition:all .2s;
}
.admin-exit-btn:hover { border-color:var(--accent,#f5a96b); color:var(--accent,#f5a96b); }

/* ── Hamburger flottant (fallback mobile) ────────────────────── */
.admin-mobile-toggle {
  display:none; position:fixed; bottom:18px; right:18px;
  z-index:1100; background:var(--accent,#f5a96b); color:#1a0a00;
  border:none; border-radius:50%; width:48px; height:48px;
  font-size:1.25rem; cursor:pointer;
  box-shadow:0 4px 20px rgba(245,169,107,.5);
  transition:transform .2s;
}
.admin-mobile-toggle:active { transform:scale(.92); }

/* ── Topbar hamburger (dans le header) ───────────────────────── */
.admin-topbar-hamburger {
  display:none; background:none; border:none;
  color:var(--text2,#a8a5bc); font-size:1.2rem;
  cursor:pointer; padding:4px 8px 4px 0; flex-shrink:0;
  transition:color .15s;
}
.admin-topbar-hamburger:hover { color:var(--text,#eceaf5); }

/* ── Main area ───────────────────────────────────────────────── */
.admin-main { flex:1; overflow-y:auto; display:flex; flex-direction:column; min-width:0; }
.admin-topbar {
  display:flex; align-items:center; justify-content:space-between;
  padding:11px 24px; border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  background:var(--bg2,#10131a); flex-shrink:0; gap:10px; flex-wrap:wrap;
  position:sticky; top:0; z-index:10;
}
.admin-topbar-left { display:flex; align-items:center; gap:0; min-width:0; }
.admin-topbar-page { font-weight:600; font-size:.9rem; color:var(--text,#eceaf5); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.admin-topbar-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }
.admin-topbar-time { font-size:.73rem; color:var(--text3,#6a677e); font-variant-numeric:tabular-nums; }
.admin-last-update { font-size:.7rem; color:var(--text3,#6a677e); }

.admin-page-content-wrap { flex:1; }

/* ── Pages ───────────────────────────────────────────────────── */
.admin-page { max-width:1100px; margin:0 auto; padding:24px 24px 80px; }
.admin-page-header {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:22px; flex-wrap:wrap; gap:10px;
}
.admin-page-header h1 {
  font-family:var(--font-display,'Playfair Display',serif);
  font-size:1.45rem; color:var(--text,#eceaf5);
}
.admin-header-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

/* ── Stats grid ──────────────────────────────────────────────── */
.stats-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr));
  gap:10px; margin-bottom:22px;
}
.stat-tile {
  background:var(--surface,#14171f); border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:13px; padding:16px 12px; text-align:center;
  transition:all .2s; position:relative; overflow:hidden;
}
.stat-tile.loading { opacity:.5; }
.stat-tile:hover { border-color:rgba(245,169,107,.3); transform:translateY(-2px); }
.st-icon { font-size:1.4rem; margin-bottom:7px; }
.st-val  { font-family:var(--font-display,'Playfair Display',serif); font-size:1.5rem; font-weight:700; color:var(--accent,#f5a96b); margin-bottom:4px; }
.st-label { font-size:.65rem; color:var(--text3,#6a677e); font-weight:600; text-transform:uppercase; letter-spacing:.4px; }

/* ── Two col ─────────────────────────────────────────────────── */
.admin-two-col { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }

/* ── Section ─────────────────────────────────────────────────── */
.admin-section {
  background:var(--surface,#14171f);
  border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:13px; padding:18px; margin-bottom:14px;
}
.admin-section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
.admin-section-header h3 {
  font-family:var(--font-display,'Playfair Display',serif);
  font-size:.95rem; color:var(--text,#eceaf5);
}

/* ── Recent posts ────────────────────────────────────────────── */
.recent-post-item {
  display:flex; align-items:center; gap:9px;
  padding:8px 10px; border-radius:7px;
  border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  font-size:.78rem; flex-wrap:wrap; transition:background .12s;
}
.recent-post-item:last-child { border-bottom:none; }
.recent-post-item:hover { background:var(--surface2,#1c202d); }
.rp-type { padding:2px 7px; border-radius:20px; font-size:.66rem; font-weight:700; flex-shrink:0; }
.type-encouragement { background:rgba(245,169,107,.15); color:var(--accent,#f5a96b); }
.type-temoignage    { background:rgba(126,200,227,.15); color:var(--blue,#7ec8e3); }
.type-question      { background:rgba(196,127,181,.15); color:var(--purple,#c47fb5); }
.rp-author { font-weight:600; color:var(--text,#eceaf5); flex-shrink:0; }
.rp-content { flex:1; color:var(--text2,#a8a5bc); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.rp-time { color:var(--text3,#6a677e); font-size:.7rem; flex-shrink:0; }
.admin-btn-icon {
  background:none; border:none; cursor:pointer; font-size:.82rem;
  opacity:.45; transition:opacity .15s; flex-shrink:0; padding:2px;
}
.admin-btn-icon:hover { opacity:1; }

/* ── Mini goal ───────────────────────────────────────────────── */
.mini-goal-widget { padding:4px 0; }
.mini-goal-amounts { display:flex; align-items:baseline; gap:7px; margin-bottom:9px; }
.mini-goal-current { font-family:var(--font-display,'Playfair Display',serif); font-size:1.7rem; font-weight:700; color:var(--accent,#f5a96b); }
.mini-goal-sep { color:var(--text3,#6a677e); font-size:.85rem; }
.mini-goal-bar { height:9px; background:var(--surface2,#1c202d); border-radius:9px; overflow:hidden; margin-bottom:7px; }
.mini-goal-fill { height:100%; background:linear-gradient(90deg,var(--accent,#f5a96b),#e8c06a); border-radius:9px; transition:width .6s; }
.mini-goal-pct { font-size:.75rem; color:var(--text3,#6a677e); }

/* ── Top members ─────────────────────────────────────────────── */
.top-members-grid { display:flex; gap:10px; flex-wrap:wrap; }
.top-member-card {
  background:var(--surface2,#1c202d); border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:11px; padding:13px 14px; text-align:center; min-width:100px; flex:1;
}
.top-rank { font-size:.68rem; color:var(--text3,#6a677e); margin-bottom:5px; font-weight:700; }
.top-av {
  width:34px; height:34px; border-radius:50%;
  background:linear-gradient(135deg,var(--accent,#f5a96b),#c47fb5);
  color:#fff; font-weight:700; font-size:.82rem;
  display:flex; align-items:center; justify-content:center; margin:0 auto 7px;
}
.top-name { font-size:.82rem; font-weight:600; color:var(--text,#eceaf5); margin-bottom:2px; }
.top-date { font-size:.66rem; color:var(--text3,#6a677e); }

/* ── Analytics ───────────────────────────────────────────────── */
.analytics-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
.chart-card {
  background:var(--surface,#14171f); border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:13px; padding:16px; min-height:220px; position:relative;
}
.chart-card-header { margin-bottom:12px; }
.chart-card-header h3 { font-size:.85rem; color:var(--text2,#a8a5bc); font-family:var(--font-display,'Playfair Display',serif); }

/* ── Health ──────────────────────────────────────────────────── */
.health-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px; margin-bottom:18px; }
.health-card {
  background:var(--surface,#14171f); border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:11px; padding:16px; text-align:center; transition:all .2s;
}
.hcard-good { border-color:rgba(114,201,138,.3); }
.hcard-warn { border-color:rgba(245,169,107,.3); }
.hcard-bad  { border-color:rgba(232,125,125,.3); }
.health-icon { font-size:1.5rem; margin-bottom:7px; }
.health-label { font-size:.68rem; color:var(--text3,#6a677e); margin-bottom:5px; font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
.health-val { font-size:.9rem; font-weight:600; color:var(--text,#eceaf5); margin-bottom:5px; }
.health-status { font-size:.73rem; font-weight:600; }
.status-good { color:var(--green,#72c98a); }
.status-warn { color:var(--accent,#f5a96b); }
.status-bad  { color:#e07878; }

.config-info { background:var(--surface2,#1c202d); border-radius:9px; padding:12px; }
.config-item { display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border,rgba(255,255,255,.07)); font-size:.8rem; flex-wrap:wrap; gap:4px; }
.config-item:last-child { border-bottom:none; }
.config-key { color:var(--text3,#6a677e); font-weight:600; text-transform:uppercase; font-size:.7rem; letter-spacing:.4px; }
.config-val { color:var(--blue,#7ec8e3); font-family:monospace; font-size:.8rem; word-break:break-all; }

.sql-block { margin-top:10px; }
.sql-block pre {
  background:var(--bg,#0b0d12); padding:14px; border-radius:9px;
  font-size:.7rem; color:var(--blue,#7ec8e3); overflow-x:auto;
  border:1px solid var(--border,rgba(255,255,255,.07));
  white-space:pre-wrap; line-height:1.5;
}

/* ── Content ─────────────────────────────────────────────────── */
.content-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
.content-count { font-size:.8rem; color:var(--text3,#6a677e); flex:1; }
.content-row {
  display:flex; align-items:center; gap:9px;
  padding:9px 11px; border-radius:7px;
  border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  font-size:.78rem; flex-wrap:wrap; transition:background .12s;
}
.content-row:hover { background:var(--surface2,#1c202d); }
.content-author { font-weight:600; color:var(--text,#eceaf5); flex-shrink:0; max-width:90px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.content-text { flex:1; color:var(--text2,#a8a5bc); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.content-actions { display:flex; gap:4px; flex-shrink:0; }

/* ── Announcements ───────────────────────────────────────────── */
.announcement-card {
  background:var(--surface,#14171f);
  border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:11px; padding:16px 18px; margin-bottom:10px;
  transition:border-color .2s; border-left-width:3px;
}
.ann-info    { border-left-color:var(--blue,#7ec8e3); }
.ann-warning { border-left-color:var(--accent,#f5a96b); }
.ann-success { border-left-color:var(--green,#72c98a); }
.ann-urgent  { border-left-color:#e07878; }
.ann-header  { display:flex; align-items:center; justify-content:space-between; margin-bottom:7px; gap:8px; flex-wrap:wrap; }
.ann-title   { font-weight:600; font-size:.88rem; color:var(--text,#eceaf5); }
.ann-type-badge { padding:2px 7px; border-radius:20px; font-size:.63rem; font-weight:700; margin-right:6px; text-transform:uppercase; }
.ann-badge-info    { background:rgba(126,200,227,.15); color:var(--blue,#7ec8e3); }
.ann-badge-warning { background:rgba(245,169,107,.15); color:var(--accent,#f5a96b); }
.ann-badge-success { background:rgba(114,201,138,.15); color:var(--green,#72c98a); }
.ann-badge-urgent  { background:rgba(224,120,120,.15); color:#e07878; }
.ann-content { font-size:.82rem; color:var(--text2,#a8a5bc); margin-bottom:10px; line-height:1.5; }
.ann-actions { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
.ann-status  { font-size:.73rem; margin-left:auto; color:var(--text3,#6a677e); }

/* ── Activity ────────────────────────────────────────────────── */
.activity-log { display:flex; flex-direction:column; gap:0; }
.activity-item {
  display:flex; align-items:center; gap:11px;
  padding:9px 11px; border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  font-size:.78rem; flex-wrap:wrap; transition:background .12s;
}
.activity-item:hover { background:var(--surface2,#1c202d); }
.activity-time   { color:var(--text3,#6a677e); font-family:monospace; font-size:.73rem; flex-shrink:0; }
.activity-action { font-weight:600; color:var(--text,#eceaf5); flex-shrink:0; }
.activity-detail { color:var(--text2,#a8a5bc); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.activity-admin  { color:var(--accent,#f5a96b); font-size:.7rem; flex-shrink:0; }

/* ── Tools ───────────────────────────────────────────────────── */
.tools-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:12px; margin-bottom:18px; }
.tool-card {
  background:var(--surface,#14171f); border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:11px; padding:18px; transition:border-color .2s;
}
.tool-card:hover { border-color:rgba(255,255,255,.12); }
.danger-card { border-color:rgba(232,125,125,.2); }
.tool-icon { font-size:1.7rem; margin-bottom:9px; }
.tool-card h3 { font-size:.88rem; font-weight:600; color:var(--text,#eceaf5); margin-bottom:5px; }
.tool-card p  { font-size:.78rem; color:var(--text2,#a8a5bc); margin-bottom:12px; line-height:1.5; }
.tools-output {
  background:var(--surface2,#1c202d); border-radius:9px;
  padding:13px; font-size:.78rem; color:var(--text2,#a8a5bc);
  white-space:pre-wrap; min-height:55px; line-height:1.5;
}
.tool-result { padding:11px; border-radius:7px; font-size:.8rem; }
.tool-result-success { background:rgba(114,201,138,.1); color:var(--green,#72c98a); }
.tool-result-warn    { background:rgba(245,169,107,.1); color:var(--accent,#f5a96b); }
.tool-result-error   { background:rgba(232,125,125,.1); color:#e07878; }
.tool-result-info    { background:rgba(126,200,227,.1); color:var(--blue,#7ec8e3); }

/* ── Shared buttons ──────────────────────────────────────────── */
.admin-btn {
  display:inline-flex; align-items:center; gap:5px;
  padding:8px 15px; background:var(--accent,#f5a96b); color:#1a0a00;
  border:none; border-radius:8px;
  font-family:var(--font-body,'Sora',sans-serif);
  font-size:.78rem; font-weight:600; cursor:pointer; transition:all .15s;
}
.admin-btn:hover { filter:brightness(1.1); transform:translateY(-1px); }

.admin-btn-sm {
  display:inline-flex; align-items:center; gap:4px;
  padding:6px 11px; background:var(--surface2,#1c202d);
  color:var(--text2,#a8a5bc);
  border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:7px; font-family:var(--font-body,'Sora',sans-serif);
  font-size:.76rem; cursor:pointer; transition:all .15s;
}
.admin-btn-sm:hover {
  background:var(--surface,#14171f); color:var(--text,#eceaf5);
  border-color:rgba(255,255,255,.12);
}
.admin-btn-sm.active-filter {
  background:rgba(245,169,107,.1); color:var(--accent,#f5a96b);
  border-color:var(--accent,#f5a96b);
}

.admin-btn-danger {
  display:inline-flex; align-items:center; gap:4px;
  padding:6px 11px; background:rgba(232,125,125,.12); color:#e07878;
  border:1px solid rgba(232,125,125,.2); border-radius:7px;
  font-family:var(--font-body,'Sora',sans-serif);
  font-size:.76rem; cursor:pointer; transition:all .15s;
}
.admin-btn-danger:hover { background:rgba(232,125,125,.25); }

.admin-input {
  background:var(--surface2,#1c202d); border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:8px; padding:8px 11px; color:var(--text,#eceaf5);
  font-family:var(--font-body,'Sora',sans-serif); font-size:.83rem;
  outline:none; width:100%; transition:border-color .2s;
}
.admin-input:focus { border-color:var(--accent,#f5a96b); box-shadow:0 0 0 2px rgba(245,169,107,.12); }

.admin-select {
  background:var(--surface2,#1c202d); border:1px solid var(--border,rgba(255,255,255,.07));
  border-radius:8px; padding:7px 11px; color:var(--text,#eceaf5);
  font-family:var(--font-body,'Sora',sans-serif); font-size:.78rem;
  outline:none; cursor:pointer;
}

.admin-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.admin-loading { padding:22px; text-align:center; color:var(--text3,#6a677e); font-size:.83rem; }
.admin-empty   { padding:22px; text-align:center; color:var(--text3,#6a677e); font-size:.83rem; }
.admin-error   { padding:13px 14px; border-radius:8px; background:rgba(232,125,125,.1); color:#e07878; font-size:.82rem; }
.admin-info-box {
  background:rgba(126,200,227,.08); border:1px solid rgba(126,200,227,.2);
  border-radius:9px; padding:11px 14px; font-size:.8rem;
  color:var(--blue,#7ec8e3); margin-bottom:16px; line-height:1.5;
}
.admin-pagination { display:flex; gap:4px; margin-top:12px; flex-wrap:wrap; }

/* ── Form admin ──────────────────────────────────────────────── */
.form-group-admin { margin-bottom:12px; }
.form-group-admin label {
  display:block; font-size:.7rem; font-weight:700;
  color:var(--text3,#6a677e); margin-bottom:5px;
  text-transform:uppercase; letter-spacing:.4px;
}
.form-row-admin { display:grid; grid-template-columns:1fr 1fr; gap:10px; }

/* ── Toast ───────────────────────────────────────────────────── */
@keyframes adminToastIn {
  from { transform: translateY(20px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
.admin-toast {
  position:fixed; bottom:22px; right:22px; z-index:3000;
  padding:11px 16px; border-radius:9px; font-size:.83rem; font-weight:600;
  background:var(--surface,#14171f); border:1px solid rgba(255,255,255,.12);
  color:var(--text,#eceaf5); box-shadow:0 8px 32px rgba(0,0,0,.5);
  transform:translateY(60px); opacity:0; transition:all .28s cubic-bezier(.4,0,.2,1);
  pointer-events:none; max-width:300px;
}
.admin-toast-show { transform:translateY(0); opacity:1; }
.admin-toast-success { border-color:rgba(114,201,138,.3); color:var(--green,#72c98a); }
.admin-toast-error   { border-color:rgba(232,125,125,.3); color:#e07878; }

/* ── Modal ───────────────────────────────────────────────────── */
.up-modal-overlay {
  position:fixed; inset:0; background:rgba(0,0,0,.72);
  z-index:2000; display:none; align-items:center;
  justify-content:center; padding:20px;
}
.up-modal {
  background:var(--surface,#14171f);
  border-radius:var(--radius,18px);
  border:1px solid var(--border,rgba(255,255,255,.07));
  width:100%; max-width:500px; max-height:90vh;
  overflow:hidden; display:flex; flex-direction:column;
  box-shadow:0 20px 60px rgba(0,0,0,.6);
}
.up-modal-header {
  display:flex; justify-content:space-between; align-items:center;
  padding:15px 18px; border-bottom:1px solid var(--border,rgba(255,255,255,.07));
  font-weight:600; font-size:.9rem; flex-shrink:0;
}
.up-modal-header button {
  background:none; border:none; color:var(--text3,#6a677e);
  cursor:pointer; font-size:1rem; transition:color .15s;
}
.up-modal-header button:hover { color:var(--text,#eceaf5); }
.up-modal-body { padding:16px 18px; overflow-y:auto; flex:1; }

/* ══════════════════════════════════════════════════════════════
   RESPONSIVE MOBILE
══════════════════════════════════════════════════════════════ */
@media (max-width:900px) {
  .analytics-grid { grid-template-columns:1fr; }
  .admin-two-col  { grid-template-columns:1fr; }
  .tools-grid     { grid-template-columns:1fr 1fr; }
}

@media (max-width:720px) {
  /* Sidebar devient drawer mobile */
  .admin-sidebar {
    position:fixed; left:0; top:0; bottom:0; z-index:500;
    transform:translateX(-100%);
    width:280px !important;
    box-shadow:4px 0 24px rgba(0,0,0,.5);
  }
  .admin-sidebar.open { transform:translateX(0); }

  /* Bouton fermer visible */
  .admin-sidebar-close { display:flex !important; }

  /* Hamburger dans topbar visible */
  .admin-topbar-hamburger { display:flex !important; }

  /* Bouton flottant caché (on utilise celui du topbar) */
  .admin-mobile-toggle { display:none; }

  /* Ajustements layout */
  .admin-topbar { padding:9px 14px; }
  .admin-page   { padding:16px 14px 80px; }

  /* Stats 2 colonnes sur mobile */
  .stats-grid { grid-template-columns:repeat(2,1fr); }
  .health-grid { grid-template-columns:1fr 1fr; }
  .tools-grid  { grid-template-columns:1fr; }
  .analytics-grid { grid-template-columns:1fr; }
  .form-row-admin { grid-template-columns:1fr; }

  /* Top membres scroll horizontal */
  .top-members-grid { flex-wrap:nowrap; overflow-x:auto; padding-bottom:4px; }
  .top-member-card  { min-width:110px; }

  /* Modal plein écran sur mobile */
  .up-modal { max-width:100%; max-height:85vh; }

  /* Toast centré sur mobile */
  .admin-toast { left:14px; right:14px; max-width:none; text-align:center; }
}

@media (max-width:480px) {
  .stats-grid { grid-template-columns:repeat(2,1fr); gap:8px; }
  .admin-page-header { flex-direction:column; align-items:flex-start; }
  .admin-header-actions { width:100%; justify-content:flex-start; }
  .health-grid { grid-template-columns:1fr; }
}
`;
document.head.appendChild(styleAdmin);

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function initAdminPanel() {
  const client = (typeof sb !== 'undefined' && sb) ? sb : null;
  if (!client) return;
  if (!window.adminPanel || !window.adminPanel.sb) {
    window.adminPanel = new AdminPanel(client);
  } else {
    window.adminPanel.sb = client;
  }
}

function refreshAdminButton() {
  if (typeof adminPanel === 'undefined' || !adminPanel.isAdmin) return;
  const dropdown = document.getElementById('user-dropdown');
  if (!dropdown) return;
  if (!dropdown.querySelector('.admin-btn-entry')) {
    const btn = document.createElement('button');
    btn.className = 'admin-btn-entry dropdown-item';
    btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:10px 16px;background:rgba(245,169,107,.08);border:none;border-bottom:1px solid var(--border);color:var(--accent);font-weight:600;font-size:.83rem;cursor:pointer;font-family:var(--font-body);transition:background .15s;';
    btn.innerHTML = (adminPanel.isSuperAdmin ? '🔐' : '🛡️') + ' ' + (adminPanel.isSuperAdmin ? 'Panel Admin' : 'Modération');
    btn.onmouseover = () => btn.style.background = 'rgba(245,169,107,.15)';
    btn.onmouseout  = () => btn.style.background = 'rgba(245,169,107,.08)';
    btn.onclick = () => {
      adminPanel.renderAdminDashboard();
      document.getElementById('user-dropdown')?.classList.remove('open');
    };
    dropdown.insertBefore(btn, dropdown.firstChild);
  }
}

// Instance globale par défaut (sera réinitialisée avec sb dans initAdminPanel)
window.adminPanel = new AdminPanel(null);
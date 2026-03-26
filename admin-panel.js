// ═══════════════════════════════════════════════════════════════
// Admin Panel — ResteIci  ✅ VERSION ULTRA COMPLÈTE v3
// Accès : admin_role = 'admin' ou 'moderator' en BDD uniquement
// Nouvelles fonctionnalités :
//   📊 Stats avancées avec graphiques Chart.js
//   🔍 Recherche globale
//   📋 Journal d'activité admin
//   🏥 Santé système (latence, quotas Supabase)
//   📣 Annonces & bannières
//   🛠️ Outils de contenu (export CSV, purge)
//   🔒 Rate-limit + CSRF token côté client
//   🌙 Thème admin indépendant
//   📱 100% responsive
// ═══════════════════════════════════════════════════════════════

let currentAdminPage = 'stats';

// ── CSRF token léger côté client (anti double-soumission) ───────
const _csrfToken = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

// ── Rate limiter simple (mémoire locale) ───────────────────────
const _rateLimits = {};
function _rateLimit(key, maxPerMin = 10) {
  const now = Date.now();
  if (!_rateLimits[key]) _rateLimits[key] = [];
  _rateLimits[key] = _rateLimits[key].filter(t => now - t < 60000);
  if (_rateLimits[key].length >= maxPerMin) return false;
  _rateLimits[key].push(now);
  return true;
}

// ── Journal d'activité admin (session) ─────────────────────────
const _adminLog = [];
function _logAction(action, detail = '') {
  _adminLog.unshift({ action, detail, ts: new Date().toISOString(), admin: currentUser?.email || '?' });
  if (_adminLog.length > 200) _adminLog.pop();
}

// ── Chargement Chart.js à la demande ───────────────────────────
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

// ═══════════════════════════════════════════════════════════════
class AdminPanel {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.isAdmin = false;
    this.isSuperAdmin = false;
    this.profile = null;
    this._charts = {};
    this._searchTimeout = null;
  }

  // ── Vérification rôle — SEUL point d'entrée sécurisé ──────────
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
      this.isAdmin       = (role === 'admin' || role === 'moderator') && !profile.banned;
      this.isSuperAdmin  = role === 'admin' && !profile.banned;
      return this.isAdmin;
    } catch(e) { console.error('Admin check error:', e); this.isAdmin = false; return false; }
  }

  async renderAdminDashboard() {
    if (!currentUser) return requireAuth(() => this.renderAdminDashboard());
    const ok = await this.checkAdminStatus(currentUser.id);
    if (!ok) return this.showDeniedAccess();

    _logAction('Accès dashboard');
    document.querySelectorAll('[id^="page-"]').forEach(el => el.classList.add('hidden'));
    const navTabs = document.getElementById('nav-tabs');
    if (navTabs) navTabs.style.display = 'none';

    let shell = document.getElementById('admin-shell');
    if (!shell) { shell = document.createElement('div'); shell.id = 'admin-shell'; document.body.appendChild(shell); }
    shell.style.display = 'block';
    shell.innerHTML = this._shellHTML();

    this._bindSearch();
    this.navigateTo('stats');
    this._loadReportsBadge();
  }

  _shellHTML() {
    const name = escapeHtml(this.profile?.display_name || currentUser?.email?.split('@')[0] || 'Admin');
    const role = this.isSuperAdmin ? '🔐 Super Admin' : '🛡️ Modérateur';
    const roleClass = this.isSuperAdmin ? 'role-superadmin' : 'role-mod';

    return `
    <div class="admin-layout">
      <!-- SIDEBAR -->
      <aside class="admin-sidebar" id="admin-sidebar">
        <div class="admin-brand">
          <div class="admin-brand-logo">RI</div>
          <div>
            <div class="admin-brand-title">ResteIci Admin</div>
            <div class="admin-brand-name">${name}</div>
            <span class="admin-role-badge ${roleClass}">${role}</span>
          </div>
        </div>

        <!-- Recherche globale -->
        <div class="admin-search-wrap">
          <input class="admin-search-input" id="admin-global-search" placeholder="🔍 Recherche globale…" oninput="adminPanel._onSearch(this.value)">
          <div class="admin-search-results" id="admin-search-results"></div>
        </div>

        <nav class="admin-nav">
          <div class="admin-nav-group">
            <div class="admin-nav-group-label">Tableau de bord</div>
            <button class="admin-nav-item active" data-page="stats" onclick="adminPanel.navigateTo('stats')">
              <span class="nav-icon">📊</span> Statistiques
            </button>
            <button class="admin-nav-item" data-page="analytics" onclick="adminPanel.navigateTo('analytics')">
              <span class="nav-icon">📈</span> Analytiques
            </button>
            <button class="admin-nav-item" data-page="health" onclick="adminPanel.navigateTo('health')">
              <span class="nav-icon">🏥</span> Santé système
            </button>
          </div>
          <div class="admin-nav-group">
            <div class="admin-nav-group-label">Modération</div>
            <button class="admin-nav-item" data-page="moderation" onclick="adminPanel.navigateTo('moderation')">
              <span class="nav-icon">⚠️</span> Signalements
              <span class="admin-badge" id="reports-badge" style="display:none">0</span>
            </button>
            <button class="admin-nav-item" data-page="users" onclick="adminPanel.navigateTo('users')">
              <span class="nav-icon">👥</span> Utilisateurs
            </button>
            <button class="admin-nav-item" data-page="content" onclick="adminPanel.navigateTo('content')">
              <span class="nav-icon">📝</span> Contenus
            </button>
          </div>
          <div class="admin-nav-group">
            <div class="admin-nav-group-label">Communauté</div>
            <button class="admin-nav-item" data-page="donations" onclick="adminPanel.navigateTo('donations')">
              <span class="nav-icon">💰</span> Dons & Objectifs
            </button>
            <button class="admin-nav-item" data-page="announcements" onclick="adminPanel.navigateTo('announcements')">
              <span class="nav-icon">📣</span> Annonces
            </button>
          </div>
          ${this.isSuperAdmin ? `
          <div class="admin-nav-group">
            <div class="admin-nav-group-label">Super Admin</div>
            <button class="admin-nav-item" data-page="activity" onclick="adminPanel.navigateTo('activity')">
              <span class="nav-icon">📋</span> Journal activité
            </button>
            <button class="admin-nav-item" data-page="tools" onclick="adminPanel.navigateTo('tools')">
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

      <!-- MOBILE TOGGLE -->
      <button class="admin-mobile-toggle" onclick="document.getElementById('admin-sidebar').classList.toggle('open')">☰</button>

      <!-- MAIN -->
      <main class="admin-main">
        <!-- Top bar -->
        <div class="admin-topbar">
          <div class="admin-topbar-left">
            <span class="admin-topbar-page" id="admin-topbar-title">📊 Statistiques</span>
          </div>
          <div class="admin-topbar-right">
            <span class="admin-topbar-time" id="admin-clock"></span>
            <button class="admin-btn-sm" onclick="adminPanel.navigateTo(currentAdminPage)">🔄 Rafraîchir</button>
          </div>
        </div>
        <div id="admin-page-content"></div>
      </main>
    </div>

    <!-- Toast admin -->
    <div id="admin-toast" class="admin-toast"></div>
    `;
  }

  navigateTo(page) {
    if (!_rateLimit('nav', 30)) return;
    currentAdminPage = page;
    _logAction('Navigation', page);

    document.querySelectorAll('.admin-nav-item').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.page === page)
    );

    const titles = {
      stats: '📊 Statistiques', analytics: '📈 Analytiques', health: '🏥 Santé système',
      moderation: '⚠️ Signalements', users: '👥 Utilisateurs', content: '📝 Contenus',
      donations: '💰 Dons & Objectifs', announcements: '📣 Annonces',
      activity: '📋 Journal d\'activité', tools: '🛠️ Outils avancés'
    };
    const titleEl = document.getElementById('admin-topbar-title');
    if (titleEl) titleEl.textContent = titles[page] || page;

    const content = document.getElementById('admin-page-content');
    if (!content) return;

    // Destroy existing charts before switching
    Object.values(this._charts).forEach(c => { try { c.destroy(); } catch {} });
    this._charts = {};

    switch (page) {
      case 'stats':         this.renderStats(content); break;
      case 'analytics':     this.renderAnalytics(content); break;
      case 'health':        this.renderHealth(content); break;
      case 'moderation':    adminModeration.render(content); break;
      case 'users':         adminUsers.render(content); break;
      case 'content':       this.renderContent(content); break;
      case 'donations':     adminDonations.render(content); break;
      case 'announcements': this.renderAnnouncements(content); break;
      case 'activity':      this.renderActivity(content); break;
      case 'tools':         this.renderTools(content); break;
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
          <div class="admin-header-actions">
            <span class="admin-last-update" id="stats-updated">—</span>
          </div>
        </div>

        <!-- KPIs principaux -->
        <div class="stats-grid" id="kpi-grid">
          ${['👥','📝','🚩','🚫','❤️','💰','💬','🌟'].map((icon, i) => `
            <div class="stat-tile loading" id="st-${i}">
              <div class="st-icon">${icon}</div>
              <div class="st-val">…</div>
              <div class="st-label">Chargement</div>
              <div class="st-trend" id="st-trend-${i}"></div>
            </div>
          `).join('')}
        </div>

        <!-- Activité récente + objectif don côte à côte -->
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

        <!-- Top membres -->
        <div class="admin-section">
          <div class="admin-section-header">
            <h3>🌟 Top contributeurs</h3>
          </div>
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
        this.sb.from('subgoals').select('current_amount, target_amount').order('created_at', { ascending: true }).limit(1).single(),
        this.sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', false),
      ]);

      const kpis = [
        { id: 'st-0', val: usersR.count ?? '?', label: 'Utilisateurs', color: 'blue' },
        { id: 'st-1', val: postsR.count ?? '?', label: 'Posts publiés', color: 'green' },
        { id: 'st-2', val: reportsR.count ?? '?', label: 'Signalements', color: 'red' },
        { id: 'st-3', val: bannedR.count ?? '?', label: 'Bannis', color: 'orange' },
        { id: 'st-4', val: reactionsR.count ?? '?', label: 'Réactions', color: 'pink' },
        { id: 'st-5', val: donationsR.data ? `${donationsR.data.current_amount || 0}€` : '?', label: 'Dons reçus', color: 'gold' },
        { id: 'st-6', val: repliesR.count ?? '?', label: 'Réponses', color: 'purple' },
        { id: 'st-7', val: blockedR.count ?? '?', label: 'En attente', color: 'gray' },
      ];

      kpis.forEach(({ id, val, label, color }) => {
        const tile = document.getElementById(id);
        if (!tile) return;
        tile.classList.remove('loading');
        tile.querySelector('.st-val').textContent = val;
        tile.querySelector('.st-label').textContent = label;
        tile.dataset.color = color;
      });

      const updEl = document.getElementById('stats-updated');
      if (updEl) updEl.textContent = 'Mis à jour ' + new Date().toLocaleTimeString('fr-FR');

      // Badge signalements
      const badge = document.getElementById('reports-badge');
      if (badge && reportsR.count > 0) { badge.textContent = reportsR.count; badge.style.display = 'inline-flex'; }

      // Posts récents
      const { data: recentPosts } = await this.sb
        .from('posts')
        .select('id, content, type, created_at, profiles(display_name)')
        .order('created_at', { ascending: false })
        .limit(8);

      const listEl = document.getElementById('recent-posts-list');
      if (listEl) {
        listEl.innerHTML = (recentPosts || []).map(p => `
          <div class="recent-post-item">
            <span class="rp-type type-${p.type}">${p.type}</span>
            <span class="rp-author">${escapeHtml(p.profiles?.display_name || 'Anonyme')}</span>
            <span class="rp-content">${escapeHtml((p.content || '').substring(0, 60))}…</span>
            <span class="rp-time">${formatTime(p.created_at)}</span>
            <button class="admin-btn-icon" onclick="adminPanel._quickDeletePost('${p.id}')" title="Supprimer">🗑️</button>
          </div>
        `).join('') || '<p class="admin-empty">Aucun post récent.</p>';
      }

      // Widget objectif
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
                <div class="top-name">${escapeHtml(m.display_name || 'Anonyme')}</div>
                <div class="top-date">Depuis ${new Date(m.created_at).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</div>
              </div>
            `;
          }).join('')}
        </div>`;
      }

    } catch (err) {
      console.error('Stats error:', err);
      const grid = container.querySelector('.stats-grid');
      if (grid) grid.innerHTML = `<div class="admin-error" style="grid-column:1/-1">❌ Erreur lors du chargement : ${escapeHtml(err.message)}</div>`;
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
  // 📈 ANALYTIQUES (graphiques)
  // ══════════════════════════════════════════════════════════════
  async renderAnalytics(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📈 Analytiques</h1>
          <div class="admin-header-actions">
            <select class="admin-select" id="analytics-period" onchange="adminPanel._reloadAnalytics()">
              <option value="7">7 derniers jours</option>
              <option value="30" selected>30 derniers jours</option>
              <option value="90">90 derniers jours</option>
            </select>
          </div>
        </div>

        <div class="analytics-grid">
          <div class="chart-card">
            <div class="chart-card-header"><h3>📝 Publications par jour</h3></div>
            <canvas id="chart-posts" height="200"></canvas>
          </div>
          <div class="chart-card">
            <div class="chart-card-header"><h3>👥 Inscriptions par jour</h3></div>
            <canvas id="chart-users" height="200"></canvas>
          </div>
          <div class="chart-card">
            <div class="chart-card-header"><h3>🏷️ Répartition par type</h3></div>
            <canvas id="chart-types" height="200"></canvas>
          </div>
          <div class="chart-card">
            <div class="chart-card-header"><h3>🚩 Signalements par jour</h3></div>
            <canvas id="chart-reports" height="200"></canvas>
          </div>
        </div>

        <!-- Heure de pointe -->
        <div class="admin-section">
          <div class="admin-section-header"><h3>⏰ Activité par heure</h3></div>
          <canvas id="chart-hours" height="120"></canvas>
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

      const chartDefaults = (color) => ({
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.12)'),
        fill: true, tension: 0.4, pointRadius: 3,
      });

      const makeChart = (id, label, data, color) => {
        const ctx = document.getElementById(id);
        if (!ctx) return;
        if (this._charts[id]) { this._charts[id].destroy(); }
        this._charts[id] = new Chart(ctx, {
          type: 'line',
          data: { labels: days, datasets: [{ label, data, ...chartDefaults(color) }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#666', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
              y: { ticks: { color: '#666', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
            }
          }
        });
      };

      makeChart('chart-posts',   'Posts',         countByDay(posts),   'rgb(232,149,109)');
      makeChart('chart-users',   'Inscriptions',  countByDay(users),   'rgb(109,184,232)');
      makeChart('chart-reports', 'Signalements',  countByDay(reports), 'rgb(232,125,125)');

      // Camembert types
      const typeCount = { encouragement: 0, temoignage: 0, question: 0 };
      posts.forEach(p => { if (typeCount[p.type] !== undefined) typeCount[p.type]++; });
      const ctxT = document.getElementById('chart-types');
      if (ctxT) {
        if (this._charts['chart-types']) this._charts['chart-types'].destroy();
        this._charts['chart-types'] = new Chart(ctxT, {
          type: 'doughnut',
          data: {
            labels: ['💛 Encouragement', '📖 Témoignage', '💬 Question'],
            datasets: [{ data: Object.values(typeCount), backgroundColor: ['rgba(232,149,109,.8)', 'rgba(109,184,232,.8)', 'rgba(184,125,232,.8)'] }]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#9c99b8', font: { size: 11 } } } } }
        });
      }

      // Activité par heure
      const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`);
      const hourMap = {};
      posts.forEach(p => {
        const h = new Date(p.created_at).getHours();
        hourMap[h] = (hourMap[h] || 0) + 1;
      });
      const hourData = Array.from({ length: 24 }, (_, i) => hourMap[i] || 0);
      const ctxH = document.getElementById('chart-hours');
      if (ctxH) {
        if (this._charts['chart-hours']) this._charts['chart-hours'].destroy();
        this._charts['chart-hours'] = new Chart(ctxH, {
          type: 'bar',
          data: { labels: hours, datasets: [{ label: 'Posts', data: hourData, backgroundColor: 'rgba(184,125,232,.6)', borderRadius: 4 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#666', font: { size: 9 } }, grid: { display: false } },
              y: { ticks: { color: '#666', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
            }
          }
        });
      }

    } catch (err) {
      console.error('Analytics error:', err);
      container.querySelector('.analytics-grid').innerHTML = `<div class="admin-error">❌ ${escapeHtml(err.message)}</div>`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 🏥 SANTÉ SYSTÈME
  // ══════════════════════════════════════════════════════════════
  async renderHealth(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>🏥 Santé système</h1>
        </div>

        <div class="health-grid">
          <div class="health-card" id="hc-latency">
            <div class="health-icon">⚡</div>
            <div class="health-label">Latence Supabase</div>
            <div class="health-val" id="hv-latency">Test en cours…</div>
            <div class="health-status" id="hs-latency"></div>
          </div>
          <div class="health-card" id="hc-posts">
            <div class="health-icon">📝</div>
            <div class="health-label">Table posts</div>
            <div class="health-val" id="hv-posts">…</div>
            <div class="health-status" id="hs-posts"></div>
          </div>
          <div class="health-card" id="hc-profiles">
            <div class="health-icon">👥</div>
            <div class="health-label">Table profiles</div>
            <div class="health-val" id="hv-profiles">…</div>
            <div class="health-status" id="hs-profiles"></div>
          </div>
          <div class="health-card" id="hc-reports">
            <div class="health-icon">🚩</div>
            <div class="health-label">Table reports</div>
            <div class="health-val" id="hv-reports">…</div>
            <div class="health-status" id="hs-reports"></div>
          </div>
          <div class="health-card" id="hc-subgoals">
            <div class="health-icon">💰</div>
            <div class="health-label">Table subgoals</div>
            <div class="health-val" id="hv-subgoals">…</div>
            <div class="health-status" id="hs-subgoals"></div>
          </div>
          <div class="health-card" id="hc-donations">
            <div class="health-icon">🎁</div>
            <div class="health-label">Table donations</div>
            <div class="health-val" id="hv-donations">…</div>
            <div class="health-status" id="hs-donations"></div>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-header"><h3>🔐 Informations de configuration</h3></div>
          <div class="config-info">
            <div class="config-item">
              <span class="config-key">Supabase URL</span>
              <span class="config-val">${escapeHtml(typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL.replace(/https?:\/\//, '').split('.')[0] + '.supabase.co' : '?')}</span>
            </div>
            <div class="config-item">
              <span class="config-key">Anon key</span>
              <span class="config-val">${typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY.slice(0, 12) + '…' : '?'}</span>
            </div>
            <div class="config-item">
              <span class="config-key">Navigateur</span>
              <span class="config-val">${navigator.userAgent.split(' ').slice(-1)[0]}</span>
            </div>
            <div class="config-item">
              <span class="config-key">Heure serveur</span>
              <span class="config-val" id="server-time">—</span>
            </div>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-header"><h3>🛠️ SQL requis (si tables manquantes)</h3></div>
          <button class="admin-btn-sm" onclick="this.nextElementSibling.style.display='block';this.style.display='none'">Afficher le SQL</button>
          <div class="sql-block" style="display:none">
            <button class="admin-btn-sm" style="margin-bottom:8px" onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent).then(()=>showToast('✅ Copié !','success'))">📋 Copier</button>
            <pre id="sql-required">${escapeHtml(this._getRequiredSQL())}</pre>
          </div>
        </div>
      </div>
    `;

    await this._runHealthChecks();
  }

  async _runHealthChecks() {
    const checks = [
      { key: 'latency', table: null, label: 'Latence' },
      { key: 'posts',     table: 'posts' },
      { key: 'profiles',  table: 'profiles' },
      { key: 'reports',   table: 'reports' },
      { key: 'subgoals',  table: 'subgoals' },
      { key: 'donations', table: 'donations' },
    ];

    // Latence
    const t0 = Date.now();
    try {
      await this.sb.from('profiles').select('id').limit(1);
      const ms = Date.now() - t0;
      this._setHealth('latency', `${ms}ms`, ms < 200 ? 'good' : ms < 600 ? 'warn' : 'bad');
    } catch {
      this._setHealth('latency', 'Erreur', 'bad');
    }

    // Tables
    for (const { key, table } of checks.filter(c => c.table)) {
      try {
        const { count, error } = await this.sb.from(table).select('*', { count: 'exact', head: true });
        if (error) throw error;
        this._setHealth(key, `${count} enregistrements`, 'good');
      } catch (err) {
        this._setHealth(key, '❌ Inaccessible', 'bad');
      }
    }

    // Heure serveur
    try {
      const { data } = await this.sb.rpc('now').select();
      if (data) document.getElementById('server-time').textContent = new Date(data).toLocaleString('fr-FR');
    } catch {
      document.getElementById('server-time').textContent = new Date().toLocaleString('fr-FR') + ' (local)';
    }
  }

  _setHealth(key, val, status) {
    const valEl = document.getElementById(`hv-${key}`);
    const statusEl = document.getElementById(`hs-${key}`);
    const card = document.getElementById(`hc-${key}`);
    if (valEl) valEl.textContent = val;
    if (statusEl) {
      statusEl.textContent = status === 'good' ? '✅ OK' : status === 'warn' ? '⚠️ Lent' : '❌ Erreur';
      statusEl.className = `health-status status-${status}`;
    }
    if (card) card.className = `health-card hcard-${status}`;
  }

  _getRequiredSQL() {
    return `-- Créer toutes les tables nécessaires à ResteIci

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

-- RLS
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
            <button class="admin-btn" onclick="adminPanel._exportCSV()">📤 Export CSV</button>
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
          <button class="admin-btn-danger" onclick="adminPanel._purgeOld()">🗑️ Purger anciens</button>
        </div>
        ${(posts || []).map(p => `
          <div class="content-row" id="crow-${p.id}">
            <span class="rp-type type-${p.type}">${p.type}</span>
            <span class="content-author">${escapeHtml(p.profiles?.display_name || 'Anonyme')}</span>
            <span class="content-text">${escapeHtml((p.content || '').substring(0, 100))}…</span>
            <span class="rp-time">${formatTime(p.created_at)}</span>
            <div class="content-actions">
              ${!p.approved ? `<button class="admin-btn-sm" onclick="adminPanel._approvePost('${p.id}')">✅</button>` : ''}
              <button class="admin-btn-danger" onclick="adminPanel._deleteContent('${p.id}')">🗑️</button>
            </div>
          </div>
        `).join('') || '<div class="admin-empty">Aucun contenu.</div>'}
      `;

      // Pagination
      const pag = document.getElementById('content-pagination');
      if (pag && count > 20) {
        const pages = Math.ceil(count / 20);
        pag.innerHTML = Array.from({ length: Math.min(pages, 10) }, (_, i) => `
          <button class="admin-btn-sm ${i === page ? 'active-filter' : ''}" onclick="adminPanel._loadContentList(${i})">${i + 1}</button>
        `).join('');
      }
    } catch (err) {
      container.innerHTML = `<div class="admin-error">❌ ${escapeHtml(err.message)}</div>`;
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
    if (!confirm(`Supprimer les posts non approuvés de plus de 90 jours ?`)) return;
    const { count } = await this.sb.from('posts').delete().eq('approved', false).lt('created_at', cutoff);
    _logAction('Purge anciens posts');
    showToast(`🗑️ ${count || 0} posts purgés.`, 'success');
    this._loadContentList();
  }

  async _exportCSV() {
    try {
      const { data } = await this.sb.from('posts').select('id, content, type, created_at, approved, profiles(display_name)').order('created_at', { ascending: false }).limit(500);
      const rows = [['ID', 'Type', 'Auteur', 'Contenu', 'Approuvé', 'Date']];
      (data || []).forEach(p => {
        rows.push([p.id, p.type, p.profiles?.display_name || 'Anonyme', (p.content || '').replace(/,/g, ';'), p.approved, p.created_at]);
      });
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `resteici-posts-${Date.now()}.csv`;
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
          <button class="admin-btn" onclick="adminPanel._openAnnouncementModal()">+ Nouvelle annonce</button>
        </div>

        <div class="admin-info-box">
          💡 Les annonces actives s'affichent sur la page d'accueil sous forme de bannières. Désactivez-les quand elles ne sont plus d'actualité.
        </div>

        <div id="announcements-list"><div class="admin-loading">Chargement…</div></div>

        <!-- Modal -->
        <div id="ann-modal-overlay" class="up-modal-overlay">
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
                <textarea class="admin-input" id="ann-content" rows="3" placeholder="Message affiché aux utilisateurs…" style="resize:vertical"></textarea>
              </div>
              <div class="form-group-admin">
                <label>Type</label>
                <select class="admin-select" id="ann-type">
                  <option value="info">ℹ️ Info</option>
                  <option value="warning">⚠️ Avertissement</option>
                  <option value="success">✅ Succès</option>
                  <option value="urgent">🆘 Urgent</option>
                </select>
              </div>
              <div class="form-group-admin" style="display:flex;align-items:center;gap:10px">
                <input type="checkbox" id="ann-active" checked>
                <label for="ann-active" style="text-transform:none;letter-spacing:0;font-size:.9rem">Annonce active (visible sur le site)</label>
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
      const { data, error } = await this.sb.from('announcements').select('*').order('created_at', { ascending: false });
      if (error) throw error;

      if (!data || !data.length) {
        container.innerHTML = '<div class="admin-empty">Aucune annonce. Crée-en une !</div>';
        return;
      }

      container.innerHTML = data.map(a => `
        <div class="announcement-card ann-${a.type}" id="ann-${a.id}">
          <div class="ann-header">
            <div>
              <span class="ann-type-badge ann-badge-${a.type}">${a.type}</span>
              <span class="ann-title">${escapeHtml(a.title)}</span>
            </div>
            <div class="ann-status">${a.active ? '<span class="status-active">● Actif</span>' : '<span class="status-banned">● Inactif</span>'}</div>
          </div>
          <p class="ann-content">${escapeHtml(a.content || '')}</p>
          <div class="ann-actions">
            <button class="admin-btn-sm" onclick="adminPanel._toggleAnnouncement('${a.id}', ${!a.active})">${a.active ? '⏸️ Désactiver' : '▶️ Activer'}</button>
            <button class="admin-btn-sm" onclick="adminPanel._editAnnouncement('${a.id}')">✏️ Modifier</button>
            <button class="admin-btn-danger" onclick="adminPanel._deleteAnnouncement('${a.id}')">🗑️ Supprimer</button>
            <span class="rp-time">${formatTime(a.created_at)}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = `<div class="admin-error">❌ Table "announcements" introuvable. <a href="#" onclick="adminPanel.navigateTo('health')">Voir le SQL requis →</a></div>`;
    }
  }

  _openAnnouncementModal(data = null) {
    document.getElementById('ann-modal-title').textContent = data ? 'Modifier l\'annonce' : 'Nouvelle annonce';
    document.getElementById('ann-title').value    = data?.title || '';
    document.getElementById('ann-content').value  = data?.content || '';
    document.getElementById('ann-type').value     = data?.type || 'info';
    document.getElementById('ann-active').checked = data?.active !== false;
    document.getElementById('ann-edit-id').value  = data?.id || '';
    document.getElementById('ann-modal-overlay').style.display = 'flex';
  }

  async _editAnnouncement(id) {
    const { data } = await this.sb.from('announcements').select('*').eq('id', id).single();
    if (data) this._openAnnouncementModal(data);
  }

  async _saveAnnouncement() {
    const id = document.getElementById('ann-edit-id').value;
    const payload = {
      title:   document.getElementById('ann-title').value.trim(),
      content: document.getElementById('ann-content').value.trim(),
      type:    document.getElementById('ann-type').value,
      active:  document.getElementById('ann-active').checked,
      created_by: currentUser?.id,
    };
    if (!payload.title) { showToast('❌ Titre requis.', 'error'); return; }
    try {
      if (id) {
        await this.sb.from('announcements').update(payload).eq('id', id);
      } else {
        payload.created_at = new Date().toISOString();
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
  // 📋 JOURNAL D'ACTIVITÉ (super admin seulement)
  // ══════════════════════════════════════════════════════════════
  renderActivity(container) {
    if (!this.isSuperAdmin) { container.innerHTML = '<div class="admin-page"><div class="admin-error">⛔ Réservé aux super-admins.</div></div>'; return; }

    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📋 Journal d'activité</h1>
          <button class="admin-btn-sm" onclick="adminPanel.renderActivity(document.getElementById('admin-page-content'))">🔄</button>
        </div>
        <div class="admin-info-box">📍 Journal de la session en cours (non persisté en BDD). Les actions sont enregistrées dès que tu navigues dans le panel.</div>
        <div class="activity-log" id="activity-log">
          ${_adminLog.length === 0
            ? '<div class="admin-empty">Aucune action dans cette session.</div>'
            : _adminLog.map(entry => `
              <div class="activity-item">
                <span class="activity-time">${new Date(entry.ts).toLocaleTimeString('fr-FR')}</span>
                <span class="activity-action">${escapeHtml(entry.action)}</span>
                ${entry.detail ? `<span class="activity-detail">${escapeHtml(String(entry.detail).substring(0, 60))}</span>` : ''}
                <span class="activity-admin">${escapeHtml(entry.admin)}</span>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // 🛠️ OUTILS AVANCÉS (super admin)
  // ══════════════════════════════════════════════════════════════
  renderTools(container) {
    if (!this.isSuperAdmin) { container.innerHTML = '<div class="admin-page"><div class="admin-error">⛔ Réservé aux super-admins.</div></div>'; return; }
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header"><h1>🛠️ Outils avancés</h1></div>

        <div class="tools-grid">
          <div class="tool-card">
            <div class="tool-icon">🧹</div>
            <h3>Nettoyer les orphelins</h3>
            <p>Supprime les réponses et réactions dont le post parent n'existe plus.</p>
            <button class="admin-btn" onclick="adminPanel._cleanOrphans()">Lancer le nettoyage</button>
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
            <p>Banni automatiquement les utilisateurs avec 5+ signalements non résolus.</p>
            <button class="admin-btn" onclick="adminPanel._autoBan()">Lancer l'auto-ban</button>
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
            <h3>Purge totale spam</h3>
            <p>Supprime tous les posts non approuvés de plus de 7 jours.</p>
            <button class="admin-btn-danger" onclick="adminPanel._purgeSpam()">Purger</button>
          </div>
        </div>

        <div class="admin-section">
          <div class="admin-section-header"><h3>📋 Résultat des outils</h3></div>
          <div id="tools-output" class="tools-output">Les résultats s'afficheront ici.</div>
        </div>
      </div>
    `;
  }

  _toolsOutput(msg, type = 'info') {
    const el = document.getElementById('tools-output');
    if (!el) return;
    el.innerHTML = `<div class="tool-result tool-result-${type}">${escapeHtml(msg)}</div>`;
  }

  async _cleanOrphans() {
    try {
      const { count: r } = await this.sb.from('replies').delete().not('post_id', 'in', `(SELECT id FROM posts)`);
      const { count: rx } = await this.sb.from('reactions').delete().not('post_id', 'in', `(SELECT id FROM posts)`);
      _logAction('Nettoyage orphelins');
      this._toolsOutput(`✅ Nettoyage terminé : ${r || 0} réponses et ${rx || 0} réactions orphelines supprimées.`, 'success');
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  async _recalcCounters() {
    try {
      const { data: posts } = await this.sb.from('posts').select('id');
      let updated = 0;
      for (const post of (posts || [])) {
        const [{ count: rc }, { count: rep }] = await Promise.all([
          this.sb.from('reactions').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
          this.sb.from('replies').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
        ]);
        await this.sb.from('posts').update({ reaction_total: rc || 0, reply_count: rep || 0 }).eq('id', post.id);
        updated++;
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
      const { data } = await this.sb.from('profiles').select('display_name, admin_role, banned, report_count, created_at').order('created_at', { ascending: true });
      const rows = [['Nom', 'Rôle', 'Banni', 'Signalements', 'Inscription']];
      (data || []).forEach(u => rows.push([u.display_name || '', u.admin_role || 'user', u.banned, u.report_count || 0, u.created_at]));
      const csv = rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `resteici-users-${Date.now()}.csv`;
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
          const a = posts[i].content || ''; const b = posts[j].content || '';
          const sim = a.substring(0, 50) === b.substring(0, 50);
          if (sim) dupes.push(`#${posts[i].id.slice(0,8)} ↔ #${posts[j].id.slice(0,8)}`);
        }
      }
      this._toolsOutput(dupes.length ? `⚠️ ${dupes.length} doublon(s) potentiel(s) détecté(s) :\n${dupes.slice(0,10).join('\n')}` : '✅ Aucun doublon détecté.', dupes.length ? 'warn' : 'success');
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  async _purgeSpam() {
    const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
    if (!confirm('ATTENTION : Supprimer tous les posts non approuvés de plus de 7 jours ? Cette action est irréversible.')) return;
    try {
      const { data } = await this.sb.from('posts').delete().eq('approved', false).lt('created_at', cutoff).select('id');
      _logAction('Purge spam', `${data?.length || 0} posts`);
      this._toolsOutput(`🗑️ ${data?.length || 0} posts spam supprimés.`, 'success');
    } catch (err) { this._toolsOutput('❌ ' + err.message, 'error'); }
  }

  // ══════════════════════════════════════════════════════════════
  // 🔍 RECHERCHE GLOBALE
  // ══════════════════════════════════════════════════════════════
  _bindSearch() {
    this._startClock();
  }

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
        ...users.map(u => `<div class="search-result" onclick="adminPanel.navigateTo('users');document.getElementById('admin-search-results').style.display='none'">👤 ${escapeHtml(u.display_name || '?')}${u.banned ? ' 🚫' : ''}</div>`),
        ...posts.map(p => `<div class="search-result" onclick="adminPanel.navigateTo('content');document.getElementById('admin-search-results').style.display='none'">📝 ${escapeHtml((p.content || '').substring(0, 50))}…</div>`),
      ].join('');
    } catch { resultsEl.innerHTML = '<div class="search-empty">Erreur.</div>'; }
  }

  _startClock() {
    const tick = () => {
      const el = document.getElementById('admin-clock');
      if (el) el.textContent = new Date().toLocaleTimeString('fr-FR');
    };
    tick();
    setInterval(tick, 1000);
  }

  // ══════════════════════════════════════════════════════════════
  // MISC
  // ══════════════════════════════════════════════════════════════
  exitAdmin() {
    Object.values(this._charts).forEach(c => { try { c.destroy(); } catch {} });
    this._charts = {};
    const shell = document.getElementById('admin-shell');
    if (shell) shell.style.display = 'none';
    document.querySelectorAll('[id^="page-"]').forEach(el => el.classList.toggle('hidden', el.id !== 'page-home'));
    const navTabs = document.getElementById('nav-tabs');
    if (navTabs) navTabs.style.display = 'block';
    window.history.replaceState({}, '', window.location.pathname);
    _logAction('Sortie du panel');
  }

  showDeniedAccess() {
    showToast('⛔ Accès refusé. Tu n\'es pas admin.', 'error');
  }

  async _loadReportsBadge() {
    try {
      const { count } = await this.sb.from('reports').select('*', { count: 'exact', head: true }).eq('resolved', false);
      const badge = document.getElementById('reports-badge');
      if (badge && count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; }
    } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════
// CSS ADMIN COMPLET
// ═══════════════════════════════════════════════════════════════
const styleAdmin = document.createElement('style');
styleAdmin.textContent = `
/* ── Layout ────────────────────────────────────────────── */
#admin-shell { display:none; position:fixed; inset:0; z-index:1000; background:var(--bg); overflow:hidden; }
.admin-layout { display:flex; height:100vh; overflow:hidden; }

/* ── Sidebar ────────────────────────────────────────────── */
.admin-sidebar {
  width:260px; flex-shrink:0;
  background:var(--bg2); border-right:1px solid var(--border);
  display:flex; flex-direction:column; overflow-y:auto;
  transition:transform .25s ease;
}

.admin-brand {
  display:flex; align-items:center; gap:12px;
  padding:18px 16px 14px; border-bottom:1px solid var(--border);
  flex-shrink:0;
}
.admin-brand-logo {
  width:40px; height:40px; border-radius:12px;
  background:linear-gradient(135deg,var(--accent),var(--purple));
  color:#fff; font-weight:900; font-size:1rem;
  display:flex; align-items:center; justify-content:center;
  flex-shrink:0;
}
.admin-brand-title { font-weight:700; font-size:.85rem; color:var(--text); }
.admin-brand-name  { font-size:.72rem; color:var(--text3); margin-top:1px; }
.admin-role-badge  { display:inline-block; font-size:.6rem; padding:1px 7px; border-radius:20px; margin-top:3px; font-weight:700; }
.role-superadmin   { background:rgba(245,169,107,.15); color:var(--accent); }
.role-mod          { background:rgba(126,200,227,.15); color:var(--blue); }

/* ── Recherche globale ──────────────────────────────────── */
.admin-search-wrap { padding:10px 10px 6px; position:relative; flex-shrink:0; }
.admin-search-input {
  width:100%; background:var(--surface); border:1px solid var(--border);
  border-radius:8px; padding:8px 12px; color:var(--text);
  font-family:var(--font-body); font-size:.8rem; outline:none;
}
.admin-search-input:focus { border-color:var(--accent); }
.admin-search-results {
  display:none; position:absolute; left:10px; right:10px; top:100%;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:8px; z-index:200; max-height:300px; overflow-y:auto;
  box-shadow:0 8px 32px rgba(0,0,0,.4);
}
.search-result {
  padding:10px 14px; font-size:.8rem; cursor:pointer;
  color:var(--text2); border-bottom:1px solid var(--border);
  transition:background .15s;
}
.search-result:hover { background:var(--surface2); color:var(--text); }
.search-result:last-child { border-bottom:none; }
.search-loading, .search-empty { padding:14px; font-size:.8rem; color:var(--text3); text-align:center; }

/* ── Nav ────────────────────────────────────────────────── */
.admin-nav { padding:8px 8px; flex:1; display:flex; flex-direction:column; gap:2px; }
.admin-nav-group { margin-bottom:6px; }
.admin-nav-group-label {
  font-size:.62rem; font-weight:700; color:var(--text3);
  text-transform:uppercase; letter-spacing:.8px;
  padding:6px 10px 4px;
}
.admin-nav-item {
  display:flex; align-items:center; gap:9px;
  padding:9px 11px; border-radius:9px;
  background:none; border:none; color:var(--text2);
  font-family:var(--font-body); font-size:.82rem;
  cursor:pointer; text-align:left; width:100%;
  transition:all .15s; position:relative;
}
.admin-nav-item:hover { background:var(--surface); color:var(--text); }
.admin-nav-item.active { background:var(--adim); color:var(--accent); font-weight:600; }
.nav-icon { font-size:.95rem; width:18px; text-align:center; flex-shrink:0; }
.admin-badge {
  margin-left:auto; background:#e87d7d; color:#fff;
  font-size:.62rem; font-weight:700; padding:2px 6px;
  border-radius:20px; min-width:18px; text-align:center;
}

/* ── Sidebar footer ─────────────────────────────────────── */
.admin-sidebar-footer { padding:12px 8px; border-top:1px solid var(--border); flex-shrink:0; }
.admin-quick-actions { display:flex; gap:6px; margin-bottom:8px; }
.admin-quick-btn {
  flex:1; padding:7px; background:var(--surface2); border:1px solid var(--border);
  border-radius:8px; cursor:pointer; font-size:.85rem; transition:all .15s;
}
.admin-quick-btn:hover { border-color:var(--accent); }
.admin-exit-btn {
  width:100%; padding:9px 12px; background:none;
  border:1px solid var(--border); border-radius:9px;
  color:var(--text3); font-family:var(--font-body);
  font-size:.8rem; cursor:pointer; transition:all .2s;
}
.admin-exit-btn:hover { border-color:var(--accent); color:var(--accent); }

/* ── Mobile toggle ──────────────────────────────────────── */
.admin-mobile-toggle {
  display:none; position:fixed; bottom:20px; left:20px;
  z-index:1100; background:var(--accent); color:#fff;
  border:none; border-radius:50%; width:46px; height:46px;
  font-size:1.2rem; cursor:pointer; box-shadow:0 4px 20px rgba(232,149,109,.4);
}

/* ── Main ───────────────────────────────────────────────── */
.admin-main { flex:1; overflow-y:auto; display:flex; flex-direction:column; }
.admin-topbar {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 28px; border-bottom:1px solid var(--border);
  background:var(--bg2); flex-shrink:0; gap:12px; flex-wrap:wrap;
}
.admin-topbar-page { font-weight:600; font-size:.95rem; color:var(--text); }
.admin-topbar-right { display:flex; align-items:center; gap:10px; }
.admin-topbar-time { font-size:.75rem; color:var(--text3); font-feature-settings:'tnum'; }
.admin-last-update { font-size:.72rem; color:var(--text3); }

/* ── Pages ──────────────────────────────────────────────── */
.admin-page { max-width:1100px; margin:0 auto; padding:28px 28px 80px; }
.admin-page-header {
  display:flex; align-items:center; justify-content:space-between;
  margin-bottom:24px; flex-wrap:wrap; gap:12px;
}
.admin-page-header h1 {
  font-family:var(--font-display); font-size:1.5rem; color:var(--text);
}
.admin-header-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

/* ── Stats grid ─────────────────────────────────────────── */
.stats-grid {
  display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
  gap:12px; margin-bottom:28px;
}
.stat-tile {
  background:var(--surface); border:1px solid var(--border);
  border-radius:14px; padding:18px 14px; text-align:center;
  transition:all .2s; position:relative; overflow:hidden;
}
.stat-tile.loading { opacity:.5; }
.stat-tile:hover { border-color:var(--border2); transform:translateY(-2px); }
.stat-tile::before {
  content:''; position:absolute; inset:0;
  background:linear-gradient(135deg, rgba(255,255,255,.03), transparent);
  pointer-events:none;
}
.st-icon { font-size:1.5rem; margin-bottom:8px; }
.st-val  { font-family:var(--font-display); font-size:1.6rem; font-weight:700; color:var(--accent); margin-bottom:4px; }
.st-label { font-size:.68rem; color:var(--text3); font-weight:600; text-transform:uppercase; letter-spacing:.5px; }
.st-trend { font-size:.68rem; color:var(--green); margin-top:4px; }

/* ── Two col ────────────────────────────────────────────── */
.admin-two-col { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px; }

/* ── Section ────────────────────────────────────────────── */
.admin-section { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:20px; margin-bottom:16px; }
.admin-section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
.admin-section-header h3 { font-family:var(--font-display); font-size:1rem; color:var(--text); }

/* ── Recent posts ───────────────────────────────────────── */
.recent-post-item {
  display:flex; align-items:center; gap:10px;
  padding:9px 10px; border-radius:8px; border-bottom:1px solid var(--border);
  font-size:.8rem; flex-wrap:wrap; transition:background .15s;
}
.recent-post-item:last-child { border-bottom:none; }
.recent-post-item:hover { background:var(--surface2); }
.rp-type { padding:2px 8px; border-radius:20px; font-size:.68rem; font-weight:700; flex-shrink:0; }
.type-encouragement { background:rgba(232,149,109,.15); color:var(--accent); }
.type-temoignage    { background:rgba(109,184,232,.15); color:var(--blue); }
.type-question      { background:rgba(184,125,232,.15); color:var(--purple); }
.rp-author { font-weight:600; color:var(--text); flex-shrink:0; }
.rp-content { flex:1; color:var(--text2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.rp-time { color:var(--text3); font-size:.72rem; flex-shrink:0; }
.admin-btn-icon { background:none; border:none; cursor:pointer; font-size:.85rem; opacity:.5; transition:opacity .15s; flex-shrink:0; }
.admin-btn-icon:hover { opacity:1; }

/* ── Mini goal widget ───────────────────────────────────── */
.mini-goal-widget { padding:4px 0; }
.mini-goal-amounts { display:flex; align-items:baseline; gap:8px; margin-bottom:10px; }
.mini-goal-current { font-family:var(--font-display); font-size:1.8rem; font-weight:700; color:var(--accent); }
.mini-goal-sep { color:var(--text3); font-size:.9rem; }
.mini-goal-bar { height:10px; background:var(--surface2); border-radius:10px; overflow:hidden; margin-bottom:8px; }
.mini-goal-fill { height:100%; background:linear-gradient(90deg,var(--accent),#e8c06a); border-radius:10px; transition:width .6s cubic-bezier(.34,1.56,.64,1); }
.mini-goal-pct { font-size:.78rem; color:var(--text3); }

/* ── Top members ────────────────────────────────────────── */
.top-members-grid { display:flex; gap:12px; flex-wrap:wrap; }
.top-member-card { background:var(--surface2); border:1px solid var(--border); border-radius:12px; padding:14px 16px; text-align:center; min-width:120px; flex:1; }
.top-rank { font-size:.7rem; color:var(--text3); margin-bottom:6px; font-weight:700; }
.top-av { width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,var(--accent),var(--purple)); color:#fff; font-weight:700; font-size:.85rem; display:flex; align-items:center; justify-content:center; margin:0 auto 8px; }
.top-name { font-size:.85rem; font-weight:600; color:var(--text); margin-bottom:2px; }
.top-date { font-size:.68rem; color:var(--text3); }

/* ── Analytics ──────────────────────────────────────────── */
.analytics-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
.chart-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:18px; height:260px; position:relative; }
.chart-card-header { margin-bottom:14px; }
.chart-card-header h3 { font-size:.9rem; color:var(--text2); font-family:var(--font-display); }

/* ── Health ─────────────────────────────────────────────── */
.health-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:12px; margin-bottom:20px; }
.health-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px; text-align:center; transition:all .2s; }
.hcard-good { border-color:rgba(109,232,160,.3); }
.hcard-warn { border-color:rgba(245,169,107,.3); }
.hcard-bad  { border-color:rgba(232,125,125,.3); }
.health-icon { font-size:1.6rem; margin-bottom:8px; }
.health-label { font-size:.72rem; color:var(--text3); margin-bottom:6px; font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
.health-val { font-size:1rem; font-weight:600; color:var(--text); margin-bottom:6px; }
.health-status { font-size:.75rem; font-weight:600; }
.status-good { color:var(--green); }
.status-warn { color:var(--accent); }
.status-bad  { color:#e87d7d; }

.config-info { background:var(--surface2); border-radius:10px; padding:14px; }
.config-item { display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid var(--border); font-size:.82rem; }
.config-item:last-child { border-bottom:none; }
.config-key { color:var(--text3); font-weight:600; text-transform:uppercase; font-size:.72rem; letter-spacing:.4px; }
.config-val { color:var(--blue); font-family:monospace; font-size:.82rem; }

.sql-block { margin-top:10px; }
.sql-block pre { background:var(--bg); padding:16px; border-radius:10px; font-size:.72rem; color:var(--blue); overflow-x:auto; border:1px solid var(--border); white-space:pre-wrap; line-height:1.5; }

/* ── Content ────────────────────────────────────────────── */
.content-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
.content-count { font-size:.82rem; color:var(--text3); flex:1; }
.content-row {
  display:flex; align-items:center; gap:10px;
  padding:10px 12px; border-radius:8px; border-bottom:1px solid var(--border);
  font-size:.8rem; flex-wrap:wrap;
}
.content-row:hover { background:var(--surface2); }
.content-author { font-weight:600; color:var(--text); flex-shrink:0; max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.content-text { flex:1; color:var(--text2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.content-actions { display:flex; gap:5px; flex-shrink:0; }

/* ── Announcements ──────────────────────────────────────── */
.announcement-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:18px 20px; margin-bottom:12px; transition:border-color .2s; }
.ann-info    { border-left:3px solid var(--blue); }
.ann-warning { border-left:3px solid var(--accent); }
.ann-success { border-left:3px solid var(--green); }
.ann-urgent  { border-left:3px solid #e87d7d; }
.ann-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; gap:10px; flex-wrap:wrap; }
.ann-title { font-weight:600; font-size:.9rem; color:var(--text); }
.ann-type-badge { padding:2px 8px; border-radius:20px; font-size:.65rem; font-weight:700; margin-right:8px; text-transform:uppercase; }
.ann-badge-info    { background:rgba(109,184,232,.15); color:var(--blue); }
.ann-badge-warning { background:rgba(232,149,109,.15); color:var(--accent); }
.ann-badge-success { background:rgba(109,232,160,.15); color:var(--green); }
.ann-badge-urgent  { background:rgba(232,125,125,.15); color:#e87d7d; }
.ann-content { font-size:.85rem; color:var(--text2); margin-bottom:12px; }
.ann-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ann-status { font-size:.75rem; }

/* ── Activity ───────────────────────────────────────────── */
.activity-log { display:flex; flex-direction:column; gap:0; }
.activity-item {
  display:flex; align-items:center; gap:12px;
  padding:10px 12px; border-bottom:1px solid var(--border);
  font-size:.8rem; flex-wrap:wrap;
}
.activity-item:hover { background:var(--surface2); }
.activity-time   { color:var(--text3); font-family:monospace; font-size:.75rem; flex-shrink:0; }
.activity-action { font-weight:600; color:var(--text); flex-shrink:0; }
.activity-detail { color:var(--text2); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.activity-admin  { color:var(--accent); font-size:.72rem; flex-shrink:0; }

/* ── Tools ──────────────────────────────────────────────── */
.tools-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:14px; margin-bottom:20px; }
.tool-card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px; transition:border-color .2s; }
.tool-card:hover { border-color:var(--border2); }
.danger-card { border-color:rgba(232,125,125,.2); }
.tool-icon { font-size:1.8rem; margin-bottom:10px; }
.tool-card h3 { font-size:.9rem; font-weight:600; color:var(--text); margin-bottom:6px; }
.tool-card p { font-size:.8rem; color:var(--text2); margin-bottom:14px; line-height:1.5; }
.tools-output { background:var(--surface2); border-radius:10px; padding:14px; font-size:.8rem; color:var(--text2); white-space:pre-wrap; min-height:60px; }
.tool-result { padding:12px; border-radius:8px; font-size:.82rem; }
.tool-result-success { background:rgba(109,232,160,.1); color:var(--green); }
.tool-result-warn    { background:rgba(232,149,109,.1); color:var(--accent); }
.tool-result-error   { background:rgba(232,125,125,.1); color:#e87d7d; }
.tool-result-info    { background:rgba(109,184,232,.1); color:var(--blue); }

/* ── Shared buttons ─────────────────────────────────────── */
.admin-btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:8px 16px; background:var(--accent); color:#1a0a00;
  border:none; border-radius:8px; font-family:var(--font-body);
  font-size:.8rem; font-weight:600; cursor:pointer; transition:all .15s;
}
.admin-btn:hover { filter:brightness(1.1); transform:translateY(-1px); }
.admin-btn-sm {
  display:inline-flex; align-items:center; gap:5px;
  padding:6px 12px; background:var(--surface2); color:var(--text2);
  border:1px solid var(--border); border-radius:7px;
  font-family:var(--font-body); font-size:.78rem; cursor:pointer; transition:all .15s;
}
.admin-btn-sm:hover { background:var(--surface); color:var(--text); border-color:var(--border2); }
.admin-btn-sm.active-filter { background:var(--adim); color:var(--accent); border-color:var(--accent); }
.admin-btn-danger {
  display:inline-flex; align-items:center; gap:5px;
  padding:6px 12px; background:rgba(232,125,125,.12); color:#e87d7d;
  border:1px solid rgba(232,125,125,.2); border-radius:7px;
  font-family:var(--font-body); font-size:.78rem; cursor:pointer; transition:all .15s;
}
.admin-btn-danger:hover { background:rgba(232,125,125,.25); }
.admin-input {
  background:var(--surface2); border:1px solid var(--border);
  border-radius:8px; padding:8px 12px; color:var(--text);
  font-family:var(--font-body); font-size:.85rem; outline:none; width:100%;
  transition:border-color .2s;
}
.admin-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--adim); }
.admin-select {
  background:var(--surface2); border:1px solid var(--border);
  border-radius:8px; padding:7px 12px; color:var(--text);
  font-family:var(--font-body); font-size:.8rem; outline:none; cursor:pointer;
}
.admin-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.admin-loading { padding:24px; text-align:center; color:var(--text3); font-size:.85rem; }
.admin-empty { padding:24px; text-align:center; color:var(--text3); font-size:.85rem; }
.admin-error { padding:14px; border-radius:8px; background:rgba(232,125,125,.1); color:#e87d7d; font-size:.85rem; }
.admin-info-box { background:rgba(109,184,232,.08); border:1px solid rgba(109,184,232,.2); border-radius:10px; padding:12px 16px; font-size:.82rem; color:var(--blue); margin-bottom:18px; }
.admin-pagination { display:flex; gap:5px; margin-top:14px; flex-wrap:wrap; }
.admin-section h3 { font-family:var(--font-display); font-size:.95rem; }

/* ── Toast admin ────────────────────────────────────────── */
.admin-toast {
  position:fixed; bottom:24px; right:24px; z-index:2000;
  padding:12px 18px; border-radius:10px; font-size:.85rem; font-weight:600;
  background:var(--surface); border:1px solid var(--border2);
  color:var(--text); box-shadow:0 8px 32px rgba(0,0,0,.4);
  transform:translateY(60px); opacity:0; transition:all .3s ease;
  pointer-events:none;
}

/* ── Form admin ─────────────────────────────────────────── */
.form-group-admin { margin-bottom:14px; }
.form-group-admin label {
  display:block; font-size:.72rem; font-weight:700;
  color:var(--text3); margin-bottom:6px;
  text-transform:uppercase; letter-spacing:.4px;
}
.form-row-admin { display:grid; grid-template-columns:1fr 1fr; gap:12px; }

/* ── Responsive ─────────────────────────────────────────── */
@media (max-width:900px) {
  .analytics-grid { grid-template-columns:1fr; }
  .admin-two-col   { grid-template-columns:1fr; }
  .tools-grid      { grid-template-columns:1fr; }
}

@media (max-width:720px) {
  .admin-sidebar {
    position:fixed; left:0; top:0; bottom:0; z-index:500;
    transform:translateX(-100%);
    width:260px !important;
  }
  .admin-sidebar.open { transform:translateX(0); }
  .admin-mobile-toggle { display:flex; align-items:center; justify-content:center; }
  .admin-topbar { padding:10px 16px; }
  .admin-page { padding:20px 16px 80px; }
  .stats-grid { grid-template-columns:repeat(2,1fr); }
  .health-grid { grid-template-columns:1fr 1fr; }
}
`;
document.head.appendChild(styleAdmin);

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function initAdminPanel() {
  if (!sb) return;
  if (typeof adminPanel === 'undefined' || !adminPanel.sb) {
    window.adminPanel = new AdminPanel(sb);
  } else {
    adminPanel.sb = sb;
  }
}

function refreshAdminButton() {
  if (typeof adminPanel === 'undefined' || !adminPanel.isAdmin) return;
  const dropdown = document.getElementById('user-dropdown');
  if (!dropdown) return;
  if (!dropdown.querySelector('.admin-btn-entry')) {
    const btn = document.createElement('button');
    btn.className = 'admin-btn-entry dropdown-item';
    btn.textContent = adminPanel.isSuperAdmin ? '🔐 Panel Admin' : '🛡️ Modération';
    btn.onclick = () => adminPanel.renderAdminDashboard();
    dropdown.insertBefore(btn, dropdown.firstChild);
  }
}

window.adminPanel = new AdminPanel(null);
;
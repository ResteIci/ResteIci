// ═══════════════════════════════════════════════════════════════
// Admin Panel — ResteIci
// Navigation principale + page Statistiques
// ═══════════════════════════════════════════════════════════════

const ADMIN_EMAIL_WHITELIST = [
  'ayoubazarrouy@gmail.com',
  // Ajoute tes autres emails admin ici
];

const ADMIN_OVERRIDE_SECRET = 'resteci_admin_access_2026';

// ── Page admin active ─────────────────────────────────────────
let currentAdminPage = 'stats';

class AdminPanel {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.isAdmin = false;
    this.profile = null;
  }

  getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  isAdminOverrideKey() {
    return this.getUrlParam('admin_key') === ADMIN_OVERRIDE_SECRET;
  }

  async checkAdminStatus(userId) {
    const [profileRes, userRes] = await Promise.all([
      this.sb.from('profiles').select('admin_role, banned, display_name').eq('id', userId).single(),
      this.sb.auth.getUser()
    ]);

    this.profile = profileRes.data || {};
    const authEmail = (userRes.data?.user?.email || '').toLowerCase();
    const rawRole = String(this.profile.admin_role || '').replace(/^['"]|['"]$/g, '').trim().toLowerCase();

    this.isAdmin =
      rawRole === 'admin' ||
      rawRole === 'moderator' ||
      ADMIN_EMAIL_WHITELIST.includes(authEmail) ||
      this.isAdminOverrideKey();

    return this.isAdmin;
  }

  async renderAdminDashboard() {
    if (!currentUser) return requireAuth(() => this.renderAdminDashboard());

    const isAdmin = await this.checkAdminStatus(currentUser.id);
    if (!isAdmin) return this.showDeniedAccess();

    // Masque toutes les pages normales, affiche le shell admin
    document.querySelectorAll('[id^="page-"]').forEach(el => el.classList.add('hidden'));

    let shell = document.getElementById('admin-shell');
    if (!shell) {
      shell = document.createElement('div');
      shell.id = 'admin-shell';
      document.body.appendChild(shell);
    }

    shell.style.display = 'block';
    shell.innerHTML = this._shellHTML();
    this.navigateTo('stats');
  }

  _shellHTML() {
    return `
      <div class="admin-layout">
        <!-- Sidebar nav -->
        <aside class="admin-sidebar">
          <div class="admin-brand">
            <span class="admin-brand-icon">🔐</span>
            <div>
              <div class="admin-brand-title">Panel Admin</div>
              <div class="admin-brand-sub">${escapeHtml(this.profile?.display_name || currentUser?.email || 'Admin')}</div>
            </div>
          </div>

          <nav class="admin-nav">
            <button class="admin-nav-item active" data-page="stats" onclick="adminPanel.navigateTo('stats')">
              <span class="nav-icon">📊</span> Statistiques
            </button>
            <button class="admin-nav-item" data-page="moderation" onclick="adminPanel.navigateTo('moderation')">
              <span class="nav-icon">⚠️</span> Signalements
              <span class="admin-badge" id="reports-badge" style="display:none">0</span>
            </button>
            <button class="admin-nav-item" data-page="users" onclick="adminPanel.navigateTo('users')">
              <span class="nav-icon">👥</span> Utilisateurs
            </button>
            <button class="admin-nav-item" data-page="donations" onclick="adminPanel.navigateTo('donations')">
              <span class="nav-icon">💰</span> Dons & Objectifs
            </button>
          </nav>

          <div class="admin-sidebar-footer">
            <button class="admin-exit-btn" onclick="adminPanel.exitAdmin()">← Retour au site</button>
          </div>
        </aside>

        <!-- Main content -->
        <main class="admin-main">
          <div id="admin-page-content"></div>
        </main>
      </div>
    `;
  }

  navigateTo(page) {
    currentAdminPage = page;

    // Update active nav
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });

    const content = document.getElementById('admin-page-content');
    if (!content) return;

    switch (page) {
      case 'stats':      this.renderStats(content); break;
      case 'moderation': adminModeration.render(content); break;
      case 'users':      adminUsers.render(content); break;
      case 'donations':  adminDonations.render(content); break;
    }
  }

  // ── PAGE STATS ────────────────────────────────────────────────
  async renderStats(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📊 Statistiques</h1>
          <button class="admin-btn-sm" onclick="adminPanel.renderStats(document.getElementById('admin-page-content'))">🔄 Rafraîchir</button>
        </div>

        <div class="stats-grid">
          <div class="stat-tile" id="st-users">
            <div class="st-icon">👥</div>
            <div class="st-val">…</div>
            <div class="st-label">Utilisateurs</div>
          </div>
          <div class="stat-tile" id="st-posts">
            <div class="st-icon">📝</div>
            <div class="st-val">…</div>
            <div class="st-label">Posts publiés</div>
          </div>
          <div class="stat-tile" id="st-reports">
            <div class="st-icon">🚩</div>
            <div class="st-val">…</div>
            <div class="st-label">Signalements en attente</div>
          </div>
          <div class="stat-tile" id="st-banned">
            <div class="st-icon">🚫</div>
            <div class="st-val">…</div>
            <div class="st-label">Bannis</div>
          </div>
          <div class="stat-tile" id="st-reactions">
            <div class="st-icon">❤️</div>
            <div class="st-val">…</div>
            <div class="st-label">Réactions totales</div>
          </div>
          <div class="stat-tile" id="st-donations">
            <div class="st-icon">💰</div>
            <div class="st-val">…</div>
            <div class="st-label">Total dons reçus</div>
          </div>
        </div>

        <div class="admin-section">
          <h3>📅 Derniers posts</h3>
          <div id="recent-posts-list"><div class="admin-loading">Chargement…</div></div>
        </div>
      </div>
    `;

    try {
      const [usersRes, postsRes, reportsRes, bannedRes, reactionsRes, donationsRes] = await Promise.all([
        this.sb.from('profiles').select('*', { count: 'exact', head: true }),
        this.sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', true),
        this.sb.from('reports').select('*', { count: 'exact', head: true }).eq('resolved', false),
        this.sb.from('profiles').select('*', { count: 'exact', head: true }).eq('banned', true),
        this.sb.from('reactions').select('*', { count: 'exact', head: true }),
        this.sb.from('subgoals').select('current_amount').eq('id', 1).single()
      ]);

      const set = (id, val) => {
        const tile = document.getElementById(id);
        if (tile) tile.querySelector('.st-val').textContent = val;
      };

      set('st-users',     usersRes.count ?? '?');
      set('st-posts',     postsRes.count ?? '?');
      set('st-reports',   reportsRes.count ?? '?');
      set('st-banned',    bannedRes.count ?? '?');
      set('st-reactions', reactionsRes.count ?? '?');
      set('st-donations', donationsRes.data ? (donationsRes.data.current_amount || 0) + ' €' : '?');

      // Badge signalements dans la sidebar
      const badge = document.getElementById('reports-badge');
      if (badge && reportsRes.count > 0) {
        badge.textContent = reportsRes.count;
        badge.style.display = 'inline-flex';
      }

      // Derniers posts
      const { data: recentPosts } = await this.sb
        .from('posts')
        .select('id, content, type, created_at, profiles(display_name)')
        .order('created_at', { ascending: false })
        .limit(5);

      const listEl = document.getElementById('recent-posts-list');
      if (listEl) {
        listEl.innerHTML = (recentPosts || []).map(p => `
          <div class="recent-post-item">
            <span class="rp-type type-${p.type}">${p.type}</span>
            <span class="rp-author">${escapeHtml(p.profiles?.display_name || 'Anonyme')}</span>
            <span class="rp-content">${escapeHtml((p.content || '').substring(0, 80))}…</span>
            <span class="rp-time">${formatTime(p.created_at)}</span>
          </div>
        `).join('') || '<p class="admin-empty">Aucun post récent.</p>';
      }

    } catch (err) {
      console.error('Stats error:', err);
      container.querySelector('.stats-grid').innerHTML = '<p class="admin-error">❌ Erreur lors du chargement des statistiques.</p>';
    }
  }

  exitAdmin() {
    const shell = document.getElementById('admin-shell');
    if (shell) shell.style.display = 'none';
    document.querySelectorAll('[id^="page-"]').forEach(el => {
      if (el.id === 'page-home') el.classList.remove('hidden');
      else el.classList.add('hidden');
    });
    window.history.pushState({}, '', window.location.pathname);
  }

  showDeniedAccess() {
    showToast('⛔ Accès refusé. Tu n\'es pas admin.', 'error');
  }
}

// ── CSS complet du panel admin ─────────────────────────────────
const styleAdmin = document.createElement('style');
styleAdmin.textContent = `
/* ── Layout ── */
#admin-shell {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: var(--bg);
  overflow: hidden;
}

.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ── Sidebar ── */
.admin-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--bg2);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
}

.admin-brand-icon { font-size: 1.6rem; }
.admin-brand-title { font-weight: 700; font-size: 0.95rem; color: var(--accent); }
.admin-brand-sub { font-size: 0.75rem; color: var(--text3); margin-top: 2px; }

.admin-nav {
  padding: 12px 10px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.admin-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: none;
  border: none;
  color: var(--text2);
  font-family: var(--font-body);
  font-size: 0.875rem;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: all 0.2s;
  position: relative;
}

.admin-nav-item:hover { background: var(--surface); color: var(--text); }
.admin-nav-item.active { background: var(--accent-dim); color: var(--accent); font-weight: 600; }
.nav-icon { font-size: 1rem; width: 20px; text-align: center; }

.admin-badge {
  margin-left: auto;
  background: var(--red, #e07878);
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  min-width: 20px;
  text-align: center;
}

.admin-sidebar-footer {
  padding: 16px 10px;
  border-top: 1px solid var(--border);
}

.admin-exit-btn {
  width: 100%;
  padding: 9px 12px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text3);
  font-family: var(--font-body);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
.admin-exit-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── Main content ── */
.admin-main {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.admin-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 28px 80px;
}

.admin-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.admin-page-header h1 {
  font-family: var(--font-display);
  font-size: 1.6rem;
  color: var(--text);
}

/* ── Stats grid ── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 36px;
}

.stat-tile {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  text-align: center;
  transition: transform 0.2s, border-color 0.2s;
}
.stat-tile:hover { transform: translateY(-3px); border-color: var(--border2); }
.st-icon { font-size: 1.5rem; margin-bottom: 10px; }
.st-val { font-size: 1.6rem; font-weight: 700; color: var(--accent); margin-bottom: 6px; }
.st-label { font-size: 0.75rem; color: var(--text3); text-transform: uppercase; letter-spacing: 0.5px; }

/* ── Sections ── */
.admin-section {
  margin-top: 32px;
}
.admin-section h3 {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}

/* ── Recent posts ── */
.recent-post-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  font-size: 0.85rem;
  border: 1px solid var(--border);
}
.rp-type {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 600;
  flex-shrink: 0;
}
.type-encouragement { background: rgba(245,169,107,0.15); color: var(--accent); }
.type-temoignage { background: rgba(126,200,227,0.15); color: var(--blue); }
.type-question { background: rgba(196,127,181,0.15); color: var(--purple); }
.rp-author { color: var(--text); font-weight: 600; flex-shrink: 0; min-width: 80px; }
.rp-content { color: var(--text2); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-time { color: var(--text3); flex-shrink: 0; font-size: 0.75rem; }

/* ── Boutons ── */
.admin-btn {
  padding: 10px 20px;
  background: var(--accent);
  color: #1a0a00;
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.875rem;
  font-family: var(--font-body);
  transition: all 0.2s;
}
.admin-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(245,169,107,0.3); }

.admin-btn-sm {
  padding: 7px 14px;
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-size: 0.8rem;
  font-family: var(--font-body);
  transition: all 0.2s;
}
.admin-btn-sm:hover { border-color: var(--accent); color: var(--accent); }

.admin-btn-danger {
  padding: 7px 14px;
  background: rgba(224,120,120,0.15);
  color: #e07878;
  border: 1px solid rgba(224,120,120,0.3);
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-size: 0.8rem;
  font-family: var(--font-body);
  transition: all 0.2s;
}
.admin-btn-danger:hover { background: rgba(224,120,120,0.25); }

/* ── Misc ── */
.admin-loading { color: var(--text3); font-size: 0.9rem; padding: 20px 0; text-align: center; }
.admin-empty { color: var(--text3); font-size: 0.875rem; padding: 20px 0; text-align: center; }
.admin-error { color: #e07878; font-size: 0.875rem; padding: 20px 0; text-align: center; }

.admin-input {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 14px;
  color: var(--text);
  font-family: var(--font-body);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.2s;
}
.admin-input:focus { border-color: var(--accent); }

.admin-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .admin-sidebar { width: 60px; }
  .admin-brand-title, .admin-brand-sub, .admin-nav-item span:not(.nav-icon), .admin-exit-btn { display: none; }
  .admin-nav-item { justify-content: center; padding: 12px; }
  .admin-page { padding: 20px 16px 60px; }
}
`;
document.head.appendChild(styleAdmin);

// ── Instance globale ───────────────────────────────────────────
let adminPanel;

function initAdminPanel() {
  if (!adminPanel && typeof sb !== 'undefined' && sb) {
    adminPanel = new AdminPanel(sb);
  }
  if (adminPanel && currentUser) {
    adminPanel.checkAdminStatus(currentUser.id);
  }
}
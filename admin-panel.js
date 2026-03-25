// ═══════════════════════════════════════════════════════════════
// Admin Panel — ResteIci
// ✅ SÉCURISÉ : plus de secret ni d'email hardcodé
// L'accès admin repose exclusivement sur admin_role en BDD (RLS)
// ═══════════════════════════════════════════════════════════════

let currentAdminPage = 'stats';

class AdminPanel {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.isAdmin = false;
    this.profile = null;
  }

  // ── Vérification admin : UNIQUEMENT via la BDD Supabase ──────
  async checkAdminStatus(userId) {
    if (!this.sb || !userId) return false;

    try {
      const { data: profile, error } = await this.sb
        .from('profiles')
        .select('admin_role, banned, display_name')
        .eq('id', userId)
        .single();

      if (error || !profile) { this.isAdmin = false; return false; }

      this.profile = profile;
      const role = String(profile.admin_role || '').trim().toLowerCase();

      // ✅ Seul moyen d'être admin : avoir admin_role = 'admin' ou 'moderator' en BDD
      this.isAdmin = (role === 'admin' || role === 'moderator') && !profile.banned;
      return this.isAdmin;
    } catch {
      this.isAdmin = false;
      return false;
    }
  }

  async renderAdminDashboard() {
    if (!currentUser) return requireAuth(() => this.renderAdminDashboard());

    const isAdmin = await this.checkAdminStatus(currentUser.id);
    if (!isAdmin) return this.showDeniedAccess();

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
    this._loadReportsBadge();
  }

  _shellHTML() {
    return `
      <div class="admin-layout">
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
            <button class="admin-nav-item" onclick="adminPanel.exitAdmin()">
              <span class="nav-icon">← </span> Retour au site
            </button>
          </div>
        </aside>

        <main class="admin-main">
          <div id="admin-page-content">
            <div class="admin-loading">Chargement…</div>
          </div>
        </main>
      </div>
    `;
  }

  navigateTo(page) {
    currentAdminPage = page;
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });

    const content = document.getElementById('admin-page-content');
    if (!content) return;

    if (page === 'stats')      this._renderStats(content);
    if (page === 'moderation') adminModeration.render(content);
    if (page === 'users')      adminUsers.render(content);
    if (page === 'donations')  adminDonations.render(content);
  }

  exitAdmin() {
    const shell = document.getElementById('admin-shell');
    if (shell) shell.style.display = 'none';
    document.querySelectorAll('[id^="page-"]').forEach(el => el.classList.remove('hidden'));
    showPage('home');
    window.history.replaceState(null, '', window.location.pathname);
  }

  showDeniedAccess() {
    showToast('🚫 Accès refusé. Tu n\'as pas les droits admin.', 'error');
  }

  async _loadReportsBadge() {
    try {
      const { count } = await this.sb
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('resolved', false);
      const badge = document.getElementById('reports-badge');
      if (badge && count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-flex';
      }
    } catch {}
  }

  async _renderStats(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>📊 Statistiques</h1>
          <button class="admin-btn-sm" onclick="adminPanel._renderStats(document.getElementById('admin-page-content'))">🔄 Rafraîchir</button>
        </div>
        <div class="admin-stats-grid" id="admin-stats-grid">
          <div class="admin-loading">Chargement…</div>
        </div>
      </div>
    `;

    try {
      const [posts, profiles, reports, reactions, banned] = await Promise.all([
        this.sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', true),
        this.sb.from('profiles').select('*', { count: 'exact', head: true }),
        this.sb.from('reports').select('*', { count: 'exact', head: true }).eq('resolved', false),
        this.sb.from('reactions').select('*', { count: 'exact', head: true }),
        this.sb.from('profiles').select('*', { count: 'exact', head: true }).eq('banned', true),
      ]);

      const grid = document.getElementById('admin-stats-grid');
      if (!grid) return;
      grid.innerHTML = [
        { label: 'Messages publiés', value: posts.count || 0, icon: '💬', color: 'var(--accent)' },
        { label: 'Membres inscrits', value: profiles.count || 0, icon: '👥', color: 'var(--blue)' },
        { label: 'Signalements actifs', value: reports.count || 0, icon: '🚩', color: 'var(--red)' },
        { label: 'Réactions totales', value: reactions.count || 0, icon: '❤️', color: 'var(--green)' },
        { label: 'Comptes bannis', value: banned.count || 0, icon: '🚫', color: 'var(--purple)' },
      ].map(s => `
        <div class="admin-stat-card">
          <div class="admin-stat-icon">${s.icon}</div>
          <div class="admin-stat-value" style="color:${s.color}">${s.value.toLocaleString('fr-FR')}</div>
          <div class="admin-stat-label">${s.label}</div>
        </div>
      `).join('');
    } catch (err) {
      const grid = document.getElementById('admin-stats-grid');
      if (grid) grid.innerHTML = '<div class="admin-error">❌ Erreur lors du chargement des stats.</div>';
    }
  }
}

// ── CSS Admin ──────────────────────────────────────────────────
const styleAdmin = document.createElement('style');
styleAdmin.textContent = `
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg);
}

.admin-sidebar {
  width: 240px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

.admin-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border-bottom: 1px solid var(--border);
}

.admin-brand-icon { font-size: 1.4rem; }
.admin-brand-title { font-weight: 700; font-size: 0.9rem; color: var(--text); }
.admin-brand-sub { font-size: 0.72rem; color: var(--text3); margin-top: 2px; }

.admin-nav { flex: 1; padding: 12px 0; }
.admin-sidebar-footer { padding: 12px 0; border-top: 1px solid var(--border); }

.admin-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  width: 100%;
  border: none;
  background: none;
  color: var(--text2);
  font-family: var(--font-body);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.18s;
  border-radius: 8px;
  margin: 2px 8px;
  width: calc(100% - 16px);
  text-align: left;
}
.admin-nav-item:hover { background: var(--surface2); color: var(--text); }
.admin-nav-item.active { background: var(--accent-dim); color: var(--accent); font-weight: 600; }

.nav-icon { font-size: 1rem; flex-shrink: 0; }

.admin-main { flex: 1; padding: 28px; overflow-y: auto; min-height: 100vh; }

.admin-page { max-width: 1000px; }

.admin-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.admin-page-header h1 {
  font-family: var(--font-display);
  font-size: 1.6rem;
  color: var(--text);
}

.admin-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.admin-btn {
  padding: 8px 16px;
  background: var(--accent);
  color: #1a0a00;
  border: none;
  border-radius: var(--radius-pill);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-body);
  transition: all 0.18s;
}
.admin-btn:hover { filter: brightness(1.1); }

.admin-btn-sm {
  padding: 7px 14px;
  background: var(--surface2);
  color: var(--text2);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  cursor: pointer;
  font-family: var(--font-body);
  transition: all 0.18s;
}
.admin-btn-sm:hover { background: var(--surface3); color: var(--text); }

.admin-btn-danger {
  padding: 7px 14px;
  background: var(--red-dim);
  color: var(--red);
  border: 1px solid rgba(224,120,120,0.2);
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  cursor: pointer;
  font-family: var(--font-body);
  transition: all 0.18s;
}
.admin-btn-danger:hover { background: var(--red); color: white; }

.admin-badge {
  background: var(--red);
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 20px;
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.admin-stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px 20px;
  text-align: center;
  transition: transform 0.2s;
}
.admin-stat-card:hover { transform: translateY(-2px); }
.admin-stat-icon { font-size: 1.8rem; margin-bottom: 10px; }
.admin-stat-value { font-family: var(--font-display); font-size: 2rem; font-weight: 700; margin-bottom: 6px; }
.admin-stat-label { font-size: 0.75rem; color: var(--text3); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }

.admin-loading { color: var(--text3); font-size: 0.875rem; padding: 20px 0; }
.admin-empty { color: var(--text3); font-size: 0.875rem; padding: 30px; text-align: center; background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border); }
.admin-error { color: var(--red); font-size: 0.875rem; padding: 20px; background: var(--red-dim); border-radius: var(--radius-sm); border: 1px solid rgba(224,120,120,0.2); }
.admin-section { margin-bottom: 28px; }
.admin-section h3 { font-family: var(--font-display); font-size: 1.05rem; margin-bottom: 14px; color: var(--text2); }

.admin-input {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 13px;
  color: var(--text);
  font-family: var(--font-body);
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.18s;
}
.admin-input:focus { border-color: var(--accent); }

.admin-pagination {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 20px;
}

.form-group-admin { margin-bottom: 14px; }
.form-group-admin label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--text2); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.4px; }
.form-row-admin { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.rp-type {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  background: var(--surface2);
  color: var(--text3);
}
.type-encouragement { background: rgba(245,169,107,0.15); color: var(--accent); }
.type-temoignage { background: rgba(126,200,227,0.15); color: var(--blue); }
.type-question { background: rgba(196,127,181,0.15); color: var(--purple); }
.rp-time { font-size: 0.72rem; color: var(--text3); }

@media (max-width: 768px) {
  .admin-sidebar { width: 200px; }
  .admin-main { padding: 16px; }
}
@media (max-width: 600px) {
  .admin-layout { flex-direction: column; }
  .admin-sidebar { width: 100%; height: auto; position: relative; }
}
`;
document.head.appendChild(styleAdmin);

let adminPanel;
function initAdminPanel() {
  if (sb && !adminPanel) {
    adminPanel = new AdminPanel(sb);
  }
}
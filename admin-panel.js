// ═══════════════════════════════════════════════════════════════
// Admin Panel — ResteIci (Corrigé)
// ═══════════════════════════════════════════════════════════════

const ADMIN_EMAIL_WHITELIST = [
  'ayoubazarrouy@gmail.com',
  'youradmin@example.com' // Remplace ou ajoute tes emails admins ici
];

// Clé override URL (accès dev rapide via ?admin_key=...)
const ADMIN_OVERRIDE_SECRET = 'resteci_admin_access_2026';

class AdminPanel {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.isAdmin = false;
    this.profile = null;
  }

  // ── Helpers URL ──────────────────────────────────────────────
  getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  isAdminOverrideKey() {
    const key = this.getUrlParam('admin_key');
    return key === ADMIN_OVERRIDE_SECRET;
  }

  // ── Vérifie si l'utilisateur connecté est admin ──────────────
  async checkAdminStatus(userId) {
    // On récupère le profil ET l'email Supabase Auth
    const [profileRes, userRes] = await Promise.all([
      this.sb.from('profiles').select('admin_role, banned').eq('id', userId).single(),
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

  // ── Entrée principale du dashboard ───────────────────────────
  async renderAdminDashboard() {
    if (!currentUser) {
      return requireAuth(() => this.renderAdminDashboard());
    }

    const isAdmin = await this.checkAdminStatus(currentUser.id);
    if (!isAdmin) return this.showDeniedAccess();

    // Injecter le HTML du dashboard dans la page
    this._ensureContainer();
    document.getElementById('admin-container').innerHTML = this._dashboardHTML();

    // Afficher dans la bonne section selon la structure de la page
    const adminPage = document.getElementById('page-admin');
    if (adminPage) {
      // Si une page dédiée existe, on l'affiche
      document.querySelectorAll('[id^="page-"]').forEach(el => el.classList.add('hidden'));
      adminPage.classList.remove('hidden');
    } else {
      // Sinon on scroll jusqu'au container
      document.getElementById('admin-container').scrollIntoView({ behavior: 'smooth' });
    }

    this.loadAdminStats();
  }

  // ── HTML du dashboard ─────────────────────────────────────────
  _dashboardHTML() {
    const isOverride = this.isAdminOverrideKey();
    return `
      <div class="admin-panel">
        <div class="admin-header">
          <h2>🔐 Panel Admin</h2>
          ${isOverride ? '<span class="admin-override-badge">⚠️ Mode override actif</span>' : ''}
          <button class="admin-btn-small" onclick="document.getElementById('admin-container').innerHTML=''">✕ Fermer</button>
        </div>

        <section class="admin-section">
          <h3>📊 Statistiques</h3>
          <div class="admin-stats">
            <div class="stat-card"><div class="stat-val" id="admin-users-count">…</div><div class="stat-label">Utilisateurs</div></div>
            <div class="stat-card"><div class="stat-val" id="admin-reports-count">…</div><div class="stat-label">Signalements en attente</div></div>
            <div class="stat-card"><div class="stat-val" id="admin-posts-count">…</div><div class="stat-label">Posts à modérer</div></div>
          </div>
        </section>

        <section class="admin-section">
          <h3>⚠️ Signalements</h3>
          <div id="admin-reports" class="reports-list"><div class="admin-loading">Chargement…</div></div>
        </section>

        <section class="admin-section">
          <h3>⚙️ Actions rapides</h3>
          <div class="admin-actions">
            <button class="admin-btn" onclick="adminPanel.promptBanUser()">🚫 Bannir un utilisateur</button>
            <button class="admin-btn" onclick="adminPanel.promptDeletePost()">🗑️ Supprimer un post</button>
            <button class="admin-btn" onclick="adminPanel.loadAdminStats()">🔄 Rafraîchir</button>
          </div>
        </section>
      </div>
    `;
  }

  // ── Crée le conteneur s'il n'existe pas ──────────────────────
  _ensureContainer() {
    let container = document.getElementById('admin-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'admin-container';

      // Essaie de l'insérer après le feed ou à la fin du body
      const feed = document.getElementById('feed');
      if (feed) feed.parentNode.insertBefore(container, feed.nextSibling);
      else document.body.appendChild(container);
    }
    return container;
  }

  // ── Charge les stats ─────────────────────────────────────────
  async loadAdminStats() {
    try {
      const [usersRes, reportsRes, postsRes] = await Promise.all([
        this.sb.from('profiles').select('*', { count: 'exact', head: true }),
        this.sb.from('reports').select('*', { count: 'exact', head: true }).eq('resolved', false),
        this.sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', false)
      ]);

      const safe = (res) => (res.error ? '?' : (res.count ?? 0));

      const usersEl = document.getElementById('admin-users-count');
      const reportsEl = document.getElementById('admin-reports-count');
      const postsEl = document.getElementById('admin-posts-count');

      if (usersEl) usersEl.textContent = safe(usersRes);
      if (reportsEl) reportsEl.textContent = safe(reportsRes);
      if (postsEl) postsEl.textContent = safe(postsRes);

      this.loadReports();
    } catch (err) {
      console.error('Admin stats error:', err);
      showToast('❌ Erreur chargement stats admin', 'error');
    }
  }

  // ── Charge les signalements ───────────────────────────────────
  async loadReports() {
    const container = document.getElementById('admin-reports');
    if (!container) return;

    try {
      const { data: reports, error } = await this.sb
        .from('reports')
        .select('id, reason, post_id, reporter_id, posts(content), profiles!reports_reporter_id_fkey(display_name)')
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      if (!reports || reports.length === 0) {
        container.innerHTML = '<p class="admin-empty">✅ Aucun signalement en attente.</p>';
        return;
      }

      container.innerHTML = reports.map(r => `
        <div class="report-item" id="report-${r.id}">
          <div class="report-meta">
            <strong>${escapeHtml(r.profiles?.display_name || 'Utilisateur inconnu')}</strong>
            a signalé un post
          </div>
          <p class="report-content">"${escapeHtml((r.posts?.content || '').substring(0, 150))}${r.posts?.content?.length > 150 ? '…' : ''}"</p>
          <p class="report-reason">Motif : ${escapeHtml(r.reason || 'Non précisé')}</p>
          <div class="report-actions">
            <button class="admin-btn-small" onclick="adminPanel.resolveReport('${r.id}', '${r.post_id}', true)">✅ Supprimer le post</button>
            <button class="admin-btn-small btn-reject" onclick="adminPanel.resolveReport('${r.id}', null, false)">✕ Ignorer</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('Load reports error:', err);
      container.innerHTML = '<p class="admin-error">❌ Erreur lors du chargement des signalements.</p>';
    }
  }

  // ── Résout un signalement (avec ou sans suppression du post) ──
  async resolveReport(reportId, postId, deletePost) {
    try {
      if (deletePost && postId) {
        await this.sb.from('posts').delete().eq('id', postId);
      }
      await this.sb.from('reports').update({ resolved: true }).eq('id', reportId);

      // Retire l'élément de la liste sans rechargement complet
      document.getElementById('report-' + reportId)?.remove();
      showToast(deletePost ? '✅ Post supprimé et signalement résolu.' : '✅ Signalement ignoré.', 'success');

      // Met à jour le compteur
      const el = document.getElementById('admin-reports-count');
      if (el) el.textContent = Math.max(0, parseInt(el.textContent || '0') - 1);
    } catch (err) {
      console.error('Resolve report error:', err);
      showToast('❌ Erreur lors de la résolution.', 'error');
    }
  }

  // ── Bannir un utilisateur ─────────────────────────────────────
  async promptBanUser() {
    const userId = prompt('ID de l\'utilisateur à bannir :');
    if (!userId?.trim()) return;

    const confirm = window.confirm(`Bannir l'utilisateur ${userId} ?`);
    if (!confirm) return;

    try {
      const { error } = await this.sb.from('profiles').update({ banned: true }).eq('id', userId.trim());
      if (error) throw error;
      showToast('✅ Utilisateur banni.', 'success');
    } catch (err) {
      console.error('Ban error:', err);
      showToast('❌ Erreur : ' + err.message, 'error');
    }
  }

  // ── Supprimer un post ─────────────────────────────────────────
  async promptDeletePost() {
    const postId = prompt('ID du post à supprimer :');
    if (!postId?.trim()) return;

    try {
      const { error } = await this.sb.from('posts').delete().eq('id', postId.trim());
      if (error) throw error;
      showToast('✅ Post supprimé.', 'success');
      this.loadAdminStats();
    } catch (err) {
      console.error('Delete post error:', err);
      showToast('❌ Erreur : ' + err.message, 'error');
    }
  }

  showDeniedAccess() {
    showToast('⛔ Accès refusé. Tu n\'es pas admin.', 'error');
    console.warn('Admin access denied for user:', currentUser?.id);
  }
}

// ── CSS Admin Panel ───────────────────────────────────────────
const styleAdmin = document.createElement('style');
styleAdmin.textContent = `
#admin-container {
  max-width: 1000px;
  margin: 40px auto;
  padding: 0 24px 80px;
}

.admin-panel {
  background: var(--surface);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
}

.admin-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 24px 32px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
}

.admin-header h2 {
  font-size: 1.4rem;
  color: var(--accent);
  flex: 1;
  margin: 0;
}

.admin-override-badge {
  background: rgba(245,169,107,0.15);
  color: var(--accent);
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid rgba(245,169,107,0.3);
}

.admin-section {
  padding: 28px 32px;
  border-bottom: 1px solid var(--border);
}

.admin-section:last-child { border-bottom: none; }

.admin-section h3 {
  margin-bottom: 18px;
  color: var(--text);
  font-size: 1rem;
  font-weight: 600;
}

.admin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
}

.stat-card {
  background: var(--bg2);
  padding: 18px;
  border-radius: var(--radius-sm);
  text-align: center;
  border: 1px solid var(--border);
}

.stat-val {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--accent);
}

.stat-label {
  color: var(--text3);
  font-size: 0.8rem;
  margin-top: 6px;
}

.admin-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.admin-btn {
  padding: 10px 18px;
  background: var(--accent);
  color: #1a0a00;
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.875rem;
  font-family: var(--font-body);
  transition: all var(--transition);
}

.admin-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(245,169,107,0.3);
}

.admin-btn-small {
  padding: 6px 12px;
  font-size: 0.78rem;
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-family: var(--font-body);
  transition: all 0.2s;
}

.admin-btn-small:hover { border-color: var(--accent); color: var(--accent); }
.admin-btn-small.btn-reject:hover { border-color: #e07878; color: #e07878; }

.report-item {
  background: var(--bg2);
  padding: 16px 20px;
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
  border-left: 3px solid rgba(224,120,120,0.5);
}

.report-meta {
  font-size: 0.875rem;
  margin-bottom: 8px;
  color: var(--text);
}

.report-content {
  font-size: 0.85rem;
  color: var(--text2);
  margin-bottom: 8px;
  font-style: italic;
}

.report-reason {
  font-size: 0.8rem;
  color: var(--text3);
  margin-bottom: 12px;
}

.report-actions {
  display: flex;
  gap: 8px;
}

.admin-empty, .admin-loading {
  color: var(--text3);
  font-size: 0.9rem;
  padding: 16px 0;
}

.admin-error {
  color: #e07878;
  font-size: 0.9rem;
  padding: 16px 0;
}

@media (max-width: 640px) {
  .admin-section { padding: 20px; }
  .admin-header { padding: 18px 20px; }
  #admin-container { padding: 0 12px 60px; }
}
`;
document.head.appendChild(styleAdmin);

// ── Instance globale ──────────────────────────────────────────
let adminPanel;

function initAdminPanel() {
  if (!adminPanel && typeof sb !== 'undefined' && sb) {
    adminPanel = new AdminPanel(sb);
  }

  // Pré-vérifie le statut admin dès le chargement si l'utilisateur est connecté
  if (adminPanel && currentUser) {
    adminPanel.checkAdminStatus(currentUser.id);
  }
}
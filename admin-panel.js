// ═══════════════════════════════════════════════════════════════
// Admin Panel — ResteIci (Secured with JWT)
// ═══════════════════════════════════════════════════════════════

const ADMIN_USERS = []; // Remplace avec les UUIDs des admins

class AdminPanel {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.isAdmin = false;
  }

  // Vérifie si l'utilisateur est admin
  async checkAdminStatus(userId) {
    const { data: profile } = await this.sb
      .from('profiles')
      .select('admin_role')
      .eq('id', userId)
      .single();

    this.isAdmin = profile?.admin_role === 'admin' || profile?.admin_role === 'moderator';
    return this.isAdmin;
  }

  // Dashboard admin
  renderAdminDashboard() {
    if (!this.isAdmin) return this.showDeniedAccess();

    const html = `
      <div class="admin-panel">
        <h2>🔐 Panel Admin</h2>
        
        <section class="admin-section">
          <h3>📊 Statistiques</h3>
          <div class="admin-stats">
            <div class="stat-card">
              <div class="stat-val" id="admin-users-count">-</div>
              <div class="stat-label">Utilisateurs actifs</div>
            </div>
            <div class="stat-card">
              <div class="stat-val" id="admin-reports-count">-</div>
              <div class="stat-label">Signalements en attente</div>
            </div>
            <div class="stat-card">
              <div class="stat-val" id="admin-posts-count">-</div>
              <div class="stat-label">Posts à modérer</div>
            </div>
          </div>
        </section>

        <section class="admin-section">
          <h3>⚠️ Signalements</h3>
          <div id="admin-reports" class="reports-list"></div>
        </section>

        <section class="admin-section">
          <h3>🚫 Users Bannis</h3>
          <div id="admin-banned" class="banned-list"></div>
        </section>

        <section class="admin-section">
          <h3>⚙️ Actions</h3>
          <button class="admin-btn" onclick="adminPanel.deleteInappropriatePost()">Supprimer post</button>
          <button class="admin-btn" onclick="adminPanel.banUser()">Bannir utilisateur</button>
        </section>
      </div>
    `;

    const container = document.getElementById('admin-container') || document.createElement('div');
    container.id = 'admin-container';
    container.innerHTML = html;
    document.body.appendChild(container);

    this.loadAdminStats();
  }

  // Charge les stats pour le dashboard
  async loadAdminStats() {
    try {
      const [users, reports, posts] = await Promise.all([
        this.sb.from('profiles').select('*', { count: 'exact', head: true }),
        this.sb.from('reports').select('*', { count: 'exact', head: true }).eq('resolved', false),
        this.sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', false),
      ]);

      document.getElementById('admin-users-count').textContent = users.count || 0;
      document.getElementById('admin-reports-count').textContent = reports.count || 0;
      document.getElementById('admin-posts-count').textContent = posts.count || 0;

      this.loadReports();
    } catch (err) {
      console.error('Admin stats error:', err);
    }
  }

  // Charge les signalements
  async loadReports() {
    try {
      const { data: reports } = await this.sb
        .from('reports')
        .select('*, posts(content), profiles(display_name)')
        .eq('resolved', false)
        .limit(10);

      const html = (reports || []).map(r => `
        <div class="report-item">
          <p><strong>${r.profiles?.display_name}</strong> a signalé :</p>
          <p>"${r.posts?.content?.substring(0, 100)}..."</p>
          <p class="report-reason">Motif: ${r.reason}</p>
          <button class="admin-btn-small" onclick="adminPanel.approveReport('${r.id}')">Valider</button>
          <button class="admin-btn-small" onclick="adminPanel.rejectReport('${r.id}')">Rejeter</button>
        </div>
      `).join('');

      document.getElementById('admin-reports').innerHTML = html;
    } catch (err) {
      console.error('Load reports error:', err);
    }
  }

  // Approuve un signalement
  async approveReport(reportId) {
    await this.sb.from('reports').update({ resolved: true }).eq('id', reportId);
    this.loadReports();
  }

  // Rejette un signalement
  async rejectReport(reportId) {
    await this.sb.from('reports').delete().eq('id', reportId);
    this.loadReports();
  }

  // Bannir un utilisateur
  async banUser() {
    const userId = prompt('Entrez l\'ID de l\'utilisateur à bannir:');
    if (!userId) return;

    await this.sb.from('profiles').update({ banned: true }).eq('id', userId);
    showToast('✅ Utilisateur banni', 'success');
    this.loadAdminStats();
  }

  // Supprimer un post
  deleteInappropriatePost() {
    const postId = prompt('Entrez l\'ID du post à supprimer:');
    if (!postId) return;

    this.sb.from('posts').delete().eq('id', postId).then(() => {
      showToast('✅ Post supprimé', 'success');
    });
  }

  showDeniedAccess() {
    alert('⛔ Accès refusé. Vous n\'êtes pas admin.');
  }
}

// CSS pour Admin Panel
const styleAdmin = document.createElement('style');
styleAdmin.textContent = `
#admin-container {
  max-width: 1000px;
  margin: 40px auto;
  padding: 40px;
  background: var(--surface);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.admin-panel h2 {
  font-size: 1.8rem;
  margin-bottom: 30px;
  color: var(--accent);
}

.admin-section {
  margin-bottom: 40px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}

.admin-section h3 {
  margin-bottom: 16px;
  color: var(--text);
}

.admin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.stat-card {
  background: var(--bg2);
  padding: 20px;
  border-radius: var(--radius-sm);
  text-align: center;
}

.stat-val {
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent);
}

.stat-label {
  color: var(--text3);
  font-size: 0.85rem;
  margin-top: 8px;
}

.admin-btn {
  padding: 10px 20px;
  background: var(--accent);
  color: black;
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-weight: 600;
  margin-right: 10px;
  transition: all var(--transition);
}

.admin-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(245,169,107,0.3);
}

.admin-btn-small {
  padding: 6px 12px;
  font-size: 0.8rem;
  background: var(--blue);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  margin-right: 6px;
}

.report-item {
  background: var(--bg2);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  border-left: 3px solid var(--red);
}

.report-reason {
  font-size: 0.85rem;
  color: var(--text3);
  margin-top: 8px;
}
`;
document.head.appendChild(styleAdmin);

// Instance globale
let adminPanel;

function initAdminPanel() {
  if (sb && !adminPanel) {
    adminPanel = new AdminPanel(sb);
    if (currentUser) {
      adminPanel.checkAdminStatus(currentUser.id).then(isAdmin => {
        if (isAdmin) adminPanel.renderAdminDashboard();
      });
    }
  }
}

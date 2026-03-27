// ═══════════════════════════════════════════════════════════════
// Admin Utilisateurs — ResteIci
// Page dédiée : liste, recherche, ban, débannissement
// ═══════════════════════════════════════════════════════════════

// ✅ Fix : helpers locaux robustes
function _usrEsc(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _usrFmt(d) {
  if (typeof formatTime === 'function') return formatTime(d);
  if (!d) return '?';
  return new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function _usrSb() {
  if (typeof adminPanel !== 'undefined' && adminPanel?.sb) return adminPanel.sb;
  if (typeof sb !== 'undefined' && sb) return sb;
  return null;
}

class AdminUsers {
  constructor() {
    this.searchQuery = '';
    this.filterBanned = false;
  }

  async render(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>👥 Utilisateurs</h1>
          <div class="admin-row">
            <input class="admin-input" id="user-search" placeholder="🔍 Rechercher par nom ou email…"
              oninput="adminUsers.search(this.value)" style="max-width:240px">
            <button class="admin-btn-sm ${this.filterBanned ? 'active-filter' : ''}" onclick="adminUsers.toggleBannedFilter(this)">
              🚫 Bannis seulement
            </button>
            <button class="admin-btn-sm" onclick="adminUsers.render(document.getElementById('admin-page-content'))">🔄</button>
          </div>
        </div>

        <div id="users-list"><div class="admin-loading">Chargement…</div></div>

        <div class="admin-pagination" id="users-pagination"></div>
      </div>
    `;

    await this.loadUsers();
  }

  async loadUsers(page = 0) {
    const sb = _usrSb();
    const container = document.getElementById('users-list');
    if (!container) return;
    if (!sb) { container.innerHTML = '<div class="admin-error">❌ Connexion Supabase non initialisée.</div>'; return; }

    try {
      let query = sb
        .from('profiles')
        .select('id, display_name, email, banned, report_count, admin_role, created_at')
        .order('created_at', { ascending: false })
        .range(page * 20, page * 20 + 19);

      if (this.filterBanned) query = query.eq('banned', true);
      if (this.searchQuery) {
        query = query.or(`display_name.ilike.%${this.searchQuery}%,email.ilike.%${this.searchQuery}%`);
      }

      const { data: users, error } = await query;
      if (error) throw error;

      if (!users || users.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun utilisateur trouvé.</div>';
        return;
      }

      container.innerHTML = `
        <div class="users-table-wrap">
          <table class="users-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Signalements</th>
                <th>Statut</th>
                <th>Inscrit le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => this._userRow(u)).join('')}
            </tbody>
          </table>
        </div>
      `;

    } catch (err) {
      console.error('Load users error:', err);
      container.innerHTML = '<div class="admin-error">❌ Erreur lors du chargement des utilisateurs.</div>';
    }
  }

  _userRow(u) {
    const initials = (u.display_name || '?').slice(0, 2).toUpperCase();
    const role = String(u.admin_role || 'user').toLowerCase();
    const roleLabel = role === 'admin' ? '🔐 Admin' : role === 'moderator' ? '🛡️ Modo' : '👤 User';
    const roleClass = role === 'admin' ? 'role-admin' : role === 'moderator' ? 'role-mod' : 'role-user';
    const statusLabel = u.banned ? '<span class="status-banned">🚫 Banni</span>' : '<span class="status-active">✅ Actif</span>';
    const date = u.created_at ? new Date(u.created_at).toLocaleDateString('fr-FR') : '?';

    return `
      <tr id="user-row-${u.id}" class="${u.banned ? 'row-banned' : ''}">
        <td>
          <div class="user-cell">
            <div class="user-avatar-sm">${initials}</div>
            <span class="user-name">${_usrEsc(u.display_name || 'Anonyme')}</span>
          </div>
        </td>
        <td class="user-email">${_usrEsc(u.email || '—')}</td>
        <td><span class="role-badge ${roleClass}">${roleLabel}</span></td>
        <td>
          <span class="report-count ${u.report_count >= 3 ? 'count-high' : ''}">
            ${u.report_count || 0}
          </span>
        </td>
        <td>${statusLabel}</td>
        <td class="user-date">${date}</td>
        <td>
          <div class="user-actions">
            ${u.banned
              ? `<button class="admin-btn-sm" onclick="adminUsers.unbanUser('${u.id}')">✅ Débannir</button>`
              : `<button class="admin-btn-danger" onclick="adminUsers.banUser('${u.id}')">🚫 Bannir</button>`
            }
            <button class="admin-btn-sm" data-uid="${u.id}" data-uname="${_usrEsc(u.display_name || 'Anonyme')}" onclick="adminUsers.viewUserPosts(this.dataset.uid, this.dataset.uname)">📝 Posts</button>
            ${role !== 'admin'
              ? `<button class="admin-btn-sm" onclick="adminUsers.setRole('${u.id}', 'moderator')">🛡️ Modo</button>`
              : ''
            }
          </div>
        </td>
      </tr>
    `;
  }

  search(val) {
    this.searchQuery = val.trim();
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadUsers(), 400);
  }

  toggleBannedFilter(btn) {
    this.filterBanned = !this.filterBanned;
    btn.classList.toggle('active-filter', this.filterBanned);
    this.loadUsers();
  }

  async banUser(userId) {
    if (!confirm('Bannir cet utilisateur ?')) return;
    const sb = _usrSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    try {
      await sb.from('profiles').update({ banned: true }).eq('id', userId);
      const row = document.getElementById('user-row-' + userId);
      if (row) {
        row.classList.add('row-banned');
        row.querySelector('.user-actions').innerHTML = `<button class="admin-btn-sm" onclick="adminUsers.unbanUser('${userId}')">✅ Débannir</button>`;
        const statusEl = row.querySelector('[class^="status"]');
        if (statusEl) statusEl.outerHTML = '<span class="status-banned">🚫 Banni</span>';
      }
      showToast('✅ Utilisateur banni.', 'success');
    } catch (err) {
      showToast('❌ Erreur : ' + err.message, 'error');
    }
  }

  async unbanUser(userId) {
    const sb = _usrSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    try {
      await sb.from('profiles').update({ banned: false, report_count: 0 }).eq('id', userId);
      const row = document.getElementById('user-row-' + userId);
      if (row) {
        row.classList.remove('row-banned');
        const nameEl = row.querySelector('.user-name');
        const uname = nameEl ? nameEl.textContent.trim() : '';
        const uid = userId;
        row.querySelector('.user-actions').innerHTML = `
          <button class="admin-btn-danger" onclick="adminUsers.banUser('${uid}')">🚫 Bannir</button>
          <button class="admin-btn-sm" data-uid="${uid}" data-uname="${_usrEsc(uname)}" onclick="adminUsers.viewUserPosts(this.dataset.uid, this.dataset.uname)">📝 Posts</button>
        `;
        const statusEl = row.querySelector('[class^="status"]');
        if (statusEl) statusEl.outerHTML = '<span class="status-active">✅ Actif</span>';
      }
      showToast('✅ Utilisateur débanni.', 'success');
    } catch (err) {
      showToast('❌ Erreur : ' + err.message, 'error');
    }
  }

  async setRole(userId, role) {
    if (!confirm(`Passer cet utilisateur en "${role}" ?`)) return;
    const sb = _usrSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    try {
      await sb.from('profiles').update({ admin_role: role }).eq('id', userId);
      showToast(`✅ Rôle mis à jour : ${role}.`, 'success');
      this.loadUsers();
    } catch (err) {
      showToast('❌ Erreur : ' + err.message, 'error');
    }
  }

  async viewUserPosts(userId, name) {
    const sb = _usrSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }

    const { data: posts } = await sb
      .from('posts')
      .select('id, content, type, created_at, approved')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!posts || posts.length === 0) {
      showToast('Aucun post pour cet utilisateur.', '');
      return;
    }

    // ✅ Fix : toujours (re)créer la modale proprement pour éviter les états obsolètes
    let modal = document.getElementById('user-posts-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'user-posts-modal';
    modal.className = 'up-modal-overlay';
    modal.style.display = 'flex';
    document.body.appendChild(modal);

    modal.innerHTML = `
      <div class="up-modal">
        <div class="up-modal-header">
          <span>📝 Posts de ${_usrEsc(name)}</span>
          <button onclick="document.getElementById('user-posts-modal').remove()">✕</button>
        </div>
        <div class="up-modal-body">
          ${posts.map(p => `
            <div class="up-post-item" id="upost-${p.id}">
              <div class="up-post-meta">
                <span class="rp-type type-${p.type}">${p.type}</span>
                <span class="rp-time">${_usrFmt(p.created_at)}</span>
                ${!p.approved ? '<span class="status-banned">Non approuvé</span>' : ''}
              </div>
              <div class="up-post-content">${_usrEsc(p.content)}</div>
              <button class="admin-btn-danger" onclick="adminUsers.deleteUserPost('${p.id}')">🗑️ Supprimer</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Fermer au clic sur l'overlay
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  async deleteUserPost(postId) {
    if (!confirm('Supprimer ce post ?')) return;
    const sb = _usrSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    await sb.from('posts').delete().eq('id', postId);
    document.getElementById(`upost-${postId}`)?.remove();
    showToast('🗑️ Post supprimé.', 'success');
  }
}

// ── CSS Users ──────────────────────────────────────────────────
const styleUsers = document.createElement('style');
styleUsers.textContent = `
.users-table-wrap {
  overflow-x: auto;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.users-table th {
  background: var(--bg2);
  padding: 12px 14px;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 1px solid var(--border);
}

.users-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.users-table tr:last-child td { border-bottom: none; }
.users-table tr:hover td { background: rgba(255,255,255,0.02); }
.row-banned td { opacity: 0.6; }

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.user-name { font-weight: 600; color: var(--text); }
.user-email { color: var(--text3); font-size: 0.8rem; }
.user-date { color: var(--text3); font-size: 0.78rem; }

.role-badge {
  padding: 3px 9px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
}
.role-admin { background: rgba(245,169,107,0.15); color: var(--accent); }
.role-mod { background: rgba(126,200,227,0.15); color: var(--blue); }
.role-user { background: var(--surface2); color: var(--text3); }

.report-count { font-weight: 700; color: var(--text2); }
.count-high { color: #e07878 !important; }

.status-active { color: var(--green); font-size: 0.78rem; font-weight: 600; }
.status-banned { color: #e07878; font-size: 0.78rem; font-weight: 600; }

.user-actions { display: flex; gap: 6px; flex-wrap: wrap; }

.active-filter {
  background: var(--accent-dim) !important;
  color: var(--accent) !important;
  border-color: var(--accent) !important;
}

/* Modal posts utilisateur */
.up-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 2000;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.up-modal {
  background: var(--surface);
  border-radius: var(--radius);
  border: 1px solid var(--border);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.up-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}

.up-modal-header button {
  background: none;
  border: none;
  color: var(--text3);
  cursor: pointer;
  font-size: 1rem;
}

.up-modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.up-post-item {
  background: var(--bg2);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin-bottom: 10px;
  border: 1px solid var(--border);
}

.up-post-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.up-post-content {
  font-size: 0.875rem;
  color: var(--text2);
  margin-bottom: 10px;
  line-height: 1.6;
}
`;
document.head.appendChild(styleUsers);

const adminUsers = new AdminUsers();
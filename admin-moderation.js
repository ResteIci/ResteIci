// ═══════════════════════════════════════════════════════════════
// Admin Modération — ResteIci
// Page dédiée : signalements + posts en attente
// ═══════════════════════════════════════════════════════════════

// ✅ Fix : helpers locaux en cas de chargement hors-ordre
function _modEsc(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _modFmt(d) {
  if (typeof formatTime === 'function') return formatTime(d);
  if (!d) return '?';
  return new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function _modSb() {
  if (typeof adminPanel !== 'undefined' && adminPanel?.sb) return adminPanel.sb;
  if (typeof sb !== 'undefined' && sb) return sb;
  return null;
}

class AdminModeration {
  constructor() {}

  async render(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>⚠️ Modération</h1>
          <button class="admin-btn-sm" onclick="adminModeration.render(document.getElementById('admin-page-content'))">🔄 Rafraîchir</button>
        </div>

        <!-- Tabs -->
        <div class="mod-tabs">
          <button class="mod-tab active" data-tab="reports" onclick="adminModeration.switchTab('reports', this)">
            🚩 Signalements <span class="admin-badge" id="mod-reports-count">…</span>
          </button>
          <button class="mod-tab" data-tab="pending" onclick="adminModeration.switchTab('pending', this)">
            🕐 Posts en attente <span class="admin-badge" id="mod-pending-count">…</span>
          </button>
          <button class="mod-tab" data-tab="history" onclick="adminModeration.switchTab('history', this)">
            📋 Historique
          </button>
        </div>

        <div id="mod-tab-reports" class="mod-tab-content">
          <div id="reports-list"><div class="admin-loading">Chargement…</div></div>
        </div>
        <div id="mod-tab-pending" class="mod-tab-content" style="display:none">
          <div id="pending-list"><div class="admin-loading">Chargement…</div></div>
        </div>
        <div id="mod-tab-history" class="mod-tab-content" style="display:none">
          <div id="history-list"><div class="admin-loading">Chargement…</div></div>
        </div>
      </div>
    `;

    await this.loadReports();
    await this.loadPending();
  }

  switchTab(tab, btn) {
    document.querySelectorAll('.mod-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.mod-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById('mod-tab-' + tab).style.display = 'block';
    if (tab === 'history') this.loadHistory();
  }

  async loadReports() {
    const sb = _modSb(); if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    const container = document.getElementById('reports-list');
    if (!container) return;

    try {
      const { data: reports, error, count } = await sb
        .from('reports')
        .select('id, reason, post_id, created_at, reporter_id, posts(id, content, user_id), profiles!reports_reporter_id_fkey(display_name)', { count: 'exact' })
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      const badge = document.getElementById('mod-reports-count');
      if (badge) badge.textContent = count || 0;

      if (!reports || reports.length === 0) {
        container.innerHTML = '<div class="admin-empty">✅ Aucun signalement en attente. Beau travail !</div>';
        return;
      }

      container.innerHTML = reports.map(r => `
        <div class="report-card" id="rcard-${r.id}">
          <div class="report-card-header">
            <span class="report-tag">🚩 Signalement</span>
            <span class="report-meta-time">${_modFmt(r.created_at)}</span>
          </div>

          <div class="report-by">
            Par <strong>${_modEsc(r.profiles?.display_name || 'Utilisateur')}</strong>
            — Motif : <em>${_modEsc(r.reason || 'Non précisé')}</em>
          </div>

          <div class="report-content-box">
            "${_modEsc((r.posts?.content || '').substring(0, 200))}${r.posts?.content?.length > 200 ? '…' : ''}"
          </div>

          <div class="report-actions-row">
            <button class="admin-btn-danger" onclick="adminModeration.deletePostAndResolve('${r.id}', '${r.post_id}', '${r.posts?.user_id || ''}')">
              🗑️ Supprimer le post
            </button>
            <button class="admin-btn-sm" onclick="adminModeration.warnUser('${r.posts?.user_id || ''}', '${r.id}')">
              ⚠️ Avertir l'auteur
            </button>
            <button class="admin-btn-sm" onclick="adminModeration.ignoreReport('${r.id}')">
              ✕ Ignorer
            </button>
          </div>
        </div>
      `).join('');

    } catch (err) {
      console.error('Load reports error:', err);
      container.innerHTML = '<div class="admin-error">❌ Erreur lors du chargement.</div>';
    }
  }

  async loadPending() {
    const sb = _modSb(); if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    const container = document.getElementById('pending-list');
    if (!container) return;

    try {
      const { data: posts, count } = await sb
        .from('posts')
        .select('id, content, type, created_at, profiles(display_name)', { count: 'exact' })
        .eq('approved', false)
        .order('created_at', { ascending: false })
        .limit(30);

      const badge = document.getElementById('mod-pending-count');
      if (badge) badge.textContent = count || 0;

      if (!posts || posts.length === 0) {
        container.innerHTML = '<div class="admin-empty">✅ Aucun post en attente de modération.</div>';
        return;
      }

      container.innerHTML = posts.map(p => `
        <div class="report-card" id="pcard-${p.id}">
          <div class="report-card-header">
            <span class="rp-type type-${p.type}">${p.type}</span>
            <span class="report-meta-time">${_modFmt(p.created_at)}</span>
          </div>
          <div class="report-by">
            Par <strong>${_modEsc(p.profiles?.display_name || 'Anonyme')}</strong>
          </div>
          <div class="report-content-box">
            ${_modEsc(p.content || '')}
          </div>
          <div class="report-actions-row">
            <button class="admin-btn" onclick="adminModeration.approvePost('${p.id}')">✅ Approuver</button>
            <button class="admin-btn-danger" onclick="adminModeration.deletePost('${p.id}')">🗑️ Supprimer</button>
          </div>
        </div>
      `).join('');

    } catch (err) {
      console.error('Load pending error:', err);
      container.innerHTML = '<div class="admin-error">❌ Erreur lors du chargement.</div>';
    }
  }

  async loadHistory() {
    const sb = _modSb(); if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    const container = document.getElementById('history-list');
    if (!container) return;

    try {
      const { data: resolved } = await sb
        .from('reports')
        .select('id, reason, resolved_at, created_at, profiles!reports_reporter_id_fkey(display_name)')
        .eq('resolved', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!resolved || resolved.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun historique de modération.</div>';
        return;
      }

      container.innerHTML = resolved.map(r => `
        <div class="history-item">
          <span class="history-tag">✅ Résolu</span>
          <span>Par <strong>${_modEsc(r.profiles?.display_name || '?')}</strong></span>
          <span class="report-by">Motif: ${_modEsc(r.reason || 'n/a')}</span>
          <span class="rp-time">${_modFmt(r.created_at)}</span>
        </div>
      `).join('');

    } catch (err) {
      container.innerHTML = '<div class="admin-error">❌ Erreur lors du chargement.</div>';
    }
  }

  async deletePostAndResolve(reportId, postId, authorId) {
    if (!confirm('Supprimer ce post et résoudre le signalement ?')) return;
    const sb = _modSb(); if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    try {
      await Promise.all([
        sb.from('posts').delete().eq('id', postId),
        sb.from('reports').update({ resolved: true }).eq('id', reportId),
      ]);
      // Incrémente le compteur de signalements de l'auteur
      if (authorId && authorId !== 'undefined') {
        const { data: p } = await sb.from('profiles').select('report_count').eq('id', authorId).single();
        const newCount = (p?.report_count || 0) + 1;
        await sb.from('profiles').update({
          report_count: newCount,
          ...(newCount >= 5 ? { banned: true } : {})
        }).eq('id', authorId);
      }
      document.getElementById('rcard-' + reportId)?.remove();
      showToast('✅ Post supprimé et signalement résolu.', 'success');
    } catch (err) {
      showToast('❌ Erreur : ' + err.message, 'error');
    }
  }

  async ignoreReport(reportId) {
    const sb = _modSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    await sb.from('reports').update({ resolved: true }).eq('id', reportId);
    document.getElementById('rcard-' + reportId)?.remove();
    showToast('✅ Signalement ignoré.', 'success');
  }

  async warnUser(userId, reportId) {
    if (!userId || userId === 'undefined') { showToast('❌ ID utilisateur introuvable.', 'error'); return; }
    const sb = _modSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    await sb.from('profiles').update({ warned: true }).eq('id', userId);
    await sb.from('reports').update({ resolved: true }).eq('id', reportId);
    document.getElementById('rcard-' + reportId)?.remove();
    showToast('⚠️ Utilisateur averti.', 'success');
  }

  async approvePost(postId) {
    const sb = _modSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    await sb.from('posts').update({ approved: true }).eq('id', postId);
    document.getElementById('pcard-' + postId)?.remove();
    showToast('✅ Post approuvé.', 'success');
  }

  async deletePost(postId) {
    if (!confirm('Supprimer ce post ?')) return;
    const sb = _modSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    await sb.from('posts').delete().eq('id', postId);
    document.getElementById('pcard-' + postId)?.remove();
    showToast('🗑️ Post supprimé.', 'success');
  }
}

// ── CSS Modération ─────────────────────────────────────────────
const styleMod = document.createElement('style');
styleMod.textContent = `
.mod-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
}

.mod-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text2);
  font-family: var(--font-body);
  font-size: 0.875rem;
  cursor: pointer;
  margin-bottom: -1px;
  transition: all 0.2s;
}

.mod-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}

.mod-tab:hover { color: var(--text); }

.report-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  margin-bottom: 12px;
  transition: border-color 0.2s;
}

.report-card:hover { border-color: var(--border2); }

.report-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.report-tag {
  font-size: 0.78rem;
  font-weight: 600;
  color: #e07878;
  background: rgba(224,120,120,0.12);
  padding: 3px 10px;
  border-radius: 20px;
}

.report-meta-time {
  font-size: 0.75rem;
  color: var(--text3);
}

.report-by {
  font-size: 0.85rem;
  color: var(--text2);
  margin-bottom: 10px;
}

.report-content-box {
  background: var(--bg2);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 0.85rem;
  color: var(--text2);
  font-style: italic;
  margin-bottom: 14px;
  border-left: 3px solid var(--border2);
  line-height: 1.6;
}

.report-actions-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  font-size: 0.85rem;
  border: 1px solid var(--border);
  flex-wrap: wrap;
}

.history-tag {
  background: rgba(114,201,138,0.15);
  color: var(--green);
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 600;
}
`;
document.head.appendChild(styleMod);

const adminModeration = new AdminModeration();
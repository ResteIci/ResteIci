// ═══════════════════════════════════════════════════════════════
// Admin Dons & Objectifs — ResteIci v2
// Page dédiée : subgoals + historique des dons + widget public
// ═══════════════════════════════════════════════════════════════

// ✅ Fix : helpers locaux robustes
function _donEsc(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _donFmt(d) {
  if (typeof formatTime === 'function') return formatTime(d);
  if (!d) return '?';
  return new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function _donSb() {
  if (typeof adminPanel !== 'undefined' && adminPanel?.sb) return adminPanel.sb;
  if (typeof sb !== 'undefined' && sb) return sb;
  return null;
}

class AdminDonations {
  constructor() {}

  async render(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>💰 Dons & Objectifs</h1>
          <div class="admin-header-actions">
            <button class="admin-btn-sm" onclick="adminDonations.render(document.getElementById('admin-page-content'))">🔄 Rafraîchir</button>
            <button class="admin-btn" onclick="adminDonations.openCreateGoal()">+ Nouvel objectif</button>
          </div>
        </div>

        <div class="admin-info-box">
          💡 Les objectifs configurés ici s'affichent automatiquement sur la page d'accueil dans le widget "Nos objectifs". 
          Utilisez le bouton <strong>"Copier le widget"</strong> ci-dessous pour l'intégrer sur d'autres pages.
        </div>

        <!-- Vue d'ensemble des dons -->
        <div class="don-overview" id="don-overview">
          <div class="admin-loading">Chargement…</div>
        </div>

        <!-- Sous-objectifs -->
        <div class="admin-section">
          <div class="admin-section-header">
            <h3>🎯 Sous-objectifs de la campagne</h3>
            <div style="display:flex;gap:8px">
              <button class="admin-btn-sm" onclick="adminDonations._copyWidgetCode()">📋 Copier le widget HTML</button>
              <button class="admin-btn" onclick="adminDonations.openCreateGoal()">+ Ajouter</button>
            </div>
          </div>
          <div id="subgoals-list"><div class="admin-loading">Chargement…</div></div>
        </div>

        <!-- Ajout manuel de don -->
        <div class="admin-section">
          <div class="admin-section-header">
            <h3>➕ Enregistrer un don manuel</h3>
          </div>
          <div class="manual-don-form">
            <div class="form-row-admin" style="align-items:end;gap:10px">
              <div class="form-group-admin" style="flex:1">
                <label>Montant (€)</label>
                <input class="admin-input" id="manual-amount" type="number" step="0.01" min="0.01" placeholder="Ex: 10.00">
              </div>
              <div class="form-group-admin" style="flex:2">
                <label>Nom du donateur</label>
                <input class="admin-input" id="manual-donor" placeholder="Ex: Marie D. (optionnel)">
              </div>
              <div class="form-group-admin" style="flex:2">
                <label>Note</label>
                <input class="admin-input" id="manual-note" placeholder="Ex: don de mariage">
              </div>
              <div class="form-group-admin" style="flex:1.5">
                <label>Objectif ciblé</label>
                <select class="admin-select" id="manual-goal" style="width:100%">
                  <option value="">Principal (1er)</option>
                </select>
              </div>
              <div class="form-group-admin">
                <label>&nbsp;</label>
                <button class="admin-btn" onclick="adminDonations.manualAddDonation()">+ Enregistrer</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Historique -->
        <div class="admin-section">
          <div class="admin-section-header">
            <h3>📋 Historique des dons</h3>
            <button class="admin-btn-sm" onclick="adminDonations._exportDonationsCSV()">📤 Export CSV</button>
          </div>
          <div id="donations-history"><div class="admin-loading">Chargement…</div></div>
        </div>

        <!-- Webhook config -->
        <div class="admin-section">
          <div class="admin-section-header"><h3>🔗 Configuration Webhook PayPal</h3></div>
          <div class="webhook-info">${this._webhookConfigHTML()}</div>
        </div>
      </div>

      <!-- Modal objectif -->
      <div id="goal-modal-overlay" class="up-modal-overlay">
        <div class="up-modal">
          <div class="up-modal-header">
            <span id="goal-modal-title">Nouvel objectif</span>
            <button onclick="adminDonations.closeGoalModal()">✕</button>
          </div>
          <div class="up-modal-body">
            <div class="form-group-admin">
              <label>Titre</label>
              <input class="admin-input" id="goal-title" placeholder="Ex: Serveur 2025">
            </div>
            <div class="form-group-admin">
              <label>Description</label>
              <input class="admin-input" id="goal-desc" placeholder="Courte description de l'objectif…">
            </div>
            <div class="form-row-admin">
              <div class="form-group-admin">
                <label>Objectif (€)</label>
                <input class="admin-input" id="goal-target" type="number" min="1" placeholder="100">
              </div>
              <div class="form-group-admin">
                <label>Montant actuel (€)</label>
                <input class="admin-input" id="goal-current" type="number" min="0" placeholder="0">
              </div>
            </div>
            <div class="form-row-admin">
              <div class="form-group-admin">
                <label>Icône (emoji)</label>
                <input class="admin-input" id="goal-icon" placeholder="💻" maxlength="4">
              </div>
              <div class="form-group-admin">
                <label>Ordre d'affichage</label>
                <input class="admin-input" id="goal-order" type="number" min="1" placeholder="1">
              </div>
            </div>
            <input type="hidden" id="goal-edit-id">
            <div style="display:flex;gap:10px;margin-top:16px">
              <button class="admin-btn" onclick="adminDonations.saveGoal()">💾 Sauvegarder</button>
              <button class="admin-btn-sm" onclick="adminDonations.closeGoalModal()">Annuler</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // ✅ Fix : await sur _loadGoalSelect (était fire-and-forget)
    await this._loadGoalSelect();

    await Promise.all([
      this.loadOverview(),
      this.loadSubgoals(),
      this.loadDonationHistory(),
    ]);

    // ✅ Fix : fermeture de la modale au clic sur l'overlay (manquait)
    const overlay = document.getElementById('goal-modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) this.closeGoalModal();
      });
    }
  }

  // ── Vue d'ensemble ─────────────────────────────────────────────
  async loadOverview() {
    const sb = _donSb();
    const el = document.getElementById('don-overview');
    if (!el) return;
    if (!sb) { el.innerHTML = '<div class="admin-error">❌ Connexion Supabase non initialisée.</div>'; return; }
    try {
      const [donationsR, subgoalsR] = await Promise.all([
        sb.from('donations').select('amount, created_at, status').eq('status', 'completed'),
        sb.from('subgoals').select('target_amount, current_amount').order('created_at', { ascending: true }),
      ]);

      const dons = donationsR.data || [];
      const goals = subgoalsR.data || [];

      const totalRec   = dons.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
      const totalGoal  = goals.reduce((s, g) => s + parseFloat(g.target_amount || 0), 0);
      const totalCur   = goals.reduce((s, g) => s + parseFloat(g.current_amount || 0), 0);
      const globalPct  = totalGoal ? Math.min(100, Math.round((totalCur / totalGoal) * 100)) : 0;

      // Dons du mois en cours
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthDons = dons.filter(d => d.created_at >= monthStart);
      const monthTotal = monthDons.reduce((s, d) => s + parseFloat(d.amount || 0), 0);

      el.innerHTML = `
        <div class="don-overview-inner">
          <div class="don-kpi-grid">
            <div class="don-kpi">
              <div class="don-kpi-icon">💰</div>
              <div class="don-kpi-val">${totalRec.toFixed(2)} €</div>
              <div class="don-kpi-label">Total reçu</div>
            </div>
            <div class="don-kpi">
              <div class="don-kpi-icon">📅</div>
              <div class="don-kpi-val">${monthTotal.toFixed(2)} €</div>
              <div class="don-kpi-label">Ce mois-ci</div>
            </div>
            <div class="don-kpi">
              <div class="don-kpi-icon">🎁</div>
              <div class="don-kpi-val">${dons.length}</div>
              <div class="don-kpi-label">Dons reçus</div>
            </div>
            <div class="don-kpi">
              <div class="don-kpi-icon">🎯</div>
              <div class="don-kpi-val">${globalPct}%</div>
              <div class="don-kpi-label">Progression globale</div>
            </div>
          </div>
          <div style="margin-top:14px">
            <div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--text3);margin-bottom:6px">
              <span>Progression globale de la campagne</span>
              <span>${totalCur.toFixed(2)} € / ${totalGoal.toFixed(2)} €</span>
            </div>
            <div class="goal-bar-wrap"><div class="goal-bar-fill" style="width:${globalPct}%"></div></div>
          </div>
        </div>
      `;
    } catch {
      el.innerHTML = '<div class="admin-error">❌ Erreur lors du chargement de l\'aperçu.</div>';
    }
  }

  // ── Sous-objectifs ─────────────────────────────────────────────
  async loadSubgoals() {
    const sb = _donSb();
    const container = document.getElementById('subgoals-list');
    if (!container) return;
    if (!sb) { container.innerHTML = '<div class="admin-error">❌ Connexion non initialisée.</div>'; return; }
    try {
      const { data: goals, error } = await sb.from('subgoals').select('*').order('id', { ascending: true });
      if (error) throw error;

      if (!goals || !goals.length) {
        container.innerHTML = '<div class="admin-empty">Aucun sous-objectif. Crée-en un avec le bouton "Ajouter" !</div>';
        return;
      }

      container.innerHTML = goals.map(g => {
        const cur = parseFloat(g.current_amount || 0);
        const tar = parseFloat(g.target_amount || 1);
        const pct = Math.min(100, Math.round((cur / tar) * 100));
        const done = pct >= 100;
        return `
          <div class="subgoal-card ${done ? 'goal-done' : ''}" id="sg-${g.id}">
            <div class="subgoal-icon">${_donEsc(g.icon || '🎯')}</div>
            <div class="subgoal-body">
              <div class="subgoal-header-row">
                <div class="subgoal-title">${_donEsc(g.title || 'Objectif')}</div>
                ${done ? '<span class="done-badge">✅ Atteint !</span>' : ''}
              </div>
              <div class="subgoal-desc">${_donEsc(g.description || '')}</div>
              <div class="subgoal-bar-wrap">
                <div class="subgoal-bar-fill" style="width:${pct}%;${done ? 'background:var(--green)' : ''}"></div>
              </div>
              <div class="subgoal-amounts">
                <strong style="color:${done ? 'var(--green)' : 'var(--accent)'}">${cur.toFixed(2)} €</strong>
                <span>/ ${tar.toFixed(2)} € — ${pct}%</span>
              </div>
              <div class="subgoal-quick-update">
                <input class="admin-input" id="sq-input-${g.id}" type="number" step="0.01" placeholder="Ajouter € manuellement" style="max-width:160px;font-size:.78rem;padding:5px 9px">
                <button class="admin-btn-sm" onclick="adminDonations._quickUpdate('${g.id}', ${cur})">+</button>
              </div>
            </div>
            <div class="subgoal-actions">
              <button class="admin-btn-sm" onclick="adminDonations.editGoal('${g.id}')">✏️ Modifier</button>
              <button class="admin-btn-danger" onclick="adminDonations.deleteGoal('${g.id}')">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = `
        <div class="admin-error">❌ Table <code>subgoals</code> introuvable.
          <button class="admin-btn-sm" style="margin-left:8px" onclick="adminPanel.navigateTo('health')">Voir le SQL requis →</button>
        </div>
      `;
    }
  }

  async _quickUpdate(goalId, currentAmount) {
    const input = document.getElementById(`sq-input-${goalId}`);
    const add = parseFloat(input?.value || 0);
    if (!add || add <= 0) { showToast('❌ Montant invalide.', 'error'); return; }
    const sb = _donSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    const newAmount = currentAmount + add;
    await sb.from('subgoals').update({ current_amount: newAmount }).eq('id', goalId);
    await sb.from('donations').insert({
      amount: add,
      donor_name: 'Ajout rapide (admin)',
      source: 'manual',
      status: 'completed',
      note: `Mise à jour rapide objectif`,
      created_at: new Date().toISOString(),
    });
    if (input) input.value = '';
    showToast(`✅ +${add}€ ajouté à l'objectif.`, 'success');
    this.loadSubgoals();
    this.loadOverview();
  }

  async loadDonationHistory() {
    const sb = _donSb();
    const container = document.getElementById('donations-history');
    if (!container) return;
    if (!sb) { container.innerHTML = '<div class="admin-error">❌ Connexion non initialisée.</div>'; return; }
    try {
      const { data: donations, error } = await sb
        .from('donations').select('*').order('created_at', { ascending: false }).limit(30);
      if (error) throw error;

      if (!donations || !donations.length) {
        container.innerHTML = '<div class="admin-empty">Aucun don enregistré.</div>';
        return;
      }

      const total = donations.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
      container.innerHTML = `
        <div class="donations-total">Total affiché (30 derniers) : <strong style="color:var(--green)">${total.toFixed(2)} €</strong></div>
        <div class="donations-table-wrap">
          <table class="users-table">
            <thead>
              <tr><th>Date</th><th>Montant</th><th>Donateur</th><th>Source</th><th>Statut</th><th>Note</th><th></th></tr>
            </thead>
            <tbody>
              ${donations.map(d => `
                <tr id="don-${d.id}">
                  <td class="user-date">${_donFmt(d.created_at)}</td>
                  <td><strong style="color:var(--green)">${parseFloat(d.amount || 0).toFixed(2)} €</strong></td>
                  <td>${_donEsc(d.donor_name || 'Anonyme')}</td>
                  <td><span class="source-badge source-${d.source || 'manual'}">${d.source || 'manuel'}</span></td>
                  <td><span class="${d.status === 'completed' ? 'status-active' : 'status-banned'}">${d.status || '?'}</span></td>
                  <td class="user-email">${_donEsc(d.note || '—')}</td>
                  <td><button class="admin-btn-icon" onclick="adminDonations._deleteDon('${d.id}')">🗑️</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch {
      container.innerHTML = '<div class="admin-error">❌ Table <code>donations</code> introuvable.</div>';
    }
  }

  async _deleteDon(id) {
    if (!confirm('Supprimer ce don de l\'historique ?')) return;
    const sb = _donSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    await sb.from('donations').delete().eq('id', id);
    document.getElementById(`don-${id}`)?.remove();
    showToast('🗑️ Don supprimé.', 'success');
    this.loadOverview();
  }

  async _exportDonationsCSV() {
    const sb = _donSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    const { data } = await sb.from('donations').select('*').order('created_at', { ascending: false });
    const rows = [['Date','Montant','Donateur','Source','Statut','Note','Transaction ID']];
    (data || []).forEach(d => rows.push([d.created_at, d.amount, d.donor_name || 'Anonyme', d.source || '', d.status || '', d.note || '', d.paypal_transaction_id || '']));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `resteici-dons-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('📤 Export CSV généré.', 'success');
  }

  async manualAddDonation() {
    const amount   = parseFloat(document.getElementById('manual-amount')?.value || 0);
    const donor    = document.getElementById('manual-donor')?.value.trim() || 'Administrateur';
    const note     = document.getElementById('manual-note')?.value.trim() || 'Ajouté manuellement';
    const goalId   = document.getElementById('manual-goal')?.value || '';

    if (!amount || amount <= 0) { showToast('❌ Montant invalide.', 'error'); return; }
    const sb = _donSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    try {
      await sb.from('donations').insert({
        amount, donor_name: donor, source: 'manual', status: 'completed',
        note, created_at: new Date().toISOString(),
      });

      let q = sb.from('subgoals').select('id, current_amount').order('created_at', { ascending: true }).limit(1);
      if (goalId) q = sb.from('subgoals').select('id, current_amount').eq('id', goalId).limit(1);
      const { data: goals } = await q;
      const goal = goals?.[0];
      if (goal) {
        await sb.from('subgoals').update({ current_amount: (parseFloat(goal.current_amount) || 0) + amount }).eq('id', goal.id);
      }

      document.getElementById('manual-amount').value = '';
      document.getElementById('manual-donor').value = '';
      document.getElementById('manual-note').value = '';
      showToast(`✅ Don de ${amount.toFixed(2)} € enregistré !`, 'success');
      this.loadOverview();
      this.loadSubgoals();
      this.loadDonationHistory();
    } catch (err) { showToast('❌ Erreur : ' + err.message, 'error'); }
  }

  async _loadGoalSelect() {
    const sel = document.getElementById('manual-goal');
    if (!sel) return;
    const sb = _donSb();
    if (!sb) return;
    try {
      const { data } = await sb.from('subgoals').select('id, title').order('created_at', { ascending: true });
      // Vider les options existantes sauf la première (principal)
      while (sel.options.length > 1) sel.remove(1);
      (data || []).forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id; opt.textContent = g.title || 'Objectif';
        sel.appendChild(opt);
      });
    } catch {}
  }

  async editGoal(id) {
    const sb = _donSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    const { data: g } = await sb.from('subgoals').select('*').eq('id', id).single();
    if (!g) { showToast('❌ Objectif introuvable.', 'error'); return; }
    document.getElementById('goal-modal-title').textContent = 'Modifier l\'objectif';
    document.getElementById('goal-title').value   = g.title || '';
    document.getElementById('goal-desc').value    = g.description || '';
    document.getElementById('goal-target').value  = g.target_amount || '';
    document.getElementById('goal-current').value = g.current_amount || 0;
    document.getElementById('goal-icon').value    = g.icon || '🎯';
    document.getElementById('goal-order').value   = g.display_order || 1;
    document.getElementById('goal-edit-id').value = id;
    document.getElementById('goal-modal-overlay').style.display = 'flex';
  }

  async saveGoal() {
    const id = document.getElementById('goal-edit-id').value;
    const payload = {
      title:          document.getElementById('goal-title').value.trim(),
      description:    document.getElementById('goal-desc').value.trim(),
      target_amount:  parseFloat(document.getElementById('goal-target').value) || 0,
      current_amount: parseFloat(document.getElementById('goal-current').value) || 0,
      icon:           document.getElementById('goal-icon').value.trim() || '🎯',
    };
    if (!payload.title || !payload.target_amount) { showToast('❌ Titre et objectif requis.', 'error'); return; }
    const sb = _donSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    try {
      if (id) {
        await sb.from('subgoals').update(payload).eq('id', id);
        showToast('✅ Objectif mis à jour.', 'success');
      } else {
        payload.created_at = new Date().toISOString();
        await sb.from('subgoals').insert(payload);
        showToast('✅ Objectif créé !', 'success');
      }
      this.closeGoalModal();
      this.loadSubgoals();
      this.loadOverview();
    } catch (err) { showToast('❌ Erreur : ' + err.message, 'error'); }
  }

  async deleteGoal(id) {
    if (!confirm('Supprimer cet objectif ?')) return;
    const sb = _donSb();
    if (!sb) { showToast('❌ Connexion non initialisée.', 'error'); return; }
    await sb.from('subgoals').delete().eq('id', id);
    document.getElementById(`sg-${id}`)?.remove();
    showToast('🗑️ Objectif supprimé.', 'success');
    this.loadOverview();
  }

  closeGoalModal() {
    document.getElementById('goal-modal-overlay').style.display = 'none';
  }

  // ── Code widget HTML à copier ──────────────────────────────────
  _copyWidgetCode() {
    const code = `<!-- Widget Objectifs ResteIci — à placer où tu veux sur le site -->
<div id="resteici-goals-widget"></div>
<script src="subgoals-widget.js"><\/script>`;
    navigator.clipboard.writeText(code)
      .then(() => showToast('✅ Code du widget copié !', 'success'))
      .catch(() => showToast('❌ Copie impossible. Copie manuellement.', 'error'));
  }

  // ── Webhook config ─────────────────────────────────────────────
  _webhookConfigHTML() {
    return `
      <div class="webhook-steps">
        <p style="color:var(--text2);font-size:.875rem;margin-bottom:16px">
          Le webhook PayPal met à jour automatiquement les objectifs quand un don est reçu.
          Utilise <strong>Zapier</strong> comme intermédiaire (gratuit jusqu'à 100 tâches/mois).
        </p>
        ${[
          ['Crée un compte sur <a href="https://zapier.com" target="_blank" style="color:var(--accent)">zapier.com</a>', 'Gratuit jusqu\'à 100 tâches/mois.'],
          ['Crée un Zap :', 'Trigger: PayPal → "New Sale" | Action: HTTP → POST vers Supabase donations'],
          ['Configure le POST :', `URL: ${typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '[SUPABASE_URL]'}/rest/v1/donations\nHeaders: apikey: [TA_CLE_ANON]\nBody: { "amount": "{{amount}}", "donor_name": "{{payer_name}}", "source": "paypal", "status": "completed" }`],
          ['Active et teste avec un paiement sandbox.', 'Les dons apparaîtront automatiquement dans l\'historique ci-dessus.'],
        ].map(([title, desc], i) => `
          <div class="webhook-step">
            <div class="step-num">${i + 1}</div>
            <div class="step-content">
              <strong>${title}</strong>
              <div class="${i === 2 ? 'code-block' : ''}" style="margin-top:5px;${i !== 2 ? 'color:var(--text2);font-size:.82rem' : ''}">${desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

// ── CSS Donations ──────────────────────────────────────────────
const styleDons = document.createElement('style');
styleDons.textContent = `
/* Overview */
.don-overview { background:var(--surface); border:1px solid var(--border); border-radius:14px; margin-bottom:16px; overflow:hidden; }
.don-overview-inner { padding:22px 24px; }
.don-kpi-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; }
.don-kpi { background:var(--surface2); border-radius:10px; padding:14px; text-align:center; }
.don-kpi-icon { font-size:1.4rem; margin-bottom:6px; }
.don-kpi-val  { font-family:var(--font-display); font-size:1.5rem; font-weight:700; color:var(--accent); margin-bottom:2px; }
.don-kpi-label { font-size:.68rem; color:var(--text3); font-weight:600; text-transform:uppercase; letter-spacing:.4px; }

/* Goal bars */
.goal-bar-wrap { height:10px; background:var(--surface2); border-radius:10px; overflow:hidden; }
.goal-bar-fill { height:100%; background:linear-gradient(90deg,var(--accent),#e8c06a); border-radius:10px; transition:width .6s cubic-bezier(.34,1.56,.64,1); }

/* Subgoal cards */
.subgoal-card { display:flex; align-items:flex-start; gap:14px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 18px; margin-bottom:10px; transition:border-color .2s; }
.subgoal-card:hover { border-color:var(--border2); }
.subgoal-card.goal-done { border-color:rgba(109,232,160,.3); background:rgba(109,232,160,.03); }
.subgoal-icon { font-size:2rem; flex-shrink:0; margin-top:2px; }
.subgoal-body { flex:1; min-width:0; }
.subgoal-header-row { display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap; }
.subgoal-title { font-weight:600; color:var(--text); font-size:.9rem; }
.done-badge { background:rgba(109,232,160,.15); color:var(--green); font-size:.68rem; padding:2px 8px; border-radius:20px; font-weight:700; }
.subgoal-desc { font-size:.78rem; color:var(--text3); margin-bottom:10px; }
.subgoal-bar-wrap { height:6px; background:var(--surface2); border-radius:6px; overflow:hidden; margin-bottom:6px; }
.subgoal-bar-fill { height:100%; background:var(--accent); border-radius:6px; transition:width .5s; }
.subgoal-amounts { font-size:.78rem; color:var(--text2); margin-bottom:10px; display:flex; gap:6px; align-items:center; }
.subgoal-quick-update { display:flex; gap:6px; align-items:center; }
.subgoal-actions { display:flex; flex-direction:column; gap:6px; flex-shrink:0; }

/* Manual form */
.manual-don-form { padding:4px 0; }

/* Donations table */
.donations-total { font-size:.85rem; color:var(--text2); margin-bottom:10px; padding:10px 12px; background:var(--surface2); border-radius:8px; }
.donations-table-wrap { overflow-x:auto; border-radius:10px; border:1px solid var(--border); }
.source-badge { padding:2px 8px; border-radius:12px; font-size:.68rem; font-weight:700; text-transform:uppercase; }
.source-paypal { background:rgba(0,112,186,.15); color:#4da3e0; }
.source-manual { background:rgba(245,169,107,.15); color:var(--accent); }

/* Webhook */
.webhook-info { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px 24px; }
.webhook-steps { display:flex; flex-direction:column; gap:16px; }
.webhook-step { display:flex; gap:14px; align-items:flex-start; }
.step-num { width:28px; height:28px; border-radius:50%; background:var(--adim); color:var(--accent); display:flex; align-items:center; justify-content:center; font-size:.8rem; font-weight:700; flex-shrink:0; margin-top:2px; }
.step-content strong { color:var(--text); font-size:.875rem; }
.code-block { background:var(--bg); border-radius:8px; padding:10px 14px; font-size:.72rem; color:var(--blue); font-family:monospace; margin-top:6px; border:1px solid var(--border); white-space:pre-wrap; line-height:1.5; }

/* Users table shared */
.users-table { width:100%; border-collapse:collapse; font-size:.82rem; }
.users-table th { background:var(--bg2); padding:10px 12px; text-align:left; font-size:.72rem; font-weight:600; color:var(--text3); text-transform:uppercase; letter-spacing:.4px; border-bottom:1px solid var(--border); }
.users-table td { padding:10px 12px; border-bottom:1px solid var(--border); vertical-align:middle; }
.users-table tr:last-child td { border-bottom:none; }
.users-table tr:hover td { background:rgba(255,255,255,.02); }
.user-date  { color:var(--text3); font-size:.75rem; }
.user-email { color:var(--text3); font-size:.78rem; }

/* Up modal */
.up-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:2000; display:none; align-items:center; justify-content:center; padding:20px; }
.up-modal { background:var(--surface); border-radius:var(--radius); border:1px solid var(--border); width:100%; max-width:520px; max-height:90vh; overflow:hidden; display:flex; flex-direction:column; }
.up-modal-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid var(--border); font-weight:600; font-size:.95rem; }
.up-modal-header button { background:none; border:none; color:var(--text3); cursor:pointer; font-size:1rem; }
.up-modal-body { padding:18px 20px; overflow-y:auto; flex:1; }

/* Status */
.status-active { color:var(--green); font-size:.78rem; font-weight:600; }
.status-banned { color:#e87d7d; font-size:.78rem; font-weight:600; }
`;
document.head.appendChild(styleDons);

const adminDonations = new AdminDonations();
// ═══════════════════════════════════════════════════════════════
// Admin Dons & Objectifs — ResteIci
// Page dédiée : subgoals PayPal + historique des dons
// ═══════════════════════════════════════════════════════════════

class AdminDonations {
  constructor() {}

  async render(container) {
    container.innerHTML = `
      <div class="admin-page">
        <div class="admin-page-header">
          <h1>💰 Dons & Objectifs</h1>
          <button class="admin-btn-sm" onclick="adminDonations.render(document.getElementById('admin-page-content'))">🔄 Rafraîchir</button>
        </div>

        <!-- Objectif principal -->
        <div class="goal-card" id="main-goal-card">
          <div class="admin-loading">Chargement…</div>
        </div>

        <!-- Liste des sous-objectifs -->
        <div class="admin-section">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <h3>🎯 Sous-objectifs</h3>
            <button class="admin-btn" onclick="adminDonations.openCreateGoal()">+ Nouvel objectif</button>
          </div>
          <div id="subgoals-list"><div class="admin-loading">Chargement…</div></div>
        </div>

        <!-- Historique des dons -->
        <div class="admin-section">
          <h3>📋 Historique des dons</h3>
          <div id="donations-history"><div class="admin-loading">Chargement…</div></div>
        </div>

        <!-- Webhook PayPal -->
        <div class="admin-section">
          <h3>🔗 Configuration Webhook PayPal</h3>
          <div class="webhook-info">
            ${this._webhookConfigHTML()}
          </div>
        </div>
      </div>

      <!-- Modal création objectif -->
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
              <input class="admin-input" id="goal-desc" placeholder="Une courte description…">
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
            <div class="form-group-admin">
              <label>Icône (emoji)</label>
              <input class="admin-input" id="goal-icon" placeholder="💻" maxlength="4" style="max-width:80px">
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

    await Promise.all([
      this.loadMainGoal(),
      this.loadSubgoals(),
      this.loadDonationHistory()
    ]);
  }

  // ── Objectif principal ────────────────────────────────────────
  async loadMainGoal() {
    const sb = adminPanel.sb;
    const card = document.getElementById('main-goal-card');
    if (!card) return;

    try {
      // Somme de tous les dons reçus
      const { data: history } = await sb
        .from('donations')
        .select('amount')
        .eq('status', 'completed');

      const total = (history || []).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

      // Récupère ou crée l'objectif annuel
      const { data: goal } = await sb
        .from('subgoals')
        .select('*')
        .eq('id', 1)
        .single();

      const target = goal?.target_amount || 500;
      const current = goal?.current_amount || total;
      const pct = Math.min(100, Math.round((current / target) * 100));

      card.innerHTML = `
        <div class="main-goal-inner">
          <div class="goal-main-header">
            <div>
              <div class="goal-main-title">${escapeHtml(goal?.title || 'Objectif annuel')}</div>
              <div class="goal-main-desc">${escapeHtml(goal?.description || 'Frais de serveur et de fonctionnement')}</div>
            </div>
            <button class="admin-btn-sm" onclick="adminDonations.editGoal(1)">✏️ Modifier</button>
          </div>
          <div class="goal-amounts">
            <span class="goal-current">${current.toFixed(2)} €</span>
            <span class="goal-sep">sur</span>
            <span class="goal-target">${target} €</span>
            <span class="goal-pct">(${pct}%)</span>
          </div>
          <div class="goal-bar-wrap">
            <div class="goal-bar-fill" style="width: ${pct}%"></div>
          </div>
          <div class="goal-manual-update">
            <input class="admin-input" id="manual-amount-input" type="number" step="0.01" placeholder="Montant reçu (€)" style="max-width:180px">
            <button class="admin-btn-sm" onclick="adminDonations.manualAddDonation()">+ Ajouter don manuel</button>
          </div>
        </div>
      `;

    } catch (err) {
      card.innerHTML = `
        <div class="main-goal-inner">
          <p class="admin-error">❌ Impossible de charger l'objectif principal. Vérifie que la table <code>subgoals</code> et <code>donations</code> existent dans Supabase.</p>
          <details class="sql-hint">
            <summary>📋 SQL pour créer les tables</summary>
            <pre>${this._createTableSQL()}</pre>
          </details>
        </div>
      `;
    }
  }

  // ── Sous-objectifs ────────────────────────────────────────────
  async loadSubgoals() {
    const sb = adminPanel.sb;
    const container = document.getElementById('subgoals-list');
    if (!container) return;

    try {
      const { data: goals, error } = await sb
        .from('subgoals')
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      if (!goals || goals.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun sous-objectif. Crée-en un !</div>';
        return;
      }

      container.innerHTML = goals.map(g => {
        const pct = Math.min(100, Math.round(((g.current_amount || 0) / (g.target_amount || 1)) * 100));
        const done = pct >= 100;
        return `
          <div class="subgoal-card ${done ? 'goal-done' : ''}">
            <div class="subgoal-icon">${g.icon || '🎯'}</div>
            <div class="subgoal-body">
              <div class="subgoal-title">${escapeHtml(g.title || 'Objectif')}</div>
              <div class="subgoal-desc">${escapeHtml(g.description || '')}</div>
              <div class="subgoal-bar-wrap">
                <div class="subgoal-bar-fill" style="width:${pct}%"></div>
              </div>
              <div class="subgoal-amounts">
                ${(g.current_amount || 0).toFixed(2)} € / ${g.target_amount || 0} € — ${pct}%
                ${done ? ' <span class="done-badge">✅ Atteint !</span>' : ''}
              </div>
            </div>
            <div class="subgoal-actions">
              <button class="admin-btn-sm" onclick="adminDonations.editGoal(${g.id})">✏️</button>
              <button class="admin-btn-danger" onclick="adminDonations.deleteGoal(${g.id})">🗑️</button>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      container.innerHTML = `
        <div class="admin-error">❌ Table <code>subgoals</code> introuvable.
          <details class="sql-hint"><summary>Créer la table</summary><pre>${this._createTableSQL()}</pre></details>
        </div>
      `;
    }
  }

  // ── Historique dons ───────────────────────────────────────────
  async loadDonationHistory() {
    const sb = adminPanel.sb;
    const container = document.getElementById('donations-history');
    if (!container) return;

    try {
      const { data: donations, error } = await sb
        .from('donations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      if (!donations || donations.length === 0) {
        container.innerHTML = '<div class="admin-empty">Aucun don enregistré pour le moment.</div>';
        return;
      }

      const total = donations.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

      container.innerHTML = `
        <div class="donations-total">Total reçu (20 derniers) : <strong>${total.toFixed(2)} €</strong></div>
        <div class="donations-table-wrap">
          <table class="users-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Montant</th>
                <th>Donateur</th>
                <th>Source</th>
                <th>Statut</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              ${donations.map(d => `
                <tr>
                  <td class="user-date">${formatTime(d.created_at)}</td>
                  <td><strong style="color:var(--green)">${parseFloat(d.amount || 0).toFixed(2)} €</strong></td>
                  <td>${escapeHtml(d.donor_name || 'Anonyme')}</td>
                  <td><span class="source-badge source-${d.source || 'manual'}">${d.source || 'manuel'}</span></td>
                  <td><span class="${d.status === 'completed' ? 'status-active' : 'status-banned'}">${d.status || '?'}</span></td>
                  <td class="user-email">${escapeHtml(d.note || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

    } catch (err) {
      container.innerHTML = `
        <div class="admin-error">❌ Table <code>donations</code> introuvable.
          <details class="sql-hint"><summary>Créer la table</summary><pre>${this._createTableSQL()}</pre></details>
        </div>
      `;
    }
  }

  // ── Ajout manuel d'un don ─────────────────────────────────────
  async manualAddDonation() {
    const amountEl = document.getElementById('manual-amount-input');
    const amount = parseFloat(amountEl?.value || 0);
    if (!amount || amount <= 0) {
      showToast('❌ Montant invalide.', 'error');
      return;
    }

    const sb = adminPanel.sb;
    try {
      await sb.from('donations').insert({
        amount,
        donor_name: 'Administrateur',
        source: 'manual',
        status: 'completed',
        note: 'Ajouté manuellement via admin',
        created_at: new Date().toISOString()
      });

      // Met à jour current_amount dans subgoals id=1
      const { data: goal } = await sb.from('subgoals').select('current_amount').eq('id', 1).single();
      if (goal) {
        await sb.from('subgoals').update({
          current_amount: (goal.current_amount || 0) + amount
        }).eq('id', 1);
      }

      if (amountEl) amountEl.value = '';
      showToast(`✅ Don de ${amount} € ajouté !`, 'success');
      this.loadMainGoal();
      this.loadDonationHistory();
    } catch (err) {
      showToast('❌ Erreur : ' + err.message, 'error');
    }
  }

  // ── Création / édition d'objectif ─────────────────────────────
  openCreateGoal() {
    document.getElementById('goal-modal-title').textContent = 'Nouvel objectif';
    document.getElementById('goal-title').value = '';
    document.getElementById('goal-desc').value = '';
    document.getElementById('goal-target').value = '';
    document.getElementById('goal-current').value = '0';
    document.getElementById('goal-icon').value = '🎯';
    document.getElementById('goal-edit-id').value = '';
    document.getElementById('goal-modal-overlay').style.display = 'flex';
  }

  async editGoal(id) {
    const sb = adminPanel.sb;
    const { data: g } = await sb.from('subgoals').select('*').eq('id', id).single();
    if (!g) { showToast('❌ Objectif introuvable.', 'error'); return; }

    document.getElementById('goal-modal-title').textContent = 'Modifier l\'objectif';
    document.getElementById('goal-title').value = g.title || '';
    document.getElementById('goal-desc').value = g.description || '';
    document.getElementById('goal-target').value = g.target_amount || '';
    document.getElementById('goal-current').value = g.current_amount || 0;
    document.getElementById('goal-icon').value = g.icon || '🎯';
    document.getElementById('goal-edit-id').value = id;
    document.getElementById('goal-modal-overlay').style.display = 'flex';
  }

  async saveGoal() {
    const sb = adminPanel.sb;
    const id = document.getElementById('goal-edit-id').value;
    const data = {
      title: document.getElementById('goal-title').value.trim(),
      description: document.getElementById('goal-desc').value.trim(),
      target_amount: parseFloat(document.getElementById('goal-target').value) || 0,
      current_amount: parseFloat(document.getElementById('goal-current').value) || 0,
      icon: document.getElementById('goal-icon').value.trim() || '🎯',
    };

    if (!data.title || !data.target_amount) {
      showToast('❌ Titre et objectif requis.', 'error');
      return;
    }

    try {
      if (id) {
        await sb.from('subgoals').update(data).eq('id', parseInt(id));
        showToast('✅ Objectif mis à jour.', 'success');
      } else {
        await sb.from('subgoals').insert(data);
        showToast('✅ Objectif créé !', 'success');
      }
      this.closeGoalModal();
      this.loadSubgoals();
      this.loadMainGoal();
    } catch (err) {
      showToast('❌ Erreur : ' + err.message, 'error');
    }
  }

  async deleteGoal(id) {
    if (!confirm('Supprimer cet objectif ?')) return;
    await adminPanel.sb.from('subgoals').delete().eq('id', id);
    showToast('🗑️ Objectif supprimé.', 'success');
    this.loadSubgoals();
  }

  closeGoalModal() {
    document.getElementById('goal-modal-overlay').style.display = 'none';
  }

  // ── HTML config webhook ───────────────────────────────────────
  _webhookConfigHTML() {
    return `
      <div class="webhook-steps">
        <p style="color:var(--text2);font-size:0.875rem;margin-bottom:16px">
          Le webhook PayPal met à jour automatiquement les objectifs quand un don est reçu.
          Puisque ResteIci est un site statique hébergé sur Render, utilise <strong>Zapier</strong> comme intermédiaire.
        </p>

        <div class="webhook-step">
          <div class="step-num">1</div>
          <div class="step-content">
            <strong>Crée un compte sur <a href="https://zapier.com" target="_blank" style="color:var(--accent)">zapier.com</a></strong>
            <p>Gratuit jusqu'à 100 tâches/mois.</p>
          </div>
        </div>

        <div class="webhook-step">
          <div class="step-num">2</div>
          <div class="step-content">
            <strong>Crée un Zap :</strong>
            <ul style="color:var(--text2);font-size:0.85rem;margin-top:6px">
              <li><strong>Trigger :</strong> PayPal → "New Sale" (connecte ton compte PayPal Business)</li>
              <li><strong>Action :</strong> Supabase → "Run Query" ou utilise l'action HTTP pour POST vers Supabase</li>
            </ul>
          </div>
        </div>

        <div class="webhook-step">
          <div class="step-num">3</div>
          <div class="step-content">
            <strong>Configure l'action Supabase :</strong>
            <div class="code-block">
POST https://[TON-PROJET].supabase.co/rest/v1/donations
Content-Type: application/json
apikey: [TA_CLE_ANON]

{
  "amount": "{{amount}}",
  "donor_name": "{{payer_name}}",
  "source": "paypal",
  "status": "completed",
  "created_at": "{{created_at}}"
}
            </div>
          </div>
        </div>

        <div class="webhook-step">
          <div class="step-num">4</div>
          <div class="step-content">
            <strong>Active le Zap et teste avec un paiement PayPal sandbox.</strong>
            <p style="color:var(--text2);font-size:0.85rem;margin-top:4px">
              Les dons apparaîtront automatiquement dans l'historique ci-dessus et mettront à jour les objectifs.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  // ── SQL pour créer les tables ─────────────────────────────────
  _createTableSQL() {
    return `-- Table sous-objectifs
CREATE TABLE IF NOT EXISTS subgoals (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Objectif',
  description TEXT,
  icon TEXT DEFAULT '🎯',
  target_amount NUMERIC(10,2) DEFAULT 100,
  current_amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Objectif principal (id=1)
INSERT INTO subgoals (id, title, description, target_amount, current_amount, icon)
VALUES (1, 'Objectif annuel', 'Frais de serveur et fonctionnement', 500, 0, '🚀')
ON CONFLICT (id) DO NOTHING;

-- Table historique des dons
CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(10,2) NOT NULL,
  donor_name TEXT DEFAULT 'Anonyme',
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'completed',
  note TEXT,
  paypal_transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS (sécurité)
ALTER TABLE subgoals ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

-- Lecture publique pour afficher la barre de progression
CREATE POLICY "subgoals_read" ON subgoals FOR SELECT USING (true);
-- Écriture admin uniquement (via service_role depuis Zapier/webhook)
CREATE POLICY "donations_read" ON donations FOR SELECT USING (true);`;
  }
}

// ── CSS Donations ──────────────────────────────────────────────
const styleDons = document.createElement('style');
styleDons.textContent = `
.goal-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 8px;
  overflow: hidden;
}

.main-goal-inner {
  padding: 24px 28px;
}

.goal-main-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}

.goal-main-title {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
}

.goal-main-desc { color: var(--text3); font-size: 0.85rem; }

.goal-amounts {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}

.goal-current { font-size: 1.8rem; font-weight: 700; color: var(--accent); }
.goal-sep { color: var(--text3); font-size: 0.9rem; }
.goal-target { font-size: 1.1rem; color: var(--text2); }
.goal-pct { font-size: 0.85rem; color: var(--text3); }

.goal-bar-wrap {
  height: 10px;
  background: var(--surface2);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 14px;
}

.goal-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), #e8c06a);
  border-radius: 10px;
  transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.goal-manual-update {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 8px;
  flex-wrap: wrap;
}

.subgoal-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 18px;
  margin-bottom: 10px;
  transition: border-color 0.2s;
}

.subgoal-card.goal-done { border-color: rgba(114,201,138,0.3); }
.subgoal-card:hover { border-color: var(--border2); }

.subgoal-icon { font-size: 1.8rem; flex-shrink: 0; }

.subgoal-body { flex: 1; min-width: 0; }

.subgoal-title { font-weight: 600; color: var(--text); margin-bottom: 2px; }
.subgoal-desc { font-size: 0.8rem; color: var(--text3); margin-bottom: 8px; }

.subgoal-bar-wrap {
  height: 6px;
  background: var(--surface2);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 4px;
}

.subgoal-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 6px;
  transition: width 0.5s;
}

.subgoal-amounts { font-size: 0.78rem; color: var(--text3); }
.done-badge { color: var(--green); font-weight: 600; }

.subgoal-actions { display: flex; gap: 6px; flex-shrink: 0; }

/* Webhook */
.webhook-info {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 24px;
}

.webhook-steps { display: flex; flex-direction: column; gap: 16px; }

.webhook-step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-dim);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}

.step-content strong { color: var(--text); font-size: 0.9rem; }
.step-content p { color: var(--text2); font-size: 0.82rem; margin-top: 4px; }

.code-block {
  background: var(--bg);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 0.75rem;
  color: var(--blue);
  font-family: monospace;
  margin-top: 8px;
  border: 1px solid var(--border);
  white-space: pre-wrap;
  line-height: 1.5;
}

.donations-total {
  font-size: 0.875rem;
  color: var(--text2);
  margin-bottom: 12px;
  padding: 10px 14px;
  background: var(--surface2);
  border-radius: var(--radius-sm);
}

.donations-table-wrap {
  overflow-x: auto;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.source-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
}
.source-paypal { background: rgba(0,112,186,0.15); color: #4da3e0; }
.source-manual { background: rgba(245,169,107,0.15); color: var(--accent); }

.sql-hint {
  margin-top: 12px;
  font-size: 0.82rem;
  color: var(--text3);
  cursor: pointer;
}

.sql-hint pre {
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  font-size: 0.72rem;
  color: var(--blue);
  overflow-x: auto;
  margin-top: 8px;
  border: 1px solid var(--border);
  white-space: pre-wrap;
}

.form-group-admin {
  margin-bottom: 14px;
}
.form-group-admin label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text3);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.form-row-admin {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
`;
document.head.appendChild(styleDons);

const adminDonations = new AdminDonations();
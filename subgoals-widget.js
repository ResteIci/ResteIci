// ═══════════════════════════════════════════════════════════════
// subgoals-widget.js — Widget public des objectifs de dons
// S'affiche sur index.html et partout où on l'inclut
// Données lues depuis Supabase (table subgoals + donations)
// ═══════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Config ────────────────────────────────────────────────────
  // Récupère SUPABASE_URL et SUPABASE_ANON_KEY depuis config.js
  const _url  = typeof SUPABASE_URL      !== 'undefined' ? SUPABASE_URL      : null;
  const _key  = typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : null;

  // ─────────────────────────────────────────────────────────────
  // Requête Supabase sans SDK (fetch natif)
  // ─────────────────────────────────────────────────────────────
  async function sbFetch(table, params = '') {
    if (!_url || !_key) return null;
    try {
      const res = await fetch(`${_url}/rest/v1/${table}${params}`, {
        headers: {
          apikey: _key,
          Authorization: `Bearer ${_key}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  // ─────────────────────────────────────────────────────────────
  // Rendu du widget
  // ─────────────────────────────────────────────────────────────
  async function renderWidget(container) {
    // Skeleton pendant le chargement
    container.innerHTML = `
      <div class="sgw-wrap sgw-loading">
        <div class="sgw-header">
          <span class="sgw-title">💰 Nos objectifs</span>
          <span class="sgw-subtitle">Aide ResteIci à continuer</span>
        </div>
        <div class="sgw-skeleton"></div>
        <div class="sgw-skeleton sgw-sk-sm"></div>
      </div>
    `;

    // Fetch données
    const [goals, dons] = await Promise.all([
      sbFetch('subgoals', '?select=*&order=id.asc'),
      sbFetch('donations', '?select=amount&status=eq.completed'),
    ]);

    // Mode fallback si pas de connexion
    if (!goals || !goals.length) {
      container.innerHTML = `
        <div class="sgw-wrap">
          <div class="sgw-header">
            <span class="sgw-title">💰 Soutenir ResteIci</span>
          </div>
          <p class="sgw-fallback-text">Aide-nous à maintenir cette communauté bienveillante en vie.</p>
          <a href="https://www.paypal.com/ncp/payment/HH63UG4FAUG86" target="_blank" rel="noopener" class="sgw-donate-btn">
            💛 Faire un don via PayPal
          </a>
        </div>
      `;
      return;
    }

    const totalDons = (dons || []).reduce((s, d) => s + parseFloat(d.amount || 0), 0);
    const totalGoal = goals.reduce((s, g) => s + parseFloat(g.target_amount || 0), 0);
    const totalCur  = goals.reduce((s, g) => s + parseFloat(g.current_amount || 0), 0);
    const globalPct = totalGoal > 0 ? Math.min(100, Math.round((totalCur / totalGoal) * 100)) : 0;

    container.innerHTML = `
      <div class="sgw-wrap">
        <!-- Header -->
        <div class="sgw-header">
          <span class="sgw-title">💰 Nos objectifs</span>
          <a href="#donate-modal" class="sgw-donate-link" onclick="openDonate && openDonate(); return false;">Faire un don →</a>
        </div>

        <!-- Barre globale -->
        <div class="sgw-global">
          <div class="sgw-global-row">
            <span class="sgw-global-label">Progression globale</span>
            <span class="sgw-global-pct">${globalPct}%</span>
          </div>
          <div class="sgw-global-bar">
            <div class="sgw-global-fill" style="width:${globalPct}%" data-pct="${globalPct}"></div>
          </div>
          <div class="sgw-global-amounts">
            <span class="sgw-cur">${totalCur.toFixed(2)} €</span>
            <span class="sgw-sep"> récoltés sur </span>
            <span class="sgw-tar">${totalGoal.toFixed(2)} €</span>
            <span class="sgw-dons">&nbsp;· ${(dons || []).length} don${(dons || []).length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <!-- Sous-objectifs -->
        <div class="sgw-goals">
          ${goals.map(g => {
            const cur = parseFloat(g.current_amount || 0);
            const tar = parseFloat(g.target_amount || 1);
            const pct = Math.min(100, Math.round((cur / tar) * 100));
            const done = pct >= 100;
            return `
              <div class="sgw-goal ${done ? 'sgw-goal-done' : ''}">
                <div class="sgw-goal-left">
                  <span class="sgw-goal-icon">${escapeWidgetHtml(g.icon || '🎯')}</span>
                </div>
                <div class="sgw-goal-body">
                  <div class="sgw-goal-row">
                    <span class="sgw-goal-name">${escapeWidgetHtml(g.title || 'Objectif')}</span>
                    ${done ? '<span class="sgw-done-badge">✅ Atteint !</span>' : `<span class="sgw-goal-pct">${pct}%</span>`}
                  </div>
                  ${g.description ? `<div class="sgw-goal-desc">${escapeWidgetHtml(g.description)}</div>` : ''}
                  <div class="sgw-goal-bar">
                    <div class="sgw-goal-fill ${done ? 'sgw-fill-done' : ''}" style="width:${pct}%" data-pct="${pct}"></div>
                  </div>
                  <div class="sgw-goal-amounts">
                    <span class="sgw-goal-cur" style="${done ? 'color:var(--green)' : ''}">${cur.toFixed(2)} €</span>
                    <span class="sgw-goal-sep"> / ${tar.toFixed(2)} €</span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- CTA don -->
        <button class="sgw-cta-btn" onclick="openDonate && openDonate()">
          💛 Soutenir ResteIci
        </button>
        <p class="sgw-legal">Don sécurisé via PayPal · Non déductible des impôts</p>
      </div>
    `;

    // Animation des barres
    requestAnimationFrame(() => {
      container.querySelectorAll('[data-pct]').forEach(bar => {
        const pct = bar.dataset.pct;
        bar.style.width = '0%';
        setTimeout(() => {
          bar.style.transition = 'width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
          bar.style.width = pct + '%';
        }, 100);
      });
    });
  }

  function escapeWidgetHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─────────────────────────────────────────────────────────────
  // CSS du widget
  // ─────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('sgw-styles')) return;
    const style = document.createElement('style');
    style.id = 'sgw-styles';
    style.textContent = `
/* ── Widget container ──────────────────────────────────── */
.sgw-wrap {
  background: var(--surface, #14171f);
  border: 1px solid var(--border, rgba(255,255,255,0.07));
  border-radius: 16px;
  padding: 20px;
  position: relative;
  overflow: hidden;
}
.sgw-wrap::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at top left, rgba(245,169,107,0.06), transparent 60%);
  pointer-events: none;
}

/* ── Header ─────────────────────────────────────────────── */
.sgw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 8px;
}
.sgw-title {
  font-family: var(--font-display, serif);
  font-size: 1rem;
  font-weight: 700;
  color: var(--text, #eceaf5);
}
.sgw-subtitle {
  font-size: .72rem;
  color: var(--text3, #6a677e);
}
.sgw-donate-link {
  font-size: .78rem;
  color: var(--accent, #f5a96b);
  font-weight: 600;
  text-decoration: none;
  transition: opacity .2s;
  flex-shrink: 0;
}
.sgw-donate-link:hover { opacity: .7; }

/* ── Barre globale ──────────────────────────────────────── */
.sgw-global { margin-bottom: 16px; }
.sgw-global-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.sgw-global-label { font-size: .72rem; color: var(--text3, #6a677e); font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
.sgw-global-pct   { font-size: .85rem; font-weight: 700; color: var(--accent, #f5a96b); }
.sgw-global-bar   { height: 8px; background: rgba(255,255,255,.06); border-radius: 8px; overflow: hidden; margin-bottom: 6px; }
.sgw-global-fill  { height: 100%; background: linear-gradient(90deg, var(--accent, #f5a96b), #e8c06a); border-radius: 8px; }
.sgw-global-amounts { font-size: .78rem; color: var(--text3, #6a677e); }
.sgw-cur { font-weight: 700; color: var(--accent, #f5a96b); }
.sgw-tar { font-weight: 600; color: var(--text2, #a8a5bc); }
.sgw-dons { color: var(--text3, #6a677e); }

/* ── Sous-objectifs ─────────────────────────────────────── */
.sgw-goals { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.sgw-goal {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: rgba(255,255,255,.02);
  border: 1px solid var(--border, rgba(255,255,255,.07));
  border-radius: 10px;
  padding: 12px;
  transition: border-color .2s;
}
.sgw-goal:hover { border-color: rgba(255,255,255,.12); }
.sgw-goal-done { border-color: rgba(114,201,138,.2) !important; background: rgba(114,201,138,.03) !important; }
.sgw-goal-left { flex-shrink: 0; }
.sgw-goal-icon { font-size: 1.4rem; display: block; line-height: 1; }
.sgw-goal-body { flex: 1; min-width: 0; }
.sgw-goal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 3px;
  flex-wrap: wrap;
}
.sgw-goal-name { font-size: .82rem; font-weight: 600; color: var(--text, #eceaf5); }
.sgw-goal-pct  { font-size: .72rem; font-weight: 700; color: var(--accent, #f5a96b); flex-shrink: 0; }
.sgw-done-badge { font-size: .68rem; background: rgba(114,201,138,.15); color: var(--green, #72c98a); padding: 2px 7px; border-radius: 20px; font-weight: 700; flex-shrink: 0; }
.sgw-goal-desc { font-size: .72rem; color: var(--text3, #6a677e); margin-bottom: 6px; line-height: 1.4; }
.sgw-goal-bar { height: 5px; background: rgba(255,255,255,.06); border-radius: 5px; overflow: hidden; margin-bottom: 5px; }
.sgw-goal-fill { height: 100%; background: var(--accent, #f5a96b); border-radius: 5px; }
.sgw-fill-done { background: var(--green, #72c98a) !important; }
.sgw-goal-amounts { font-size: .7rem; color: var(--text3, #6a677e); }
.sgw-goal-cur { font-weight: 700; }

/* ── CTA ────────────────────────────────────────────────── */
.sgw-cta-btn {
  display: block;
  width: 100%;
  padding: 11px;
  background: var(--accent, #f5a96b);
  color: #1a0a00;
  border: none;
  border-radius: 10px;
  font-family: var(--font-body, sans-serif);
  font-size: .85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all .2s;
  margin-bottom: 8px;
}
.sgw-cta-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
.sgw-legal { font-size: .65rem; color: var(--text3, #6a677e); text-align: center; line-height: 1.4; }

/* ── Fallback ────────────────────────────────────────────── */
.sgw-fallback-text { font-size: .85rem; color: var(--text2, #a8a5bc); margin-bottom: 14px; line-height: 1.6; }
.sgw-donate-btn {
  display: block;
  padding: 11px;
  background: var(--accent, #f5a96b);
  color: #1a0a00;
  text-align: center;
  border-radius: 10px;
  font-weight: 700;
  font-size: .85rem;
  text-decoration: none;
  transition: all .2s;
}
.sgw-donate-btn:hover { filter: brightness(1.08); }

/* ── Loading skeleton ────────────────────────────────────── */
.sgw-skeleton {
  height: 14px;
  background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.08), rgba(255,255,255,.04));
  background-size: 400px 100%;
  animation: sgw-shimmer 1.4s ease-in-out infinite;
  border-radius: 7px;
  margin-bottom: 10px;
}
.sgw-sk-sm { width: 60%; height: 8px; }
@keyframes sgw-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}

/* ── Light theme ─────────────────────────────────────────── */
[data-theme="light"] .sgw-wrap { background: #fff; border-color: rgba(0,0,0,.08); }
[data-theme="light"] .sgw-goal { background: rgba(0,0,0,.02); border-color: rgba(0,0,0,.07); }
[data-theme="light"] .sgw-global-bar,
[data-theme="light"] .sgw-goal-bar { background: rgba(0,0,0,.08); }
    `;
    document.head.appendChild(style);
  }

  // ─────────────────────────────────────────────────────────────
  // Mount : cherche #resteici-goals-widget ou les conteneurs
  // ─────────────────────────────────────────────────────────────
  function mount() {
    injectStyles();

    // Cible principale : #resteici-goals-widget
    const targets = document.querySelectorAll('#resteici-goals-widget, .resteici-goals-widget');

    if (targets.length) {
      targets.forEach(t => renderWidget(t));
      return;
    }

    // Si aucun target n'est trouvé, on crée le widget dans la sidebar
    // (intégration automatique avec index.html)
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      const wrap = document.createElement('div');
      wrap.id = 'resteici-goals-widget';
      wrap.style.cssText = 'margin:16px 12px 0;';
      sidebar.insertBefore(wrap, sidebar.querySelector('.admin-sidebar-footer') || null);
      renderWidget(wrap);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // API publique pour insérer le widget manuellement
  // ─────────────────────────────────────────────────────────────
  window.SubgoalsWidget = {
    render: renderWidget,
    mount,
    refresh: () => {
      document.querySelectorAll('#resteici-goals-widget, .resteici-goals-widget').forEach(t => renderWidget(t));
    }
  };

  // Auto-mount au DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();
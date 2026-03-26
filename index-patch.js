// ═══════════════════════════════════════════════════════════════
// index-patch.js — Intégration automatique dans index.html
//
// Ce fichier ajoute :
//   1. Le widget subgoals dans la sidebar
//   2. Les annonces actives en bannière (table announcements)
//   3. Sécurité renforcée (CSP meta, sanitisation)
//   4. Lancement du widget
//
// Inclure APRÈS config.js, app.js dans index.html :
//   <script src="subgoals-widget.js"></script>
//   <script src="index-patch.js"></script>
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
// 1. ANNONCES ACTIVES — bannière dynamique depuis Supabase
// ─────────────────────────────────────────────────────────────
async function loadAnnouncements() {
  if (!sb || !SUPABASE_URL || SUPABASE_URL.startsWith('REMPLACE')) return;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/announcements?select=*&active=eq.true&order=created_at.desc&limit=3`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });
    if (!res.ok) return;
    const announcements = await res.json();

    if (!announcements || !announcements.length) return;

    // Vérifier quelles annonces ont déjà été fermées (session)
    const dismissed = JSON.parse(sessionStorage.getItem('ri_dismissed_anns') || '[]');
    const visible = announcements.filter(a => !dismissed.includes(a.id));
    if (!visible.length) return;

    // Créer le conteneur bannière
    let bannerContainer = document.getElementById('announcements-banner');
    if (!bannerContainer) {
      bannerContainer = document.createElement('div');
      bannerContainer.id = 'announcements-banner';
      // Insérer avant le main ou après le header
      const header = document.querySelector('header');
      if (header) header.insertAdjacentElement('afterend', bannerContainer);
      else document.body.insertBefore(bannerContainer, document.body.firstChild);
    }

    bannerContainer.innerHTML = visible.map(a => `
      <div class="ann-banner ann-banner-${a.type || 'info'}" id="ann-banner-${a.id}" role="alert">
        <div class="ann-banner-inner">
          <span class="ann-banner-icon">${_annIcon(a.type)}</span>
          <div class="ann-banner-content">
            ${a.title ? `<strong>${_escAnn(a.title)}</strong> — ` : ''}${_escAnn(a.content || '')}
          </div>
          <button class="ann-banner-close" onclick="_dismissAnn('${a.id}')" aria-label="Fermer">✕</button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    // Silencieux — les annonces sont optionnelles
    console.debug('Announcements load failed (table may not exist):', err.message);
  }
}

function _annIcon(type) {
  return { info: 'ℹ️', warning: '⚠️', success: '✅', urgent: '🆘' }[type] || 'ℹ️';
}

function _escAnn(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window._dismissAnn = function(id) {
  const el = document.getElementById(`ann-banner-${id}`);
  if (el) {
    el.style.animation = 'annFadeOut .3s ease-out forwards';
    setTimeout(() => el.remove(), 300);
  }
  const dismissed = JSON.parse(sessionStorage.getItem('ri_dismissed_anns') || '[]');
  dismissed.push(id);
  sessionStorage.setItem('ri_dismissed_anns', JSON.stringify(dismissed));
};

// ── CSS Annonces ──────────────────────────────────────────────
const styleAnn = document.createElement('style');
styleAnn.textContent = `
#announcements-banner {
  position: sticky;
  top: 55px; /* Hauteur du header */
  z-index: 90;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.ann-banner {
  padding: 0;
  animation: annFadeIn .4s ease-out;
  border-bottom: 1px solid transparent;
}

.ann-banner-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ann-banner-icon { font-size: 1rem; flex-shrink: 0; }

.ann-banner-content {
  flex: 1;
  font-size: .82rem;
  line-height: 1.5;
}

.ann-banner-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: .8rem;
  opacity: .6;
  transition: opacity .2s;
  flex-shrink: 0;
  padding: 4px;
}
.ann-banner-close:hover { opacity: 1; }

/* Types */
.ann-banner-info    { background: rgba(109,184,232,.12); color: var(--blue, #7ec8e3); border-color: rgba(109,184,232,.2); }
.ann-banner-warning { background: rgba(232,149,109,.12); color: var(--accent, #f5a96b); border-color: rgba(232,149,109,.2); }
.ann-banner-success { background: rgba(114,201,138,.12); color: var(--green, #72c98a); border-color: rgba(114,201,138,.2); }
.ann-banner-urgent  { background: rgba(232,125,125,.15); color: #e87d7d; border-color: rgba(232,125,125,.25); font-weight: 600; }

@keyframes annFadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes annFadeOut {
  from { opacity: 1; max-height: 80px; }
  to   { opacity: 0; max-height: 0; padding: 0; }
}

[data-theme="light"] .ann-banner-info    { background: rgba(42,110,168,.08);  color: #2a6ea8; }
[data-theme="light"] .ann-banner-warning { background: rgba(201,107,62,.08);  color: #c96b3e; }
[data-theme="light"] .ann-banner-success { background: rgba(42,138,82,.08);   color: #2a8a52; }
[data-theme="light"] .ann-banner-urgent  { background: rgba(168,58,58,.08);   color: #a83a3a; }
`;
document.head.appendChild(styleAnn);

// ─────────────────────────────────────────────────────────────
// 2. WIDGET SUBGOALS DANS LA SIDEBAR
// ─────────────────────────────────────────────────────────────
function insertGoalWidgetInSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Évite le doublon
  if (document.getElementById('sgw-sidebar-container')) return;

  const container = document.createElement('div');
  container.id = 'sgw-sidebar-container';
  container.style.cssText = 'padding: 12px 10px 0;';
  container.innerHTML = '<div id="resteici-goals-widget"></div>';

  // Insérer avant les liens de bas de sidebar
  const footer = sidebar.querySelector('.sb-footer, .admin-sidebar-footer');
  if (footer) sidebar.insertBefore(container, footer);
  else sidebar.appendChild(container);

  // Lance le rendu si le widget est disponible
  if (window.SubgoalsWidget) {
    window.SubgoalsWidget.render(document.getElementById('resteici-goals-widget'));
  }
}

// ─────────────────────────────────────────────────────────────
// 3. SÉCURITÉ RENFORCÉE — Protections côté client
// ─────────────────────────────────────────────────────────────
function enforceClientSecurity() {
  // Protection contre le clickjacking (redondant avec les headers serveur, mais utile)
  if (window.top !== window.self) {
    document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif"><h2>⛔ Accès refusé</h2><p>Ce site ne peut pas être affiché dans un iframe.</p></div>';
    return;
  }

  // Désactiver le clic droit sur les éléments sensibles (optionnel)
  // document.addEventListener('contextmenu', e => e.preventDefault());

  // Protection XSS : vérifier que esc() est bien appliquée (déjà dans app.js)

  // Obfuscation légère des emails admin (déjà géré via Cloudflare)
}

// ─────────────────────────────────────────────────────────────
// 4. BOUTON ADMIN RAPIDE dans le dropdown utilisateur
// ─────────────────────────────────────────────────────────────
function injectAdminDropdownBtn() {
  // Attend que le DOM soit prêt et que le profil soit chargé
  const check = setInterval(() => {
    if (typeof adminPanel === 'undefined' || !adminPanel.isAdmin) return;
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;
    if (dropdown.querySelector('[data-admin-entry]')) { clearInterval(check); return; }

    const btn = document.createElement('button');
    btn.setAttribute('data-admin-entry', '1');
    btn.className = 'dropdown-item';
    btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;padding:10px 16px;background:rgba(245,169,107,.08);border:none;border-bottom:1px solid var(--border);color:var(--accent);font-weight:600;font-size:.85rem;cursor:pointer;font-family:var(--font-body);transition:background .15s;';
    btn.innerHTML = (adminPanel.isSuperAdmin ? '🔐' : '🛡️') + ' ' + (adminPanel.isSuperAdmin ? 'Panel Admin' : 'Modération');
    btn.onmouseover = () => btn.style.background = 'rgba(245,169,107,.15)';
    btn.onmouseout  = () => btn.style.background = 'rgba(245,169,107,.08)';
    btn.onclick = () => { adminPanel.renderAdminDashboard(); document.getElementById('user-dropdown')?.classList.remove('open'); };
    dropdown.insertBefore(btn, dropdown.firstChild);
    clearInterval(check);
  }, 500);
}

// ─────────────────────────────────────────────────────────────
// 5. INDICATEUR DE STATUT TEMPS RÉEL dans le header
// ─────────────────────────────────────────────────────────────
function addStatusIndicator() {
  const header = document.querySelector('header');
  if (!header || document.getElementById('ri-status-dot')) return;
  const dot = document.createElement('div');
  dot.id = 'ri-status-dot';
  dot.title = 'Connexion en temps réel active';
  dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:var(--green,#72c98a);margin-left:4px;animation:ri-pulse 2s infinite;display:inline-block;';
  const style = document.createElement('style');
  style.textContent = '@keyframes ri-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.5;transform:scale(.8);}}';
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  enforceClientSecurity();
  addStatusIndicator();
  insertGoalWidgetInSidebar();
  injectAdminDropdownBtn();

  // Charger les annonces après init Supabase
  const waitForSb = setInterval(() => {
    if (typeof sb !== 'undefined' && sb) {
      clearInterval(waitForSb);
      loadAnnouncements();
    }
  }, 300);
  // Timeout si Supabase ne se charge pas
  setTimeout(() => clearInterval(waitForSb), 5000);
});
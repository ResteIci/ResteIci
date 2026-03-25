// ═══════════════════════════════════════════════════════════════
// Admin Panel — ResteIci (Secured with JWT)
// ═══════════════════════════════════════════════════════════════

const ADMIN_USERS = []; // Remplace avec les UUIDs des admins

class AdminPanel {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.isAdmin = false;
    this.is2FAVerified = false;
  }

  // Vérifie si l'utilisateur est admin et 2FA
  async checkAdminStatus(userId) {
    const { data: profile } = await this.sb
      .from('profiles')
      .select('admin_role, totp_secret, email_verified, pin_hash')
      .eq('id', userId)
      .single();

    const rawRole = profile?.admin_role || '';
    const normalizedRole = String(rawRole).replace(/^['"]|['"]$/g, '').trim().toLowerCase();

    this.isAdmin = normalizedRole === 'admin' || normalizedRole === 'moderator';
    this.profile = profile;
    return this.isAdmin;
  }

  // Vérifie 2FA
  async verify2FA() {
    if (!this.isAdmin) return false;

    // Check if 2FA is set up
    if (!this.profile.totp_secret || !this.profile.email_verified || !this.profile.pin_hash) {
      this.render2FASetup();
      return false;
    }

    // Open TOTP modal
    this.openTOTPModal();
    return new Promise((resolve) => {
      this.resolve2FA = resolve;
    });
  }

  openTOTPModal() {
    openModal('totp-modal');
    document.getElementById('totp-code').focus();
  }

  async verifyTOTP() {
    const code = document.getElementById('totp-code').value;
    const isValid = window.otplib.authenticator.check(code, this.profile.totp_secret);
    closeModal('totp-modal');
    if (isValid) {
      this.openEmailModal();
    } else {
      alert('Code TOTP invalide');
      this.resolve2FA(false);
    }
  }

  openEmailModal() {
    openModal('email-modal');
    // Send email code (simulate)
    alert('Code email envoyé (démonstration: 123456)');
  }

  async verifyEmail() {
    const code = document.getElementById('email-code').value;
    closeModal('email-modal');
    if (code === '123456') { // demo
      this.openPINModal();
    } else {
      alert('Code email invalide');
      this.resolve2FA(false);
    }
  }

  openPINModal() {
    openModal('pin-modal');
  }

  async verifyPIN() {
    const pin = document.getElementById('pin-code').value;
    const isValid = this.profile.pin_hash === btoa(pin);
    closeModal('pin-modal');
    if (isValid) {
      this.is2FAVerified = true;
      this.resolve2FA(true);
    } else {
      alert('PIN invalide');
      this.resolve2FA(false);
    }
  }

  async verifyPIN(pin) {
    // Simple hash check, in real use bcrypt
    return this.profile.pin_hash === btoa(pin); // base64 for demo
  }

  // Setup 2FA
  render2FASetup() {
    const secret = window.otplib.authenticator.generateSecret();
    const otpauth = window.otplib.authenticator.keyuri('Admin', 'ResteIci', secret);

    const html = `
      <div class="admin-2fa-setup">
        <h2>🔐 Configuration 2FA</h2>
        <p>Scannez ce QR code avec votre app authentificatrice (Google Authenticator, etc.):</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauth)}" alt="QR Code">
        <p>Secret: ${secret}</p>
        <input type="text" id="totp-test" placeholder="Entrez le code pour tester">
        <button onclick="adminPanel.testTOTP('${secret}')">Tester TOTP</button>
        <br>
        <input type="email" id="email-setup" placeholder="Votre email">
        <button onclick="adminPanel.sendEmailCode()">Envoyer code email</button>
        <input type="text" id="email-code" placeholder="Code email">
        <br>
        <input type="password" id="pin-setup" placeholder="Choisissez un PIN (4 chiffres)">
        <button onclick="adminPanel.save2FA('${secret}')">Sauvegarder 2FA</button>
      </div>
    `;

    const container = document.getElementById('admin-container') || document.createElement('div');
    container.id = 'admin-container';
    container.innerHTML = html;
    document.body.appendChild(container);
  }

  async testTOTP(secret) {
    const code = document.getElementById('totp-test').value;
    const isValid = window.otplib.authenticator.check(code, secret);
    alert(isValid ? 'TOTP valide' : 'TOTP invalide');
  }

  async sendEmailCode() {
    const email = document.getElementById('email-setup').value;
    // Send email via Supabase or external service
    // For demo, alert
    alert('Code envoyé à ' + email + ' (demo: 123456)');
  }

  async save2FA(secret) {
    const email = document.getElementById('email-setup').value;
    const emailCode = document.getElementById('email-code').value;
    const pin = document.getElementById('pin-setup').value;

    if (emailCode !== '123456' || pin.length !== 4) { // demo check
      alert('Code email ou PIN invalide');
      return;
    }

    // Save to profile
    await this.sb.from('profiles').update({
      totp_secret: secret,
      email_verified: true,
      pin_hash: btoa(pin) // demo hash
    }).eq('id', currentUser.id);

    alert('2FA configuré ! Rechargez la page.');
  }

  // Dashboard admin
  async renderAdminDashboard() {
    if (!currentUser) {
      return requireAuth(() => this.renderAdminDashboard());
    }

    const isAdmin = await this.checkAdminStatus(currentUser.id);
    if (!isAdmin) return this.showDeniedAccess();

    if (!this.is2FAVerified) {
      const verified = await this.verify2FA();
      if (!verified) return;
    }

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
  if (!adminPanel) {
    adminPanel = new AdminPanel(sb);
  }

  if (currentUser) {
    adminPanel.checkAdminStatus(currentUser.id).then(isAdmin => {
      if (isAdmin && window.location.hash === '#admin') {
        adminPanel.renderAdminDashboard();
      }
    });
  }
}

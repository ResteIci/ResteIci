// ═══════════════════════════════════════════════════════════════
// ResteIci — app.js ✅ VERSION CORRIGÉE
// Corrections : display_name cohérent, await manquant, upsert fix
// ═══════════════════════════════════════════════════════════════

let sb = null;
let currentUser = null;
let currentProfile = null;
let postLoginCallback = null;

// ─────────────────────────────────────────
// INIT SUPABASE
// ─────────────────────────────────────────
async function initSupabase() {
  if (typeof window.supabase === 'undefined') {
    console.warn('Supabase SDK non chargé — mode démo activé');
    loadDemoData();
    return;
  }
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (SUPABASE_URL.startsWith('REMPLACE')) {
      console.warn('Supabase non configuré — mode démo activé');
      document.getElementById('setup-notice').style.display = 'block';
      loadDemoData();
      return;
    }
    document.getElementById('setup-notice').style.display = 'none';

    await initAuth();
    initUserLevels();
    initRealtimeNotifications();
    initAdminPanel();
    loadFeed();
    loadStats();

    if (window.location.hash === '#admin') {
      if (currentUser) adminPanel.renderAdminDashboard();
      else requireAuth(() => adminPanel.renderAdminDashboard());
    }
  } catch (e) {
    console.error('Erreur Supabase :', e);
    loadDemoData();
  }
}

// ─────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') await onLogin(session.user);
    if (event === 'SIGNED_OUT') onLogout();
  });
}

async function onLogin(user) {
  currentUser = user;

  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
  currentProfile = data;

  if (currentProfile?.banned) {
    openModal('ban-modal');
    return;
  }

  if (typeof userLevelSystem !== 'undefined' && userLevelSystem) {
    await userLevelSystem.incrementPoints(user.id, 0);
  }

  document.getElementById('auth-btns').classList.add('hidden');
  document.getElementById('user-menu').classList.remove('hidden');
  // ✅ Fix : display_name cohérent (plus de mélange avec 'name')
  const initials = (currentProfile?.display_name || user.email || '?').slice(0, 2).toUpperCase();
  document.getElementById('user-avatar-btn').textContent = initials;

  if (postLoginCallback) {
    postLoginCallback();
    postLoginCallback = null;
    return;
  }

  if (window.location.hash === '#admin' && typeof adminPanel !== 'undefined' && adminPanel) {
    adminPanel.renderAdminDashboard();
  }

  if (typeof adminPanel !== 'undefined' && adminPanel) {
    await adminPanel.checkAdminStatus(user.id);
    if (window.location.hash === '#admin') adminPanel.renderAdminDashboard();
  }
}

function onLogout() {
  currentUser = null;
  currentProfile = null;
  document.getElementById('auth-btns').classList.remove('hidden');
  document.getElementById('user-menu').classList.add('hidden');
  showPage('home');
}

async function loginUser() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('⚠️ Remplis tous les champs.', 'error'); return; }

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('❌ ' + (error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : error.message), 'error');
    return;
  }
  showToast('✅ Connexion réussie ! Bienvenue 💛', 'success');
  showPage('home');
}

async function registerUser() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!name || !email || !password) { showToast('⚠️ Remplis tous les champs.', 'error'); return; }
  if (password.length < 8) { showToast('⚠️ Mot de passe trop court (min. 8 caractères).', 'error'); return; }

  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) { showToast('❌ ' + error.message, 'error'); return; }

  if (data.user) {
    await sb.from('profiles').insert({
      id: data.user.id,
      display_name: name,   // ✅ toujours display_name, jamais 'name'
      email: email,
      banned: false,
      report_count: 0,
      admin_role: 'user',
      created_at: new Date().toISOString()
    });
  }

  showToast('✅ Compte créé ! Vérifie ton email pour confirmer.', 'success');
  showPage('home');
}

async function logout() {
  if (sb) await sb.auth.signOut();
  else onLogout();
}

function openSettings() {
  if (!currentUser) { requireAuth(() => openSettings()); return; }
  // ✅ Fix : display_name cohérent
  document.getElementById('settings-name').value = currentProfile?.display_name || '';
  document.getElementById('settings-lang').value = i18n.currentLang;
  openModal('settings-modal');
}

async function saveSettings() {
  const name = document.getElementById('settings-name').value.trim();
  const password = document.getElementById('settings-password').value;
  const lang = document.getElementById('settings-lang').value;

  if (name) {
    // ✅ Fix : mise à jour display_name (plus 'name')
    await sb.from('profiles').update({ display_name: name }).eq('id', currentUser.id);
    currentProfile.display_name = name;
    const initials = name.slice(0, 2).toUpperCase();
    document.getElementById('user-avatar-btn').textContent = initials;
    showToast('Nom mis à jour !', 'success');
  }

  if (password) {
    if (password.length < 8) { showToast('⚠️ Mot de passe trop court.', 'error'); return; }
    await sb.auth.updateUser({ password });
    showToast('Mot de passe changé !', 'success');
  }

  if (lang !== i18n.currentLang) {
    i18n.setLang(lang);
    showToast('Langue changée ! Recharge la page.', 'success');
  }

  closeModal('settings-modal');
}

// ─────────────────────────────────────────
// FEED
// ─────────────────────────────────────────
let currentFilter = 'all';
let currentSort = 'recent';
let searchQuery = '';

async function loadFeed() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  feed.innerHTML = '<div class="spinner"></div>';

  if (!sb || SUPABASE_URL.startsWith('REMPLACE')) { loadDemoData(); return; }

  try {
    let query = sb.from('posts')
      .select('*, profiles(display_name, banned)')
      .eq('profiles.banned', false)
      .eq('approved', true);

    if (currentFilter !== 'all') query = query.eq('type', currentFilter);
    if (searchQuery) query = query.ilike('content', `%${searchQuery}%`);
    if (currentSort === 'recent') query = query.order('created_at', { ascending: false });
    if (currentSort === 'popular') query = query.order('reaction_total', { ascending: false });
    if (currentSort === 'unanswered') query = query.eq('reply_count', 0).order('created_at', { ascending: false });

    const { data, error } = await query.limit(50);
    if (error) throw error;

    renderFeed(data || []);
  } catch (e) {
    console.error(e);
    loadDemoData();
  }
}

function renderFeed(posts) {
  const feed = document.getElementById('feed');
  if (!feed) return;
  if (!posts.length) {
    feed.innerHTML = `<div class="empty-state"><span class="icon">🌱</span><p>Aucun message ici pour l'instant.<br>Sois le premier à écrire !</p></div>`;
    return;
  }
  feed.innerHTML = posts.map((p, i) => renderCard(p, i)).join('');

  posts.forEach(post => {
    const cardEl = document.getElementById(`card-${post.id}`);
    if (cardEl && typeof grokAnalyzer !== 'undefined') {
      setTimeout(() => addAIAnalysisToPost(cardEl, post.content), 200);
    }
  });

  if (posts.length >= 5) {
    const adMid = document.getElementById('ad-mid');
    if (adMid) adMid.style.display = 'block';
  }
}

function renderCard(p, idx) {
  const displayName = p.anonymous ? 'Anonyme' : (p.profiles?.display_name || p.display_name || 'Anonyme');
  const initials = displayName === 'Anonyme' ? '🤍' : displayName.slice(0, 2).toUpperCase();
  const tagClass = p.type === 'encouragement' ? 'tag-enc' : p.type === 'temoignage' ? 'tag-tem' : 'tag-que';
  const tagLabel = p.type === 'encouragement' ? '💛 Encouragement' : p.type === 'temoignage' ? '📖 Témoignage' : '💬 Question';
  const timeAgo = formatTime(p.created_at);

  const reactions = p.reactions || { '❤️': 0, '🤗': 0, '✨': 0, '🙏': 0, '💪': 0 };
  const userReactions = p.user_reactions || {};

  const reactionsHtml = Object.entries(reactions).map(([emoji, count]) => `
    <button class="reaction-btn ${userReactions[emoji] ? 'active' : ''}"
      onclick="react('${p.id}', '${emoji}', this)"
      title="${getReactionLabel(emoji)}">
      ${emoji} <span class="count">${count || 0}</span>
    </button>
  `).join('');

  const repliesHtml = (p.replies || []).map(r => `
    <div class="reply-item">
      <div class="reply-header">
        <div class="reply-avatar">${r.anonymous ? '🤍' : (r.display_name || '?').slice(0, 2).toUpperCase()}</div>
        <span class="reply-author">${escapeHtml(r.anonymous ? 'Anonyme' : (r.display_name || 'Anonyme'))}</span>
        <span class="reply-time">${formatTime(r.created_at)}</span>
      </div>
      <div class="reply-text">${escapeHtml(r.content)}</div>
    </div>
  `).join('');

  return `
    <div class="post-card fade-in" data-type="${p.type}" id="card-${p.id}" style="animation-delay:${idx * 0.04}s">
      <div class="post-card-body">
        <div class="post-header">
          <div class="post-avatar" onclick="viewProfile('${p.user_id}')">${initials}</div>
          <div class="post-meta">
            <div class="post-author">${escapeHtml(displayName)}</div>
            <div class="post-time">${timeAgo}</div>
          </div>
          <span class="post-tag ${tagClass}">${tagLabel}</span>
        </div>
        <div class="post-content">${escapeHtml(p.content)}</div>
        <div class="reactions">${reactionsHtml}</div>
        <div class="post-actions">
          <button class="action-btn" onclick="toggleReplies('${p.id}')">
            💬 <span>${(p.replies || []).length} réponse${(p.replies || []).length !== 1 ? 's' : ''}</span>
          </button>
          <button class="action-btn" onclick="sharePost('${p.id}')">🔗 Partager</button>
          <button class="action-btn report" style="margin-left:auto" onclick="openReport('${p.id}')">🚩 Signaler</button>
        </div>
      </div>
      <div class="replies-section" id="replies-${p.id}">
        ${repliesHtml}
        <div class="reply-form">
          <input class="reply-input" id="reply-input-${p.id}" placeholder="Répondre avec bienveillance..." maxlength="500">
          <button class="btn btn-primary btn-sm" onclick="submitReply('${p.id}')">Envoyer</button>
        </div>
      </div>
    </div>
  `;
}

function getReactionLabel(emoji) {
  const map = { '❤️': 'Amour', '🤗': 'Câlin', '✨': 'Inspirant', '🙏': 'Merci', '💪': 'Courage' };
  return map[emoji] || emoji;
}

// ─────────────────────────────────────────
// POST SUBMIT
// ─────────────────────────────────────────
const TOXIC = ['nul','nulle','tue-toi','inutile','stupide','idiot','idiote','va mourir',
  'suicide-toi','pd ','pute','salope','fdp','enculé','bâtard','débile','abruti',
  'ferme-la','gros con','grosse vache','cr eve','meur s'];

function isToxic(text) {
  const t = text.toLowerCase().replace(/[_\-*]/g, '');
  return TOXIC.some(w => t.includes(w));
}

async function submitPost() {
  if (!currentUser) { requireAuth(); return; }
  if (currentProfile?.banned) { openModal('ban-modal'); return; }

  const content = document.getElementById('post-content').value.trim();
  const type = document.getElementById('post-type').value;
  const anonymous = document.getElementById('post-anon').value === 'true';

  if (content.length < 15) { showToast('✏️ Message trop court (min. 15 caractères).', 'error'); return; }

  if (isToxic(content)) {
    showToast('🛡️ Message bloqué : contenu inapproprié détecté. Reste bienveillant(e) 💛', 'error');
    await incrementReportCount(currentUser.id, 1);
    return;
  }

  if (!sb || SUPABASE_URL.startsWith('REMPLACE')) {
    addDemoPost({ content, type, anonymous });
    showToast('✅ Message publié ! (mode démo)', 'success');
    document.getElementById('post-content').value = '';
    updateWriteChars();
    showPage('home');
    return;
  }

  const { error } = await sb.from('posts').insert({
    user_id: currentUser.id,
    display_name: currentProfile?.display_name || 'Anonyme',
    content,
    type,
    anonymous,
    approved: true,
    reactions: { '❤️': 0, '🤗': 0, '✨': 0, '🙏': 0, '💪': 0 },
    reaction_total: 0,
    reply_count: 0,
    report_count: 0,
    created_at: new Date().toISOString()
  });

  if (error) { showToast('❌ Erreur : ' + error.message, 'error'); return; }

  showToast('✅ Message publié ! Merci pour ta bienveillance 💛', 'success');
  document.getElementById('post-content').value = '';
  updateWriteChars();
  showPage('home');
  loadFeed();
}

// ─────────────────────────────────────────
// REACTIONS
// ─────────────────────────────────────────
async function react(postId, emoji, btn) {
  if (!currentUser) { requireAuth(() => {}); return; }

  btn.classList.toggle('active');
  const countEl = btn.querySelector('.count');
  const isActive = btn.classList.contains('active');
  const delta = isActive ? 1 : -1;
  countEl.textContent = Math.max(0, parseInt(countEl.textContent) + delta);

  if (!sb || SUPABASE_URL.startsWith('REMPLACE')) return;

  try {
    if (isActive) {
      await sb.from('reactions').upsert({ post_id: postId, user_id: currentUser.id, emoji });
    } else {
      await sb.from('reactions').delete().match({ post_id: postId, user_id: currentUser.id, emoji });
    }

    const { data: post } = await sb.from('posts').select('reactions, reaction_total').eq('id', postId).single();
    if (post) {
      const reacts = post.reactions || {};
      reacts[emoji] = Math.max(0, (reacts[emoji] || 0) + delta);
      await sb.from('posts').update({ reactions: reacts, reaction_total: (post.reaction_total || 0) + delta }).eq('id', postId);
    }
  } catch (e) { console.error(e); }
}

// ─────────────────────────────────────────
// REPLIES
// ─────────────────────────────────────────
function toggleReplies(postId) {
  document.getElementById('replies-' + postId).classList.toggle('open');
}

async function submitReply(postId) {
  if (!currentUser) { requireAuth(() => {}); return; }
  if (currentProfile?.banned) { openModal('ban-modal'); return; }

  const input = document.getElementById('reply-input-' + postId);
  const content = input.value.trim();
  if (!content) return;
  if (isToxic(content)) { showToast('🛡️ Réponse bloquée : contenu inapproprié.', 'error'); return; }

  input.value = '';

  if (!sb || SUPABASE_URL.startsWith('REMPLACE')) {
    showToast('💛 Réponse envoyée ! (mode démo)', 'success');
    return;
  }

  await sb.from('replies').insert({
    post_id: postId,
    user_id: currentUser.id,
    display_name: currentProfile?.display_name || 'Anonyme',
    anonymous: false,
    content,
    created_at: new Date().toISOString()
  });

  await sb.rpc('increment_reply_count', { post_id_arg: postId });
  showToast('💛 Réponse publiée !', 'success');
  loadFeed();
}

// ─────────────────────────────────────────
// REPORTS & BAN AUTO
// ─────────────────────────────────────────
let reportTargetId = null;

function openReport(postId) {
  if (!currentUser) { requireAuth(() => {}); return; }
  reportTargetId = postId;
  openModal('report-modal');
}

async function confirmReport() {
  if (!reportTargetId) return;
  closeModal('report-modal');

  if (!sb || SUPABASE_URL.startsWith('REMPLACE')) {
    showToast('🚩 Signalement enregistré. Merci !', 'success');
    reportTargetId = null;
    return;
  }

  await sb.from('reports').insert({
    post_id: reportTargetId,
    reporter_id: currentUser.id,
    reason: document.getElementById('report-reason').value,
    created_at: new Date().toISOString()
  });

  const { count } = await sb.from('reports').select('*', { count: 'exact' }).eq('post_id', reportTargetId);

  if (count >= 3) {
    await sb.from('posts').update({ approved: false }).eq('id', reportTargetId);
    const { data: post } = await sb.from('posts').select('user_id').eq('id', reportTargetId).single();
    if (post) await incrementReportCount(post.user_id, 3);
    showToast('🛡️ Message retiré automatiquement. Merci !', 'success');
    loadFeed();
  } else {
    showToast(`🚩 Signalement enregistré (${count}/3).`, 'success');
  }

  reportTargetId = null;
}

async function incrementReportCount(userId, amount) {
  if (!sb) return;
  const { data: profile } = await sb.from('profiles').select('report_count').eq('id', userId).single();
  if (!profile) return;
  const newCount = (profile.report_count || 0) + amount;
  const updates = { report_count: newCount };
  if (newCount >= 5) updates.banned = true;
  await sb.from('profiles').update(updates).eq('id', userId);
}

// ─────────────────────────────────────────
// STATS
// ─────────────────────────────────────────
async function loadStats() {
  if (!sb || SUPABASE_URL.startsWith('REMPLACE')) {
    animCount('stat-messages', 48);
    animCount('stat-comptes', 127);
    animCount('stat-reactions', 843);
    animCount('stat-bloques', 23);
    return;
  }

  try {
    const [posts, profiles, reactions, blocked] = await Promise.all([
      sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', true),
      sb.from('profiles').select('*', { count: 'exact', head: true }),
      sb.from('reactions').select('*', { count: 'exact', head: true }),
      sb.from('posts').select('*', { count: 'exact', head: true }).eq('approved', false),
    ]);
    animCount('stat-messages', posts.count || 0);
    animCount('stat-comptes', profiles.count || 0);
    animCount('stat-reactions', reactions.count || 0);
    animCount('stat-bloques', blocked.count || 0);
  } catch {
    animCount('stat-messages', 48);
    animCount('stat-comptes', 127);
    animCount('stat-reactions', 843);
    animCount('stat-bloques', 23);
  }
}

function animCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let cur = 0;
  const step = Math.max(1, Math.ceil(target / 25));
  const t = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur.toLocaleString('fr-FR');
    if (cur >= target) clearInterval(t);
  }, 35);
}

// ─────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────
async function viewProfile(userId) {
  navigateTo('profile');
  const header = document.getElementById('profile-header-content');
  const feed = document.getElementById('profile-feed');
  if (!header || !feed) return;
  header.innerHTML = '<div class="spinner"></div>';
  feed.innerHTML = '<div class="spinner"></div>';

  if (!sb || SUPABASE_URL.startsWith('REMPLACE')) {
    renderProfileDemo(userId);
    return;
  }

  const { data: profile } = await sb.from('profiles').select('*').eq('id', userId).single();
  const { data: posts } = await sb.from('posts').select('*').eq('user_id', userId).eq('approved', true).order('created_at', { ascending: false });

  if (!profile) { header.innerHTML = '<p>Profil introuvable.</p>'; return; }

  const initials = (profile.display_name || '?').slice(0, 2).toUpperCase();
  header.innerHTML = `
    <div class="profile-avatar-big">${initials}</div>
    <div class="profile-info">
      <div class="profile-name">${escapeHtml(profile.display_name || 'Anonyme')}</div>
      <div class="profile-bio">Membre depuis ${formatDate(profile.created_at)}</div>
      <div class="profile-stats">
        <div class="profile-stat"><span class="n">${posts?.length || 0}</span><span class="l">Messages</span></div>
        <div class="profile-stat"><span class="n">${profile.report_count || 0}</span><span class="l">Signalements</span></div>
      </div>
    </div>
  `;
  renderFeedIn(feed, posts || []);
}

function renderFeedIn(container, posts) {
  if (!posts.length) {
    container.innerHTML = `<div class="empty-state"><span class="icon">🌱</span><p>Aucun message publié.</p></div>`;
    return;
  }
  container.innerHTML = posts.map((p, i) => renderCard(p, i)).join('');
}

// ─────────────────────────────────────────
// FILTERS & SEARCH
// ─────────────────────────────────────────
function filterFeed(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  loadFeed();
}

function setSortChip(sort, btn) {
  currentSort = sort;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  loadFeed();
}

let searchTimeout;
function handleSearch(val) {
  clearTimeout(searchTimeout);
  searchQuery = val;
  searchTimeout = setTimeout(loadFeed, 400);
}

// ─────────────────────────────────────────
// SHARE
// ─────────────────────────────────────────
function sharePost(postId) {
  const url = window.location.origin + window.location.pathname + '#post-' + postId;
  if (navigator.share) {
    navigator.share({ title: 'ResteIci', text: 'Un message de soutien 💛', url });
  } else {
    navigator.clipboard.writeText(url).then(() => showToast('🔗 Lien copié !', 'success'));
  }
}

// ─────────────────────────────────────────
// DEMO MODE
// ─────────────────────────────────────────
const DEMO_POSTS = [
  { id: '1', user_id: 'u1', display_name: 'Marie', anonymous: false, type: 'encouragement', content: "Je suis passée par des moments très sombres il y a deux ans. Aujourd'hui je peux te dire que ça passe vraiment. Prends soin de toi, tu mérites d'être heureux·se. Tu n'es pas seul(e).", created_at: new Date(Date.now() - 7200000).toISOString(), reactions: { '❤️': 34, '🤗': 12, '✨': 8, '🙏': 5, '💪': 3 }, reaction_total: 62, replies: [{ display_name: 'Lucas', anonymous: false, content: 'Merci Marie, ça fait vraiment du bien à lire. 🙏', created_at: new Date(Date.now() - 3600000).toISOString() }], report_count: 0 },
  { id: '2', user_id: 'u2', display_name: 'Anonyme', anonymous: true, type: 'encouragement', content: "Si tu lis ça aujourd'hui, sache que ta présence dans ce monde a de la valeur. Même les jours où tu ne le ressens pas du tout. On est là, et on t'aime pour qui tu es.", created_at: new Date(Date.now() - 18000000).toISOString(), reactions: { '❤️': 58, '🤗': 20, '✨': 15, '🙏': 11, '💪': 7 }, reaction_total: 111, replies: [], report_count: 0 },
  { id: '3', user_id: 'u3', display_name: 'Jade', anonymous: false, type: 'temoignage', content: "J'ai subi du harcèlement scolaire pendant 3 ans. Je n'en parlais à personne par honte. Le jour où j'en ai parlé à un adulte de confiance, tout a commencé à changer. Le 3114 m'a aidée une nuit difficile.", created_at: new Date(Date.now() - 86400000).toISOString(), reactions: { '❤️': 47, '🤗': 18, '✨': 9, '🙏': 22, '💪': 14 }, reaction_total: 110, replies: [{ display_name: 'Théo', anonymous: false, content: "Merci Jade d'avoir partagé ça. Tu donnes du courage à beaucoup.", created_at: new Date(Date.now() - 72000000).toISOString() }], report_count: 0 },
  { id: '4', user_id: 'u4', display_name: 'Thomas', anonymous: false, type: 'encouragement', content: "Le harcèlement c'est lâche. Toi, tu es courageux·se d'être encore debout. Continue. 💪", created_at: new Date(Date.now() - 172800000).toISOString(), reactions: { '❤️': 21, '🤗': 9, '✨': 5, '🙏': 7, '💪': 19 }, reaction_total: 61, replies: [], report_count: 0 },
  { id: '5', user_id: 'u5', display_name: 'Anonyme', anonymous: true, type: 'temoignage', content: "J'ai pensé au pire à 16 ans. Aujourd'hui j'ai 24 ans et une vie qui me plaît. Le 3114 m'a aidé cette nuit-là. Si tu es dans le noir, appelle-les.", created_at: new Date(Date.now() - 259200000).toISOString(), reactions: { '❤️': 89, '🤗': 31, '✨': 20, '🙏': 44, '💪': 28 }, reaction_total: 212, replies: [], report_count: 0 },
  { id: '6', user_id: 'u6', display_name: 'Camille', anonymous: false, type: 'question', content: "Comment vous faites pour tenir dans les moments où tout semble impossible ? Merci d'avance 💙", created_at: new Date(Date.now() - 43200000).toISOString(), reactions: { '❤️': 12, '🤗': 8, '✨': 3, '🙏': 6, '💪': 4 }, reaction_total: 33, replies: [{ display_name: 'Marie', anonymous: false, content: "Pour moi c'était la musique et écrire dans un journal.", created_at: new Date(Date.now() - 36000000).toISOString() }], report_count: 0 },
];

let demoPosts = [...DEMO_POSTS];

function loadDemoData() {
  let filtered = [...demoPosts];
  if (currentFilter !== 'all') filtered = filtered.filter(p => p.type === currentFilter);
  if (searchQuery) filtered = filtered.filter(p => p.content.toLowerCase().includes(searchQuery.toLowerCase()) || p.display_name.toLowerCase().includes(searchQuery.toLowerCase()));
  if (currentSort === 'popular') filtered.sort((a, b) => b.reaction_total - a.reaction_total);
  if (currentSort === 'unanswered') filtered = filtered.filter(p => !p.replies.length);
  renderFeed(filtered);
  animCount('stat-messages', demoPosts.length);
  animCount('stat-comptes', 127);
  animCount('stat-reactions', 843);
  animCount('stat-bloques', 23);
}

function addDemoPost({ content, type, anonymous }) {
  demoPosts.unshift({
    id: String(Date.now()),
    user_id: 'me',
    display_name: currentProfile?.display_name || 'Toi',
    anonymous,
    type,
    content,
    created_at: new Date().toISOString(),
    reactions: { '❤️': 0, '🤗': 0, '✨': 0, '🙏': 0, '💪': 0 },
    reaction_total: 0,
    replies: [],
    report_count: 0
  });
  loadDemoData();
}

function renderProfileDemo(userId) {
  const header = document.getElementById('profile-header-content');
  const feed = document.getElementById('profile-feed');
  const post = DEMO_POSTS.find(p => p.user_id === userId) || DEMO_POSTS[0];
  const name = post.display_name;
  header.innerHTML = `
    <div class="profile-avatar-big">${name.slice(0, 2).toUpperCase()}</div>
    <div class="profile-info">
      <div class="profile-name">${escapeHtml(name)}</div>
      <div class="profile-bio">Membre de la communauté ResteIci</div>
      <div class="profile-stats">
        <div class="profile-stat"><span class="n">${DEMO_POSTS.filter(p => p.user_id === userId).length || 1}</span><span class="l">Messages</span></div>
      </div>
    </div>
  `;
  renderFeedIn(feed, DEMO_POSTS.filter(p => p.user_id === userId));
}

// ─────────────────────────────────────────
// NAVIGATION (SPA multi-pages)
// ─────────────────────────────────────────
const PAGES = ['home', 'write', 'profile', 'auth', 'ressources', 'communaute'];

function navigateTo(page) {
  PAGES.forEach(p => {
    const el = document.getElementById('page-' + p);
    if (el) el.classList.toggle('hidden', p !== page);
  });

  // Tabs de filtre visibles uniquement sur home
  const navTabs = document.getElementById('nav-tabs');
  if (navTabs) navTabs.style.display = (page === 'home') ? 'block' : 'none';

  // Mettre à jour la nav active
  document.querySelectorAll('.main-nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  if (page === 'home') loadFeed();
  if (page === 'write' && !currentUser && sb) { navigateTo('auth'); return; }
  if (page === 'communaute') loadCommunaute();
  if (page === 'ressources') { /* contenu statique */ }

  // Met à jour l'URL sans rechargement
  const titles = { home: 'Accueil', write: 'Écrire', profile: 'Profil', auth: 'Connexion', ressources: 'Ressources', communaute: 'Communauté' };
  document.title = (titles[page] || page) + ' — ResteIci';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Rétrocompatibilité
function showPage(page) { navigateTo(page); }
function scrollToFeed() { document.getElementById('feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// ─────────────────────────────────────────
// PAGE COMMUNAUTÉ — stats live
// ─────────────────────────────────────────
async function loadCommunaute() {
  const container = document.getElementById('communaute-members');
  if (!container) return;
  container.innerHTML = '<div class="spinner"></div>';

  if (!sb) { container.innerHTML = '<p style="color:var(--text3)">Mode démo — connexion requise.</p>'; return; }

  try {
    const { data: members } = await sb
      .from('profiles')
      .select('display_name, created_at, report_count')
      .eq('banned', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!members?.length) { container.innerHTML = '<div class="empty-state"><span class="icon">👥</span><p>Aucun membre encore.</p></div>'; return; }

    container.innerHTML = members.map(m => `
      <div class="member-card">
        <div class="member-avatar">${(m.display_name || '?').slice(0, 2).toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.display_name || 'Anonyme')}</div>
          <div class="member-date">Membre depuis ${formatDate(m.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div class="admin-error">Erreur de chargement.</div>';
  }
}

// ─────────────────────────────────────────
// AUTH PAGE
// ─────────────────────────────────────────
function showAuth(tab) {
  navigateTo('auth');
  switchAuthTab(tab);
}

function switchAuthTab(tab) {
  document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('auth-register-form').classList.toggle('hidden', tab !== 'register');
}

// ─────────────────────────────────────────
// THEME
// ─────────────────────────────────────────
let isDark = true;
function toggleTheme() {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  document.getElementById('theme-btn').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('ri-theme', isDark ? 'dark' : 'light');
}
const savedTheme = localStorage.getItem('ri-theme');
if (savedTheme) {
  isDark = savedTheme === 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
}

// ─────────────────────────────────────────
// DONATE
// ─────────────────────────────────────────
function openDonate() {
  openModal('donate-modal');
}
function selectAmount(amount, btn, link) {
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('donate-amount-label').textContent = amount + '€';
  const donateBtn = document.getElementById('paypal-donate-btn');
  if (donateBtn) donateBtn.href = link || `https://www.paypal.com/donate?amount=${amount}&currency_code=EUR`;
}

// ─────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ─────────────────────────────────────────
// DROPDOWN
// ─────────────────────────────────────────
function toggleDropdown() {
  document.getElementById('user-dropdown').classList.toggle('open');
}
document.addEventListener('click', e => {
  const menu = document.getElementById('user-dropdown');
  const btn = document.getElementById('user-avatar-btn');
  if (menu && !menu.contains(e.target) && e.target !== btn) menu.classList.remove('open');
});

// ─────────────────────────────────────────
// WRITE CHARS
// ─────────────────────────────────────────
function updateWriteChars() {
  const content = document.getElementById('post-content')?.value || '';
  const count = content.length;
  const el = document.getElementById('write-chars');
  const bar = document.getElementById('char-progress');
  if (el) el.textContent = count;
  if (bar) bar.style.width = Math.min(100, (count / 1500) * 100) + '%';
}

// ─────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('open');
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3800);
}

// ─────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return "À l'instant";
  if (m < 60) return `Il y a ${m} min`;
  if (h < 24) return `Il y a ${h}h`;
  if (d < 7) return `Il y a ${d} jour${d > 1 ? 's' : ''}`;
  return formatDate(isoStr);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function dismissSetup() {
  document.getElementById('setup-notice').style.display = 'none';
}

// ─────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});
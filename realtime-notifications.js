// ═══════════════════════════════════════════════════════════════
// Realtime Notifications — ✅ Fix await manquant dans onNewReply
// ═══════════════════════════════════════════════════════════════
class RealtimeNotifications {
  constructor(supabaseClient) { this.sb = supabaseClient; this.channels = []; this.notifications = []; }

  initNotifications() {
    if (!this.sb || !currentUser) return;
    const postCh = this.sb.channel('ri-posts-' + currentUser.id)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'posts' }, p => this.onNewPost(p))
      .subscribe();
    const replyCh = this.sb.channel('ri-replies-' + currentUser.id)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'replies' }, p => this.onNewReply(p))
      .subscribe();
    this.channels.push(postCh, replyCh);
  }

  onNewPost(payload) {
    if (payload.new?.user_id !== currentUser?.id) this.notify('🆕 Nouveau message !', 'Un nouveau post a été publié.');
  }

  // ✅ Fix : async + await sur la requête Supabase
  async onNewReply(payload) {
    const newReply = payload.new;
    try {
      const { data: post } = await this.sb.from('posts').select('user_id').eq('id', newReply.post_id).single();
      if (post?.user_id === currentUser?.id) this.notify('💬 Nouvelle réponse !', 'Quelqu\'un a répondu à ton message.');
    } catch {}
  }

  notify(title, message) {
    const container = document.getElementById('notif-container') || this._createContainer();
    const el = document.createElement('div');
    el.className = 'ri-notif';
    el.innerHTML = `<div class="ri-notif-title">${escapeHtml(title)}</div><div class="ri-notif-text">${escapeHtml(message)}</div>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4500);
    this.notifications.push({ title, message, ts: new Date() });
    if (this.notifications.length > 50) this.notifications.shift();
  }

  _createContainer() {
    const c = document.createElement('div');
    c.id = 'notif-container'; c.className = 'notif-container';
    document.body.appendChild(c); return c;
  }

  stopNotifications() { this.channels.forEach(ch => { try { this.sb.removeChannel(ch); } catch {} }); this.channels = []; }
}

const styleNotifs = document.createElement('style');
styleNotifs.textContent = `
.notif-container{position:fixed;top:72px;right:18px;z-index:600;display:flex;flex-direction:column;gap:9px;max-width:300px;pointer-events:none;}
.ri-notif{background:var(--surface);border-left:3px solid var(--accent);border-radius:var(--radius-sm);padding:12px 15px;box-shadow:var(--shadow);pointer-events:auto;}
.ri-notif-title{font-weight:600;font-size:.875rem;color:var(--accent);margin-bottom:3px;}
.ri-notif-text{font-size:.8rem;color:var(--text2);line-height:1.5;}
@media(max-width:600px){.notif-container{left:14px;right:14px;max-width:none;}}
`;
document.head.appendChild(styleNotifs);

let realtimeNotifications;
function initRealtimeNotifications() {
  if (sb && !realtimeNotifications) { realtimeNotifications = new RealtimeNotifications(sb); realtimeNotifications.initNotifications(); }
}

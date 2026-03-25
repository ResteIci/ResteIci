// ═══════════════════════════════════════════════════════════════
// Realtime Notifications — ResteIci ✅ CORRIGÉ
// Fix : await manquant sur la requête Supabase dans onNewReply
// ═══════════════════════════════════════════════════════════════

class RealtimeNotifications {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.channels = [];
    this.notifications = [];
  }

  initNotifications() {
    if (!this.sb || !currentUser) return;

    // Canal nouveaux posts
    const postCh = this.sb.channel('ri-posts-' + currentUser.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (p) => this.onNewPost(p))
      .subscribe();

    // Canal réponses
    const replyCh = this.sb.channel('ri-replies-' + currentUser.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replies' }, (p) => this.onNewReply(p))
      .subscribe();

    this.channels.push(postCh, replyCh);
  }

  onNewPost(payload) {
    const newPost = payload.new;
    if (newPost.user_id !== currentUser?.id) {
      this.notify('🆕 Nouveau message !', 'Un nouveau post a été publié.');
    }
  }

  // ✅ Fix : async + await sur la requête Supabase
  async onNewReply(payload) {
    const newReply = payload.new;
    try {
      const { data: post } = await this.sb
        .from('posts')
        .select('user_id')
        .eq('id', newReply.post_id)
        .single();

      if (post?.user_id === currentUser?.id) {
        this.notify('💬 Nouvelle réponse !', 'Quelqu\'un a répondu à ton message.');
      }
    } catch {}
  }

  notify(title, message) {
    const container = document.getElementById('notifications-container') || this._createContainer();

    const notifEl = document.createElement('div');
    notifEl.className = 'notification';
    notifEl.innerHTML = `
      <div class="notif-header">${escapeHtml(title)}</div>
      <div class="notif-text">${escapeHtml(message)}</div>
    `;
    container.appendChild(notifEl);
    setTimeout(() => notifEl.remove(), 4500);

    this.notifications.push({ title, message, timestamp: new Date() });
    // Limite mémoire
    if (this.notifications.length > 50) this.notifications.shift();
  }

  _createContainer() {
    const c = document.createElement('div');
    c.id = 'notifications-container';
    c.className = 'notifications-container';
    document.body.appendChild(c);
    return c;
  }

  stopNotifications() {
    this.channels.forEach(ch => {
      try { this.sb.removeChannel(ch); } catch {}
    });
    this.channels = [];
  }
}

const styleNotifs = document.createElement('style');
styleNotifs.textContent = `
.notifications-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 500;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 320px;
  pointer-events: none;
}
.notification {
  background: var(--surface);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  box-shadow: var(--shadow);
  animation: slideInRight 0.3s ease-out;
  pointer-events: auto;
}
.notif-header { font-weight: 600; font-size: 0.875rem; color: var(--accent); margin-bottom: 4px; }
.notif-text { font-size: 0.82rem; color: var(--text2); line-height: 1.5; }
@media (max-width: 640px) {
  .notifications-container { left: 16px; right: 16px; max-width: none; }
}
`;
document.head.appendChild(styleNotifs);

let realtimeNotifications;
function initRealtimeNotifications() {
  if (sb && !realtimeNotifications) {
    realtimeNotifications = new RealtimeNotifications(sb);
    realtimeNotifications.initNotifications();
  }
}
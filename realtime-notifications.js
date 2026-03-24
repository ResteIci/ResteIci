// ═══════════════════════════════════════════════════════════════
// Supabase Realtime Notifications — ResteIci
// ═══════════════════════════════════════════════════════════════

class RealtimeNotifications {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
    this.channel = null;
    this.notifications = [];
  }

  // Initialiser les notifications en temps réel
  initNotifications() {
    if (!this.sb || !currentUser) return;

    // Écoute les nouveaux posts publiés
    this.channel = this.sb.channel('posts-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => this.onNewPost(payload)
      )
      .subscribe();

    // Écoute les réponses à tes posts
    this.channel = this.sb.channel('replies-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'replies' },
        (payload) => this.onNewReply(payload)
      )
      .subscribe();
  }

  // Quand un nouveau post arrive
  onNewPost(payload) {
    const newPost = payload.new;
    if (newPost.user_id !== currentUser?.id) {
      this.notify('🆕 Nouveau message !', 'Un nouveau post a été publié.');
    }
  }

  // Quand une réponse arrive à ton post
  onNewReply(payload) {
    const newReply = payload.new;
    const { data: post } = this.sb.from('posts').select('id').eq('id', newReply.post_id).single();
    
    if (post?.user_id === currentUser?.id) {
      this.notify('💬 Nouvelle réponse !', `Quelqu'un a répondu à ton message.`);
    }
  }

  // Affiche une notification
  notify(title, message) {
    const notifEl = document.createElement('div');
    notifEl.className = 'notification';
    notifEl.innerHTML = `
      <div class="notif-header">${title}</div>
      <div class="notif-text">${message}</div>
    `;
    
    const container = document.getElementById('notifications-container') || this.createNotificationContainer();
    container.appendChild(notifEl);

    // Auto-remove après 4s
    setTimeout(() => notifEl.remove(), 4000);
    
    this.notifications.push({ title, message, timestamp: new Date() });
  }

  // Crée le conteneur de notifications
  createNotificationContainer() {
    const container = document.createElement('div');
    container.id = 'notifications-container';
    container.className = 'notifications-container';
    document.body.appendChild(container);
    return container;
  }

  // Arrête les listeners
  stopNotifications() {
    if (this.channel) {
      this.sb.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

// CSS pour notifications
const styleNotifs = document.createElement('style');
styleNotifs.textContent = `
.notifications-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 320px;
}

.notification {
  background: var(--surface);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  box-shadow: var(--shadow);
  animation: slideInRight 0.3s ease-out;
}

.notif-header {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--accent);
  margin-bottom: 4px;
}

.notif-text {
  font-size: 0.85rem;
  color: var(--text2);
  line-height: 1.5;
}

@media (max-width: 640px) {
  .notifications-container {
    left: 16px;
    right: 16px;
    max-width: none;
  }
}
`;
document.head.appendChild(styleNotifs);

// Instance globale
let realtimeNotifications;

// Initialiser quand Supabase est chargé
function initRealtimeNotifications() {
  if (sb && !realtimeNotifications) {
    realtimeNotifications = new RealtimeNotifications(sb);
    realtimeNotifications.initNotifications();
  }
}

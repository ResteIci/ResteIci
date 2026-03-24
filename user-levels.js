// ═══════════════════════════════════════════════════════════════
// User Levels & Badges System — ResteIci
// ═══════════════════════════════════════════════════════════════

const LEVELS = {
  newbie: { threshold: 0, icon: '🌱', label: 'Nouveau', color: '#72c98a' },
  active: { threshold: 5, icon: '💫', label: 'Actif', color: '#f5a96b' },
  supporter: { threshold: 20, icon: '💛', label: 'Soutien', color: '#7ec8e3' },
  mentor: { threshold: 50, icon: '🌟', label: 'Mentor', color: '#c47fb5' },
  guardian: { threshold: 100, icon: '🛡️', label: 'Gardien', color: '#e07878' },
};

class UserLevelSystem {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
  }

  // Calcule le niveau selon les points
  getLevelByPoints(points) {
    let level = 'newbie';
    Object.entries(LEVELS).forEach(([key, val]) => {
      if (points >= val.threshold) level = key;
    });
    return level;
  }

  // Ajoute une table user_levels à Supabase
  async initLevelsTable() {
    if (!this.sb) return;
    
    const sql = `
      CREATE TABLE IF NOT EXISTS user_levels (
        user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
        posts_count INTEGER DEFAULT 0,
        reactions_given INTEGER DEFAULT 0,
        replies_count INTEGER DEFAULT 0,
        current_level TEXT DEFAULT 'newbie',
        points INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    
    const { error } = await this.sb.rpc('exec_sql', { sql });
    if (error) console.error('Table creation error:', error);
  }

  // Récupère le badge pour un utilisateur
  async getUserBadge(userId) {
    if (!this.sb) return LEVELS.newbie;
    
    const { data, error } = await this.sb
      .from('user_levels')
      .select('current_level')
      .eq('user_id', userId)
      .single();

    if (error || !data) return LEVELS.newbie;
    return LEVELS[data.current_level] || LEVELS.newbie;
  }

  // Incrémente les points et met à jour le niveau
  async incrementPoints(userId, amount = 1) {
    if (!this.sb) return;
    
    const { data: currentLevel } = await this.sb
      .from('user_levels')
      .select('points')
      .eq('user_id', userId)
      .single();

    const newPoints = (currentLevel?.points || 0) + amount;
    const newLevel = this.getLevelByPoints(newPoints);

    await this.sb
      .from('user_levels')
      .upsert({ user_id: userId, points: newPoints, current_level: newLevel })
      .eq('user_id', userId);
  }

  // Affiche le badge dans un élément
  renderBadge(userId, containerEl) {
    this.getUserBadge(userId).then(badge => {
      if (containerEl) {
        containerEl.innerHTML = `
          <span class="user-badge" style="border-color: ${badge.color}; color: ${badge.color};">
            ${badge.icon} ${badge.label}
          </span>
        `;
      }
    });
  }
}

// CSS pour les badges
const styleBadges = document.createElement('style');
styleBadges.textContent = `
.user-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1.5px solid;
  background: rgba(255, 255, 255, 0.05);
  animation: pulse 2s infinite;
}

.badge-newbie { color: #72c98a; border-color: #72c98a; }
.badge-active { color: #f5a96b; border-color: #f5a96b; }
.badge-supporter { color: #7ec8e3; border-color: #7ec8e3; }
.badge-mentor { color: #c47fb5; border-color: #c47fb5; }
.badge-guardian { color: #e07878; border-color: #e07878; }

.post-author-with-badge {
  display: flex;
  align-items: center;
  gap: 8px;
}
`;
document.head.appendChild(styleBadges);

// Instance globale
let userLevelSystem;

function initUserLevels() {
  if (sb && !userLevelSystem) {
    userLevelSystem = new UserLevelSystem(sb);
    userLevelSystem.initLevelsTable();
  }
}

// ═══════════════════════════════════════════════════════════════
// User Levels & Badges System — ResteIci ✅ CORRIGÉ
// Fix : upsert sans .eq() superflu
// ═══════════════════════════════════════════════════════════════

const LEVELS = {
  newbie:    { threshold: 0,   icon: '🌱', label: 'Nouveau',  color: '#72c98a' },
  active:    { threshold: 5,   icon: '💫', label: 'Actif',    color: '#f5a96b' },
  supporter: { threshold: 20,  icon: '💛', label: 'Soutien',  color: '#7ec8e3' },
  mentor:    { threshold: 50,  icon: '🌟', label: 'Mentor',   color: '#c47fb5' },
  guardian:  { threshold: 100, icon: '🛡️', label: 'Gardien',  color: '#e07878' },
};

class UserLevelSystem {
  constructor(supabaseClient) {
    this.sb = supabaseClient;
  }

  getLevelByPoints(points) {
    let level = 'newbie';
    Object.entries(LEVELS).forEach(([key, val]) => {
      if (points >= val.threshold) level = key;
    });
    return level;
  }

  async getUserBadge(userId) {
    if (!this.sb) return LEVELS.newbie;
    try {
      const { data } = await this.sb
        .from('user_levels')
        .select('current_level')
        .eq('user_id', userId)
        .single();
      return LEVELS[data?.current_level] || LEVELS.newbie;
    } catch {
      return LEVELS.newbie;
    }
  }

  async incrementPoints(userId, amount = 1) {
    if (!this.sb || !userId) return;
    try {
      // Récupère les points actuels
      const { data: existing } = await this.sb
        .from('user_levels')
        .select('points')
        .eq('user_id', userId)
        .maybeSingle();

      const newPoints = (existing?.points || 0) + amount;
      const newLevel = this.getLevelByPoints(newPoints);

      // ✅ Fix : upsert correct — onConflict sur la clé primaire, sans .eq() après
      await this.sb.from('user_levels').upsert(
        { user_id: userId, points: newPoints, current_level: newLevel, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    } catch (err) {
      console.error('UserLevel error:', err);
    }
  }

  renderBadge(userId, containerEl) {
    this.getUserBadge(userId).then(badge => {
      if (containerEl) {
        containerEl.innerHTML = `
          <span class="user-badge" style="border-color:${badge.color};color:${badge.color}">
            ${badge.icon} ${badge.label}
          </span>
        `;
      }
    });
  }
}

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
  background: rgba(255,255,255,0.05);
}
.post-author-with-badge { display: flex; align-items: center; gap: 8px; }
`;
document.head.appendChild(styleBadges);

let userLevelSystem;
function initUserLevels() {
  if (sb && !userLevelSystem) {
    userLevelSystem = new UserLevelSystem(sb);
  }
}
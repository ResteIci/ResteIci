// ═══════════════════════════════════════════════════════════════
// User Levels — ✅ Fix upsert sans .eq() superflu
// ═══════════════════════════════════════════════════════════════
const LEVELS = {
  newbie:    { threshold:0,   icon:'🌱', label:'Nouveau',  color:'#6de8a0' },
  active:    { threshold:5,   icon:'💫', label:'Actif',    color:'#e8956d' },
  supporter: { threshold:20,  icon:'💛', label:'Soutien',  color:'#6db8e8' },
  mentor:    { threshold:50,  icon:'🌟', label:'Mentor',   color:'#b87de8' },
  guardian:  { threshold:100, icon:'🛡️', label:'Gardien',  color:'#e87d7d' },
};

class UserLevelSystem {
  constructor(supabaseClient) { this.sb = supabaseClient; }

  getLevelByPoints(pts) {
    let level = 'newbie';
    Object.entries(LEVELS).forEach(([k, v]) => { if (pts >= v.threshold) level = k; });
    return level;
  }

  async getUserBadge(userId) {
    if (!this.sb) return LEVELS.newbie;
    try {
      const { data } = await this.sb.from('user_levels').select('current_level').eq('user_id', userId).single();
      return LEVELS[data?.current_level] || LEVELS.newbie;
    } catch { return LEVELS.newbie; }
  }

  async incrementPoints(userId, amount = 1) {
    if (!this.sb || !userId) return;
    try {
      const { data: existing } = await this.sb.from('user_levels').select('points').eq('user_id', userId).maybeSingle();
      const newPoints = (existing?.points || 0) + amount;
      const newLevel = this.getLevelByPoints(newPoints);
      // ✅ Fix : onConflict sur user_id, pas de .eq() après upsert
      await this.sb.from('user_levels').upsert(
        { user_id: userId, points: newPoints, current_level: newLevel, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    } catch (err) { console.error('UserLevel error:', err); }
  }

  renderBadge(userId, el) {
    this.getUserBadge(userId).then(badge => {
      if (el) el.innerHTML = `<span class="user-badge" style="border-color:${badge.color};color:${badge.color}">${badge.icon} ${badge.label}</span>`;
    });
  }
}

const styleBadges = document.createElement('style');
styleBadges.textContent = `.user-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:600;border:1.5px solid;background:rgba(255,255,255,.04);}`;
document.head.appendChild(styleBadges);

let userLevelSystem;
function initUserLevels() {
  if (sb && !userLevelSystem) userLevelSystem = new UserLevelSystem(sb);
}

// ═══════════════════════════════════════════════════════════════
// Grok AI Integration — ResteIci  ✅ SÉCURISÉ
// Modération intelligente via Supabase Edge Function
// La clé API Grok ne passe JAMAIS côté client.
// ═══════════════════════════════════════════════════════════════

class GrokAnalyzer {
  constructor() {
    this.cache = new Map();
    this.edgeFnUrl = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '') + '/functions/v1/grok-analyze';
  }

  // ─────────────────────────────────────────────────────────────
  // ANALYSE PRINCIPALE — via Edge Function
  // Retourne : { cleaned_text, has_toxic, risk, category, action }
  // ─────────────────────────────────────────────────────────────
  async analyzePost(postContent) {
    if (!postContent || postContent.length < 2) return this._fallback(postContent);
    const key = this._hash(postContent);
    if (this.cache.has(key)) return this.cache.get(key);

    try {
      const res = await fetch(this.edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : ''}`,
        },
        body: JSON.stringify({ content: postContent.slice(0, 500) }),
      });

      if (!res.ok) throw new Error('Edge fn ' + res.status);

      const result = await res.json();

      // Validation du format retourné
      const validated = this._validateResult(result, postContent);
      this.cache.set(key, validated);
      return validated;

    } catch {
      // Fallback local si l'API échoue
      return this._fallback(postContent);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // VALIDATION — s'assure que le JSON a bien le bon format
  // ─────────────────────────────────────────────────────────────
  _validateResult(result, originalContent) {
    const allowedRisks    = ['low', 'medium', 'high'];
    const allowedActions  = ['allow', 'warn', 'block'];
    const allowedCats     = ['safe', 'harassment', 'toxic', 'suicide', 'self_harm', 'hate'];

    return {
      cleaned_text : typeof result.cleaned_text === 'string' ? result.cleaned_text : originalContent,
      has_toxic    : typeof result.has_toxic    === 'boolean' ? result.has_toxic   : false,
      risk         : allowedRisks.includes(result.risk)       ? result.risk        : 'low',
      category     : allowedCats.includes(result.category)    ? result.category    : 'safe',
      action       : allowedActions.includes(result.action)   ? result.action      : 'allow',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // DÉTECTION LOCALE — pré-filtre rapide (pas de faux positifs)
  // Utilisé en fallback ET comme vérification avant l'envoi à Grok
  // ─────────────────────────────────────────────────────────────
  detectRiskLevel(content) {
    if (!content) return 'low';
    const c = content.toLowerCase();

    const HIGH_PHRASES = [
      'je veux mourir', 'envie de mourir', 'je vais me suicider', 'je vais me tuer',
      'mettre fin à ma vie', 'plus envie de vivre', 'je ne veux plus vivre',
      'je vais le faire ce soir', 'je pense au suicide',
    ];
    const MED_PHRASES = [
      'je souffre trop', "je n'en peux plus", 'tout arrêter', 'disparaître',
      'me faire du mal', 'automutilation',
    ];

    // Mots toxiques courants — utilisés pour le fallback de censure
    const TOXIC_WORDS = [
      'merde', 'connard', 'connasse', 'salope', 'enculé', 'pute', 'fdp',
      'bâtard', 'batard', 'idiot', 'imbécile', 'crétin', 'abruti', 'nique',
      'ta gueule', 'va te faire', 'ferme ta gueule',
    ];

    if (HIGH_PHRASES.some(p => c.includes(p))) return 'high';
    if (MED_PHRASES.some(p => c.includes(p)))  return 'medium';
    if (TOXIC_WORDS.some(w => c.includes(w)))  return 'medium';
    return 'low';
  }

  // ─────────────────────────────────────────────────────────────
  // CENSURE LOCALE — remplace les mots toxiques par ***
  // Utilisé uniquement si l'API échoue
  // ─────────────────────────────────────────────────────────────
  _localCensor(content) {
    const TOXIC_WORDS = [
      'merde', 'connard', 'connasse', 'salope', 'enculé', 'pute', 'fdp',
      'bâtard', 'batard', 'idiot', 'imbécile', 'crétin', 'abruti', 'nique',
    ];
    let cleaned = content;
    TOXIC_WORDS.forEach(word => {
      const regex = new RegExp(word, 'gi');
      cleaned = cleaned.replace(regex, '***');
    });
    return cleaned;
  }

  // ─────────────────────────────────────────────────────────────
  // FALLBACK — retour sécurisé si Grok est indisponible
  // ─────────────────────────────────────────────────────────────
  _fallback(content = '') {
    const risk       = this.detectRiskLevel(content);
    const cleaned    = this._localCensor(content);
    const has_toxic  = cleaned !== content || risk !== 'low';

    let action   = 'allow';
    let category = 'safe';

    if (risk === 'high') {
      action   = 'block';
      category = 'suicide';
    } else if (risk === 'medium') {
      action   = has_toxic ? 'warn' : 'allow';
      category = has_toxic ? 'toxic' : 'safe';
    }

    return { cleaned_text: cleaned, has_toxic, risk, category, action };
  }

  _hash(str) {
    let h = 0;
    for (let i = 0; i < Math.min(str.length, 200); i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    return 'g' + h;
  }
}

// ═══════════════════════════════════════════════════════════════
// MODÉRATION DU POST AVANT PUBLICATION
// Appelée lors de la soumission d'un post (avant envoi à Supabase)
//
// Usage :
//   const result = await moderateBeforePost(textContent);
//   if (!result.allowed) return; // bloquer
//   const textToSave = result.cleanedText; // sauvegarder ce texte
// ═══════════════════════════════════════════════════════════════
async function moderateBeforePost(content) {
  if (!content || content.trim().length === 0) {
    return { allowed: false, cleanedText: content, result: null };
  }

  const result = await grokAnalyzer.analyzePost(content);

  // ── BLOCK — contenu dangereux ──────────────────────────────
  if (result.action === 'block') {
    if (result.category === 'suicide' || result.category === 'self_harm') {
      _showModerationAlert(
        '🆘 Nous avons détecté un message de détresse.',
        'Si tu traverses une crise, le <strong><a href="tel:3114">3114</a></strong> est là pour toi — gratuit, 24h/24.<br><br>Ton message n\'a pas été publié. Prends soin de toi. 💛',
        'crisis'
      );
    } else {
      _showModerationAlert(
        '🚫 Message non publié',
        'Ce message contient du contenu qui ne respecte pas les règles de la communauté et n\'a pas pu être publié.',
        'block'
      );
    }
    return { allowed: false, cleanedText: result.cleaned_text, result };
  }

  // ── WARN — contenu limite ──────────────────────────────────
  if (result.action === 'warn') {
    showToast('⚠️ Ton message a été modéré avant publication. Merci de respecter la communauté.', 'warning');
  }

  // ── ALLOW / WARN → publication avec texte nettoyé ─────────
  return { allowed: true, cleanedText: result.cleaned_text, result };
}

// ═══════════════════════════════════════════════════════════════
// AJOUT DE L'ANALYSE AI SUR UN POST AFFICHÉ DANS LE FEED
// Appeler après le rendu d'un post dans le DOM
// ═══════════════════════════════════════════════════════════════
async function addAIAnalysisToPost(postEl, postContent) {
  if (!postEl || !postContent) return;

  // Pré-filtre local rapide (pas d'appel réseau)
  const quickRisk = grokAnalyzer.detectRiskLevel(postContent);

  // Bannière crise immédiate si détecté localement
  if (quickRisk === 'high') {
    _insertCrisisBanner(postEl);
  }

  // Analyse Grok async complète (non bloquante)
  try {
    const result = await grokAnalyzer.analyzePost(postContent);

    // Bannière crise si Grok confirme (pas déjà affichée)
    if ((result.risk === 'high' || result.category === 'suicide' || result.category === 'self_harm')
        && !postEl.querySelector('.ai-risk-banner')) {
      _insertCrisisBanner(postEl);
    }

    // Remplacer le texte affiché par la version nettoyée si toxique
    if (result.has_toxic && result.cleaned_text) {
      const contentEl = postEl.querySelector('.post-content');
      if (contentEl && contentEl.textContent.trim() === postContent.trim()) {
        contentEl.textContent = result.cleaned_text;
      }
    }

    // Badge de ton (sauf si safe et low)
    if (result.risk !== 'low' || result.category !== 'safe') {
      const toneLabel = _categoryLabel(result.category, result.risk);
      if (toneLabel) {
        const el = document.createElement('span');
        el.className = `ai-tone sentiment-${_riskToSentiment(result.risk)}`;
        el.textContent = toneLabel;
        postEl.querySelector('.reactions')?.insertAdjacentElement('beforebegin', el);
      }
    }

  } catch { /* silencieux */ }
}

// ─────────────────────────────────────────────────────────────
// HELPERS INTERNES
// ─────────────────────────────────────────────────────────────

function _insertCrisisBanner(postEl) {
  if (postEl.querySelector('.ai-risk-banner')) return;
  const el = document.createElement('div');
  el.className = 'ai-risk-banner';
  el.innerHTML = `🆘 Si tu traverses une crise, le <strong><a href="tel:3114">3114</a></strong> est là pour toi — gratuit, 24h/24.`;
  const postContentEl = postEl.querySelector('.post-content');
  if (postContentEl) postContentEl.insertAdjacentElement('afterend', el);
  else postEl.prepend(el);
}

function _categoryLabel(category, risk) {
  const map = {
    harassment : '⚠️ Harcèlement',
    toxic      : '🚩 Contenu modéré',
    suicide    : '💙 Détresse',
    self_harm  : '💙 Détresse',
    hate       : '🚩 Discours haineux',
  };
  return map[category] || (risk === 'medium' ? '⚠️ Contenu sensible' : null);
}

function _riskToSentiment(risk) {
  return risk === 'high' ? 'negative' : risk === 'medium' ? 'neutral' : 'positive';
}

function _showModerationAlert(title, body, type = 'block') {
  // Supprime un ancien modal s'il existe
  document.getElementById('mod-alert-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mod-alert-modal';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9000;
    display:flex;align-items:center;justify-content:center;padding:20px;
    animation:fadeIn .2s ease-out;
  `;

  const borderColor = type === 'crisis' ? 'rgba(232,125,125,.35)' : 'rgba(245,169,107,.25)';
  const iconBg      = type === 'crisis' ? 'rgba(232,125,125,.12)' : 'rgba(245,169,107,.10)';

  overlay.innerHTML = `
    <div style="
      background:var(--surface);border:1px solid ${borderColor};border-radius:var(--radius);
      padding:28px 28px 24px;max-width:420px;width:100%;
      box-shadow:0 24px 64px rgba(0,0,0,.5);animation:scaleIn .25s cubic-bezier(.34,1.56,.64,1);
    ">
      <div style="
        width:52px;height:52px;border-radius:50%;background:${iconBg};
        display:flex;align-items:center;justify-content:center;font-size:1.6rem;margin:0 auto 16px;
      ">${type === 'crisis' ? '🆘' : '🚫'}</div>
      <h3 style="font-family:var(--font-display);font-size:1.15rem;text-align:center;margin-bottom:10px;">${title}</h3>
      <p style="color:var(--text2);font-size:.875rem;line-height:1.7;text-align:center;margin-bottom:20px;">${body}</p>
      <button onclick="document.getElementById('mod-alert-modal').remove()" style="
        width:100%;padding:11px;border-radius:var(--radius-pill);border:none;
        background:var(--accent);color:#fff;font-family:var(--font-body);
        font-size:.875rem;font-weight:600;cursor:pointer;transition:opacity .15s;
      " onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
        Compris
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────
const styleAI = document.createElement('style');
styleAI.textContent = `
.ai-risk-banner {
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: var(--rdim);
  border: 1px solid rgba(232,125,125,.25);
  font-size: .82rem;
  color: var(--red);
  line-height: 1.5;
}
.ai-risk-banner a {
  color: var(--red);
  font-weight: 700;
  text-decoration: underline;
}
.ai-tone {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 20px;
  font-size: .7rem;
  font-weight: 600;
  background: var(--surface2);
  color: var(--text3);
  margin-bottom: 8px;
}
.ai-tone.sentiment-positive { background: var(--gdim); color: var(--green); }
.ai-tone.sentiment-negative { background: var(--rdim); color: var(--red); }
.ai-tone.sentiment-neutral  { background: var(--adim); color: var(--accent); }
`;
document.head.appendChild(styleAI);

const grokAnalyzer = new GrokAnalyzer();

// ═══════════════════════════════════════════════════════════════
// EDGE FUNCTION — supabase/functions/grok-analyze/index.ts
// ─────────────────────────────────────────────────────────────
// import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
//
// const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
//
// serve(async (req) => {
//   if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
//
//   try {
//     const { content } = await req.json();
//     if (!content) return new Response(
//       JSON.stringify({ cleaned_text: "", has_toxic: false, risk: "low", category: "safe", action: "allow" }),
//       { headers: CORS }
//     );
//
//     const res = await fetch("https://api.x.ai/v1/chat/completions", {
//       method: "POST",
//       headers: {
//         "Authorization": `Bearer ${Deno.env.get("GROK_API_KEY")}`,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         model: "grok-3",
//         max_tokens: 200,
//         temperature: 0.1,
//         messages: [
//           {
//             role: "system",
//             content: `Tu es un modérateur expert en sécurité et santé mentale.
// Analyse ce message et réponds UNIQUEMENT en JSON strict (sans backticks, sans markdown) :
// {"cleaned_text":"...","has_toxic":true|false,"risk":"low"|"medium"|"high","category":"safe"|"harassment"|"toxic"|"suicide"|"self_harm"|"hate","action":"allow"|"warn"|"block"}
// Règles :
// - Remplacer les mots toxiques par "***" dans cleaned_text
// - Comprendre le contexte (pas de faux positifs : "mourir de rire", "je vais te tuer ce jeu", etc.)
// - "high" = danger grave (suicide, automutilation, menace physique directe)
// - "medium" = contenu toxique modéré
// - "low" = contenu sain
// - "block" = contenu dangereux ou haineux grave
// - "warn" = contenu limite ou légèrement toxique
// - "allow" = contenu normal
// Réponds uniquement avec le JSON.`
//           },
//           { role: "user", content: content.slice(0, 500) }
//         ]
//       })
//     });
//
//     const data = await res.json();
//     const text = data.choices?.[0]?.message?.content?.trim() || "{}";
//     const parsed = JSON.parse(text);
//
//     // Validation stricte
//     const allowedRisks   = ["low","medium","high"];
//     const allowedActions = ["allow","warn","block"];
//     const allowedCats    = ["safe","harassment","toxic","suicide","self_harm","hate"];
//     const safe = {
//       cleaned_text : typeof parsed.cleaned_text === "string" ? parsed.cleaned_text : content,
//       has_toxic    : typeof parsed.has_toxic    === "boolean" ? parsed.has_toxic   : false,
//       risk         : allowedRisks.includes(parsed.risk)       ? parsed.risk        : "low",
//       category     : allowedCats.includes(parsed.category)    ? parsed.category    : "safe",
//       action       : allowedActions.includes(parsed.action)   ? parsed.action      : "allow",
//     };
//     return new Response(JSON.stringify(safe), { headers: CORS });
//
//   } catch {
//     return new Response(
//       JSON.stringify({ cleaned_text: "", has_toxic: false, risk: "low", category: "safe", action: "allow" }),
//       { headers: CORS }
//     );
//   }
// });
//
// Déploiement :
// supabase secrets set GROK_API_KEY=ta_clé_xai_ici
// supabase functions deploy grok-analyze
// ═══════════════════════════════════════════════════════════════
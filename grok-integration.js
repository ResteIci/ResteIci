// ═══════════════════════════════════════════════════════════════
// Grok AI Integration — ResteIci  ✅ SÉCURISÉ
// La clé API Grok ne passe JAMAIS côté client.
// Elle est stockée dans une Supabase Edge Function (variable d'env).
//
// Pour configurer :
// 1. Crée une Edge Function : supabase/functions/grok-analyze/index.ts
// 2. Copie le code dans le commentaire en bas de ce fichier
// 3. Ajoute ton secret : supabase secrets set GROK_API_KEY=xai-xxxx
// 4. Déploie : supabase functions deploy grok-analyze
// ═══════════════════════════════════════════════════════════════

class GrokAnalyzer {
  constructor() {
    this.cache = new Map();
    // Appel vers la Edge Function Supabase (pas directement vers xAI)
    this.edgeFnUrl = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '') + '/functions/v1/grok-analyze';
  }

  async analyzePost(postContent) {
    if (!postContent || postContent.length < 10) return this._fallback();
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
      this.cache.set(key, result);
      return result;
    } catch { return this._fallback(); }
  }

  // Détection de risque côté client — pré-filtre rapide (pas de faux positifs)
  detectRiskLevel(content) {
    if (!content) return 'low';
    const c = content.toLowerCase();
    // Phrases complètes uniquement — évite les faux positifs sur "fin", "mourir de rire", etc.
    const HIGH = [
      'je veux mourir', 'envie de mourir', 'je vais me suicider', 'je vais me tuer',
      'mettre fin à ma vie', 'plus envie de vivre', 'je ne veux plus vivre',
      'je vais le faire ce soir', 'je pense au suicide',
    ];
    const MED = [
      'je souffre trop', 'je n\'en peux plus', 'tout arrêter', 'disparaître',
      'me faire du mal', 'automutilation',
    ];
    if (HIGH.some(p => c.includes(p))) return 'high';
    if (MED.some(w => c.includes(w))) return 'medium';
    return 'low';
  }

  _fallback() { return { sentiment: 'neutral', tone: 'neutre', recommendation: '💛 Merci de partager' }; }
  _hash(str) { let h = 0; for (let i = 0; i < Math.min(str.length, 200); i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0; return 'g' + h; }
}

async function addAIAnalysisToPost(postEl, postContent) {
  if (!postEl || !postContent) return;
  const risk = grokAnalyzer.detectRiskLevel(postContent);
  if (risk === 'high') {
    const el = document.createElement('div');
    el.className = 'ai-risk-banner';
    el.innerHTML = `🆘 Si tu traverses une crise, le <strong><a href="tel:3114">3114</a></strong> est là pour toi — gratuit, 24h/24.`;
    postEl.querySelector('.post-content')?.insertAdjacentElement('afterend', el);
  }
  // Analyse Grok async (non bloquante)
  try {
    const a = await grokAnalyzer.analyzePost(postContent);
    if (a.tone && a.tone !== 'neutre') {
      const el = document.createElement('span');
      el.className = `ai-tone sentiment-${a.sentiment}`;
      el.textContent = a.tone;
      postEl.querySelector('.reactions')?.insertAdjacentElement('beforebegin', el);
    }
  } catch {}
}

const styleAI = document.createElement('style');
styleAI.textContent = `
.ai-risk-banner{margin:10px 0;padding:10px 14px;border-radius:var(--radius-sm);background:var(--rdim);border:1px solid rgba(232,125,125,.25);font-size:.82rem;color:var(--red);line-height:1.5;}
.ai-risk-banner a{color:var(--red);font-weight:700;text-decoration:underline;}
.ai-tone{display:inline-block;padding:2px 9px;border-radius:20px;font-size:.7rem;font-weight:600;background:var(--surface2);color:var(--text3);margin-bottom:8px;}
.ai-tone.sentiment-positive{background:var(--gdim);color:var(--green);}
.ai-tone.sentiment-negative{background:var(--rdim);color:var(--red);}
`;
document.head.appendChild(styleAI);

const grokAnalyzer = new GrokAnalyzer();

/*
─────────────────────────────────────────────────────────────────────
EDGE FUNCTION — supabase/functions/grok-analyze/index.ts
─────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const { content } = await req.json();
    if (!content) return new Response(JSON.stringify({ sentiment:"neutral", tone:"neutre" }), { headers: CORS });

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("GROK_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3",
        max_tokens: 80,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `Tu es un psychologue bienveillant. Analyse ce message en JSON strict (sans backticks, sans markdown).
Format exact : {"sentiment":"positive"|"neutral"|"negative","tone":"un mot en français","recommendation":"conseil court max 8 mots"}
Ne génère que le JSON, rien d'autre.`
          },
          { role: "user", content: content.slice(0, 500) }
        ]
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(text);
    return new Response(JSON.stringify(parsed), { headers: CORS });
  } catch {
    return new Response(JSON.stringify({ sentiment:"neutral", tone:"neutre", recommendation:"Merci de partager" }), { headers: CORS });
  }
});

// Déploiement :
// supabase secrets set GROK_API_KEY=ta_clé_xai_ici
// supabase functions deploy grok-analyze
─────────────────────────────────────────────────────────────────────
*/

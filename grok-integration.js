// ═══════════════════════════════════════════════════════════════
// Grok AI Integration — ResteIci
// ✅ La clé API n'est JAMAIS exposée côté client.
//    Elle vit dans une Supabase Edge Function sécurisée.
//    Endpoint : /functions/v1/grok-analyze
// ═══════════════════════════════════════════════════════════════

class GrokAnalyzer {
  constructor() {
    this.cache = new Map();
    // Endpoint = ta Supabase Edge Function (clé Grok en variable d'env serveur)
    this.edgeFnUrl = SUPABASE_URL + '/functions/v1/grok-analyze';
  }

  // ── Analyse complète d'un post ────────────────────────────────
  async analyzePost(postContent) {
    if (!postContent || postContent.length < 10) return this._fallback();

    const key = this._hash(postContent);
    if (this.cache.has(key)) return this.cache.get(key);

    try {
      const res = await fetch(this.edgeFnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ content: postContent }),
      });

      if (!res.ok) throw new Error('Edge function error ' + res.status);

      const result = await res.json();
      this.cache.set(key, result);
      return result;
    } catch (err) {
      // Silencieux — l'analyse AI est un bonus, pas critique
      return this._fallback();
    }
  }

  // ── Détection de risque côté client (pré-filtre rapide) ──────
  // ⚠️ Ceci n'est qu'un garde-fou rapide. L'analyse fine est faite par Grok.
  detectRiskLevel(content) {
    if (!content) return 'low';
    const c = content.toLowerCase();

    // Phrases explicites à risque élevé (en français uniquement)
    const HIGH_RISK = [
      'je veux mourir', 'envie de mourir', 'je vais me suicider',
      'je vais me tuer', 'mettre fin à ma vie', 'plus envie de vivre',
      'je ne veux plus vivre', 'me donner la mort', 'je vais le faire',
    ];

    // Mots-clés intermédiaires — contexte nécessaire
    const MED_RISK = [
      'suicide', 'mourir', 'automutilation', 'me faire du mal',
      'je disparais', 'tout arrêter', 'en finir',
    ];

    if (HIGH_RISK.some(p => c.includes(p))) return 'high';
    if (MED_RISK.some(w => c.includes(w))) return 'medium';
    return 'low';
  }

  _fallback() {
    return { sentiment: 'neutral', tone: 'neutre', recommendation: '💛 Merci de partager' };
  }

  _hash(str) {
    let h = 0;
    for (let i = 0; i < Math.min(str.length, 200); i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return 'g' + h;
  }
}

// ── Ajoute une analyse AI discrète sous un post ──────────────
async function addAIAnalysisToPost(postElement, postContent) {
  if (!postElement || !postContent) return;

  // Détection de risque instantanée (client-side)
  const risk = grokAnalyzer.detectRiskLevel(postContent);

  if (risk === 'high') {
    const urgenceEl = document.createElement('div');
    urgenceEl.className = 'ai-risk-banner';
    urgenceEl.innerHTML = `
      <span>🆘</span>
      <span>Si tu traverses une crise, le <strong><a href="tel:3114">3114</a></strong> est là pour toi — gratuit, 24h/24.</span>
    `;
    postElement.querySelector('.post-content')?.insertAdjacentElement('afterend', urgenceEl);
  }

  // Analyse Grok asynchrone (non bloquante)
  try {
    const analysis = await grokAnalyzer.analyzePost(postContent);
    if (analysis.tone && analysis.tone !== 'neutre') {
      const el = document.createElement('div');
      el.className = `ai-tone-badge sentiment-${analysis.sentiment}`;
      el.textContent = analysis.tone;
      postElement.querySelector('.reactions')?.insertAdjacentElement('beforebegin', el);
    }
  } catch {}
}

// ── CSS ────────────────────────────────────────────────────────
const styleAI = document.createElement('style');
styleAI.textContent = `
.ai-risk-banner {
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: rgba(224,120,120,0.12);
  border: 1px solid rgba(224,120,120,0.25);
  font-size: 0.82rem;
  color: var(--red);
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.5;
}
.ai-risk-banner a { color: var(--red); font-weight: 700; text-decoration: underline; }

.ai-tone-badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 600;
  background: var(--surface2);
  color: var(--text3);
  margin-bottom: 8px;
}
.sentiment-positive .ai-tone-badge,
.ai-tone-badge.sentiment-positive { background: rgba(114,201,138,0.15); color: var(--green); }
.ai-tone-badge.sentiment-negative { background: rgba(224,120,120,0.12); color: var(--red); }
`;
document.head.appendChild(styleAI);

// ── Edge Function à créer dans Supabase ──────────────────────
/*
  Fichier : supabase/functions/grok-analyze/index.ts
  ────────────────────────────────────────────────────
  import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

  serve(async (req) => {
    const { content } = await req.json();

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("GROK_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3",
        max_tokens: 80,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `Tu es un psychologue bienveillant spécialisé en santé mentale.
Analyse le message suivant en JSON strict (sans markdown, sans backticks).
Réponds UNIQUEMENT avec ce JSON :
{
  "sentiment": "positive" | "neutral" | "negative",
  "tone": "mot unique décrivant le ton en français (ex: espoir, détresse, soutien, neutre, tristesse, courage)",
  "recommendation": "conseil court et bienveillant (max 10 mots)"
}
Ne jamais mettre de backticks. Répondre uniquement avec le JSON.`
          },
          { role: "user", content: content.slice(0, 500) }
        ]
      })
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    
    try {
      const parsed = JSON.parse(text);
      return new Response(JSON.stringify(parsed), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch {
      return new Response(JSON.stringify({ sentiment: "neutral", tone: "neutre", recommendation: "Merci de partager" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  });

  Variable d'environnement à configurer dans Supabase Dashboard :
  → GROK_API_KEY = ta_clé_xai_ici
*/

const grokAnalyzer = new GrokAnalyzer();
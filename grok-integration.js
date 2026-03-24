// ═══════════════════════════════════════════════════════════════
// Grok AI Integration — Post Analysis
// ═══════════════════════════════════════════════════════════════

const GROK_API_KEY = 'YOUR_GROK_KEY_HERE'; // Remplace par ta clé Grok (xAI)
const GROK_API_ENDPOINT = 'https://api.x.ai/v1/chat/completions';

class GrokAnalyzer {
  constructor(apiKey = GROK_API_KEY) {
    this.apiKey = apiKey;
    this.endpoint = GROK_API_ENDPOINT;
    this.cache = {};
  }

  // Analyse sentiment et recommandations pour un post
  async analyzePost(postContent) {
    if (!this.apiKey || this.apiKey.includes('YOUR_GROK')) {
      console.warn('Grok API key not configured');
      return this.getFallbackAnalysis();
    }

    const cacheKey = this.hashString(postContent);
    if (this.cache[cacheKey]) return this.cache[cacheKey];

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'grok-3',
          messages: [
            {
              role: 'system',
              content: 'Tu es un psychologue bienveillant et expert en analyse de sentiments. Analyse ce message court (max 100 tokens) en JSON avec: sentiment (positive/neutral/negative), tone (supportif/triste/neutre), recommandation (1 ligne courte).'
            },
            {
              role: 'user',
              content: postContent
            }
          ],
          temperature: 0.7,
          max_tokens: 100
        })
      });

      const data = await response.json();
      const analysis = this.parseGrokResponse(data);
      this.cache[cacheKey] = analysis;
      return analysis;
    } catch (err) {
      console.error('Grok API error:', err);
      return this.getFallbackAnalysis();
    }
  }

  // Parse réponse Grok
  parseGrokResponse(response) {
    try {
      const content = response.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      return {
        sentiment: parsed.sentiment || 'neutral',
        tone: parsed.tone || 'neutre',
        recommendation: parsed.recommandation || 'Continue à partager !'
      };
    } catch {
      return this.getFallbackAnalysis();
    }
  }

  // Fallback si API indisponible
  getFallbackAnalysis() {
    return {
      sentiment: 'neutral',
      tone: 'neutre',
      recommendation: '💛 Merci de partager'
    };
  }

  // Genère un hash simple
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'hash-' + hash;
  }

  // Détecte si un post pourrait être à risque (mots-clés sensibles)
  async detectRiskLevel(content) {
    const riskKeywords = ['veux mourir', 'suicide', 'fin', 'cannot take'];
    const hasRisk = riskKeywords.some(kw => content.toLowerCase().includes(kw));
    return hasRisk ? 'high' : 'low';
  }
}

// Instance globale
const grokAnalyzer = new GrokAnalyzer();

// Hook : Ajouter analyse AI aux posts
async function addAIAnalysisToPost(postElement, postContent) {
  if (!postElement) return;

  try {
    const analysis = await grokAnalyzer.analyzePost(postContent);
    const riskLevel = await grokAnalyzer.detectRiskLevel(postContent);

    // Ajoute un badge d'analyse
    const analysisEl = document.createElement('div');
    analysisEl.className = `ai-analysis sentiment-${analysis.sentiment}`;
    analysisEl.innerHTML = `
      <span class="ai-label">🤖</span>
      <span class="ai-tone">${analysis.tone}</span>
      ${riskLevel === 'high' ? '<span class="ai-risk">⚠️ Ressources d\'urgence disponibles</span>' : ''}
    `;

    postElement.querySelector('.post-content')?.insertAdjacentElement('afterend', analysisEl);
  } catch (err) {
    console.error('AI analysis error:', err);
  }
}

// CSS pour AI analysis
const styleAI = document.createElement('style');
styleAI.textContent = `
.ai-analysis {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(126,200,227,0.1);
  border: 1px solid rgba(126,200,227,0.2);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--blue);
}

.ai-analysis.sentiment-positive {
  background: rgba(114,201,138,0.1);
  border-color: rgba(114,201,138,0.2);
  color: var(--green);
}

.ai-analysis.sentiment-negative {
  background: rgba(224,120,120,0.1);
  border-color: rgba(224,120,120,0.2);
  color: var(--red);
}

.ai-label { font-size: 1rem; }
.ai-risk { background: rgba(224,120,120,0.3); padding: 2px 6px; border-radius: 6px; font-weight: 600; }
`;
document.head.appendChild(styleAI);

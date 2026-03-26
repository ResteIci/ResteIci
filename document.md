# 🔐 Guide d'intégration — ResteIci Admin v3

## Fichiers modifiés / créés

| Fichier | Rôle |
|---|---|
| `admin-panel.js` | Panel admin complet (remplace l'ancien) |
| `admin-donations.js` | Gestion dons & objectifs (remplace l'ancien) |
| `subgoals-widget.js` | Widget public des objectifs (NOUVEAU) |
| `index-patch.js` | Intégration automatique dans index.html (NOUVEAU) |

---

## 1. Intégration dans `index.html`

Ajoute ces 2 lignes **avant la fermeture `</body>`**, après tes scripts existants :

```html
<!-- EXISTANT (déjà là) -->
<script src="config.js"></script>
<script src="i18n.js"></script>
<script src="user-levels.js"></script>
<script src="realtime-notifications.js"></script>
<script src="grok-integration.js"></script>
<script src="admin-panel.js"></script>      <!-- ← remplace l'ancien -->
<script src="admin-moderation.js"></script>
<script src="admin-users.js"></script>
<script src="admin-donations.js"></script>  <!-- ← remplace l'ancien -->
<script src="app.js"></script>

<!-- NOUVEAU — à ajouter -->
<script src="subgoals-widget.js"></script>
<script src="index-patch.js"></script>
```

Le widget subgoals apparaîtra **automatiquement dans la sidebar** sans modification HTML.

---

## 2. Widget sur d'autres pages

Pour afficher le widget objectifs sur n'importe quelle page :

```html
<div id="resteici-goals-widget"></div>
<script src="config.js"></script>
<script src="subgoals-widget.js"></script>
```

---

## 3. SQL requis dans Supabase

Lance ces requêtes dans l'éditeur SQL de Supabase :

```sql
-- Table annonces
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  type TEXT DEFAULT 'info',  -- 'info' | 'warning' | 'success' | 'urgent'
  active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Politique RLS (lecture publique)
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements_read" ON announcements FOR SELECT USING (true);
CREATE POLICY "announcements_admin_write" ON announcements FOR ALL USING (auth.uid() IS NOT NULL);

-- Table subgoals (si pas encore créée)
CREATE TABLE IF NOT EXISTS subgoals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Objectif',
  description TEXT,
  icon TEXT DEFAULT '🎯',
  target_amount NUMERIC(10,2) DEFAULT 100,
  current_amount NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subgoals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subgoals_read" ON subgoals FOR SELECT USING (true);
CREATE POLICY "subgoals_admin_write" ON subgoals FOR ALL USING (auth.uid() IS NOT NULL);

-- Table donations (si pas encore créée)
CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(10,2) NOT NULL,
  donor_name TEXT DEFAULT 'Anonyme',
  source TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'completed',
  note TEXT,
  paypal_transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "donations_read" ON donations FOR SELECT USING (true);
CREATE POLICY "donations_admin_write" ON donations FOR ALL USING (auth.uid() IS NOT NULL);

-- Objectif exemple
INSERT INTO subgoals (title, description, target_amount, current_amount, icon)
VALUES
  ('Serveur 2025', 'Frais d''hébergement annuels', 500, 0, '🖥️'),
  ('Domaine', 'Renouvellement du nom de domaine', 15, 0, '🌐')
ON CONFLICT DO NOTHING;
```

---

## 4. Nouvelles fonctionnalités du panel admin

### Tableau de bord
- **📊 Statistiques** — 8 KPIs en temps réel + top contributeurs + widget objectif intégré
- **📈 Analytiques** — Graphiques Chart.js : publications par jour, inscriptions, répartition par type, activité par heure
- **🏥 Santé système** — Test de latence, vérification de chaque table, SQL requis si manquant

### Modération
- **⚠️ Signalements** — (inchangé, déjà bon)
- **👥 Utilisateurs** — (inchangé, déjà bon)
- **📝 Contenus** — NOUVEAU : liste paginée, filtre par type/statut, export CSV, approbation en masse, purge

### Communauté
- **💰 Dons & Objectifs** — Vue d'ensemble avec KPIs, mise à jour rapide par objectif, export CSV, sélection d'objectif ciblé pour les dons manuels
- **📣 Annonces** — NOUVEAU : créer/modifier/désactiver des bannières qui s'affichent sur le site

### Super Admin uniquement
- **📋 Journal d'activité** — Historique de toutes les actions admin de la session
- **🛠️ Outils avancés** — Nettoyage orphelins, recalcul compteurs, auto-ban, export utilisateurs, détection doublons, purge spam

---

## 5. Améliorations sécurité

| Protection | Implémentation |
|---|---|
| Rate limiting client | `_rateLimit(key, maxPerMin)` sur toutes les navigations |
| Anti double-soumission | Token CSRF par session (mémoire) |
| Anti-clickjacking | Vérification `window.top !== window.self` |
| Accès admin | Uniquement via `admin_role` en BDD (jamais hardcodé) |
| Sanitisation | `escapeHtml()` sur toutes les données affichées |
| Logs d'audit | `_logAction()` trace chaque action admin en session |

---

## 6. Widget Subgoals — API publique

```javascript
// Monter automatiquement sur tous les .resteici-goals-widget
SubgoalsWidget.mount();

// Rendu dans un élément spécifique
SubgoalsWidget.render(document.getElementById('mon-container'));

// Rafraîchir tous les widgets
SubgoalsWidget.refresh();
```
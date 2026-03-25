// ═══════════════════════════════════════════════════════════════
// config.js — ResteIci
// SEUL fichier à modifier avant déploiement.
// ⚠️  NE JAMAIS mettre de clé privée ici (Grok, PayPal secret…)
//     Les clés privées vont dans les variables d'environnement
//     Render/Supabase Edge Functions UNIQUEMENT.
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://wvyyroydatrgbrofqwyp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HaVAyH8F0GfdgaZB8QTPRQ_-jXz_MY_';

// ── Grok : la clé API est appelée via une Supabase Edge Function ──
// Ne jamais mettre GROK_API_KEY ici. Utilise la Edge Function à la place.
// Voir : supabase/functions/grok-analyze/index.ts

// ── Admin : plus de secret en clair dans le JS ──
// L'accès admin est vérifié UNIQUEMENT via la colonne admin_role
// dans la table profiles (côté Supabase, protégé par RLS).
// Suppression de ADMIN_OVERRIDE_SECRET et ADMIN_EMAIL_WHITELIST du front.

// ── reCAPTCHA site key (publique, OK ici) ──
const RECAPTCHA_SITE_KEY = '6LezgpYsAAAAAOh0e9-fTHPxIXuFH6wdmYIP3qf3';
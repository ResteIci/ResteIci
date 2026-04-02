const express = require('express');
const app = express();
app.use(express.json());

// Initialisation Supabase côté serveur (Node.js)
const { createClient } = require('@supabase/supabase-js');

// Ces variables doivent être définies dans les variables d'environnement Render
const SUPABASE_URL      = process.env.SUPABASE_URL      || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''; // Clé SERVICE (pas anon) pour le backend

let sb = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

const crypto = require('crypto');

// Vérification de signature PayPal via HMAC-SHA256
// Variables d'environnement requises dans Render :
//   PAYPAL_WEBHOOK_ID        — ID du webhook dans le dashboard PayPal
//   PAYPAL_CLIENT_ID         — Client ID de l'app PayPal
//   PAYPAL_CLIENT_SECRET     — Secret de l'app PayPal
function verifyPaypalWebhook(req) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  // Si la variable n'est pas configurée : on bloque par sécurité (pas de passe-passe silencieux)
  if (!webhookId) {
    console.error('⚠️  PAYPAL_WEBHOOK_ID non défini — webhook refusé par sécurité.');
    return false;
  }

  // Headers envoyés par PayPal
  const transmissionId   = req.headers['paypal-transmission-id'];
  const transmissionTime = req.headers['paypal-transmission-time'];
  const certUrl          = req.headers['paypal-cert-url'];
  const actualSig        = req.headers['paypal-transmission-sig'];

  if (!transmissionId || !transmissionTime || !certUrl || !actualSig) {
    console.error('⚠️  Headers PayPal manquants.');
    return false;
  }

  // Valider que certUrl vient bien de PayPal (protection SSRF)
  const allowedCertHosts = ['api.paypal.com', 'api.sandbox.paypal.com'];
  try {
    const certHost = new URL(certUrl).hostname;
    if (!allowedCertHosts.some(h => certHost.endsWith(h))) {
      console.error('⚠️  certUrl PayPal invalide :', certUrl);
      return false;
    }
  } catch {
    console.error('⚠️  certUrl PayPal malformée.');
    return false;
  }

  // Reconstituer la chaîne de signature PayPal
  // Format : transmissionId|transmissionTime|webhookId|crc32OfBody
  const rawBody = JSON.stringify(req.body);
  const crc32Body = crc32(rawBody);
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crc32Body}`;

  // Vérification HMAC-SHA256 avec le secret PayPal
  const secret = process.env.PAYPAL_CLIENT_SECRET || '';
  const expectedSig = crypto.createHmac('sha256', secret).update(message).digest('base64');

  const sigBuffer     = Buffer.from(actualSig,   'base64');
  const expectedBuffer = Buffer.from(expectedSig, 'base64');

  // Comparaison à temps constant (protection timing attack)
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

// Helper CRC32 (requis pour la signature PayPal)
function crc32(str) {
  let crc = 0xFFFFFFFF;
  const buf = Buffer.from(str, 'utf8');
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
    }
  }
  return ((crc ^ 0xFFFFFFFF) >>> 0).toString();
}

// PayPal Webhook pour les dons
app.post('/webhook/paypal', async (req, res) => {
  if (!verifyPaypalWebhook(req)) {
    return res.status(400).send('Invalid webhook');
  }

  const event = req.body;

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const amount = parseFloat(event.resource?.amount?.value || 0);
    const payerName = event.resource?.payer?.name
      ? `${event.resource.payer.name.given_name || ''} ${event.resource.payer.name.surname || ''}`.trim()
      : 'Anonyme';
    const transactionId = event.resource?.id || null;

    if (!sb) {
      console.error('Supabase non initialisé — vérifie SUPABASE_URL et SUPABASE_SERVICE_KEY');
      return res.status(200).send('OK'); // Toujours 200 pour PayPal
    }

    try {
      // 1. Enregistrer le don dans la table donations
      await sb.from('donations').insert({
        amount,
        donor_name: payerName,
        source: 'paypal',
        status: 'completed',
        paypal_transaction_id: transactionId,
        created_at: new Date().toISOString()
      });

      // 2. Mettre à jour le current_amount du premier sous-objectif
      const { data: goal } = await sb
        .from('subgoals')
        .select('id, current_amount')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (goal) {
        await sb.from('subgoals').update({
          current_amount: (goal.current_amount || 0) + amount
        }).eq('id', goal.id);
      }

      console.log(`Don reçu via PayPal : ${amount}€ de ${payerName}`);
    } catch (err) {
      console.error('Webhook Supabase error:', err.message);
    }
  }

  res.status(200).send('OK');
});

module.exports = app;
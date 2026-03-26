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

// Vérification basique de la signature PayPal (à remplacer par le SDK officiel en prod)
function verifyPaypalWebhook(req) {
  // TODO: Implémenter la vérification HMAC avec PAYPAL_WEBHOOK_ID
  // Pour l'instant on vérifie juste que le body est valide
  return req.body && req.body.event_type;
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
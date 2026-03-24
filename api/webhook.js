const express = require('express');
const app = express();
app.use(express.json());

// PayPal Webhook for subgoals
app.post('/webhook/paypal', async (req, res) => {
  const event = req.body;

  // Verify webhook (use PayPal SDK for verification)
  // For demo, assume valid

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const amount = event.resource.amount.value;
    // Update subgoals in Supabase
    // Assume a subgoals table
    const { data: subgoals } = await sb.from('subgoals').select('*');
    // Update progress
    // For example, add to current amount
    // This is simplified
    console.log('Don reçu:', amount);
    // Update database
  }

  res.status(200).send('OK');
});

module.exports = app;
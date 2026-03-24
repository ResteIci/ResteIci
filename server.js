const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// PayPal Webhook
app.post('/webhook/paypal', async (req, res) => {
  const event = req.body;

  // Verify with PayPal (simplified)
  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const amount = parseFloat(event.resource.amount.value);
    // Update subgoals
    const { data: subgoals } = await sb.from('subgoals').select('*').limit(1);
    if (subgoals.length > 0) {
      const current = subgoals[0].current_amount || 0;
      await sb.from('subgoals').update({ current_amount: current + amount }).eq('id', subgoals[0].id);
    }
  }

  res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
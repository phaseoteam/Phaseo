const fs = require('fs');
const Stripe = require('stripe');
const txt = fs.readFileSync('.env.local', 'utf8');
const line = txt.split(/\r?\n/).find((l) => /^\s*STRIPE_WEBHOOK_SECRET\s*=/.test(l));
if (!line) throw new Error('missing STRIPE_WEBHOOK_SECRET');
const secret = line.split('=').slice(1).join('=').trim().replace(/^['\"]|['\"]$/g, '');
const event = {
  id: 'evt_sim_manual_2',
  object: 'event',
  api_version: '2026-01-28.clover',
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'pi_sim_manual_2', object: 'payment_intent', status: 'requires_payment_method', amount: 100, amount_received: 0, metadata: { purpose: 'credits_topup_offsession', team_id: '6e01589e-72cd-4a67-b58b-329bdbb2817c' }, customer: null, payment_method: null } },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
  type: 'payment_intent.created',
};
const payload = JSON.stringify(event);
const stripe = new Stripe('sk_test_dummy');
const sig = stripe.webhooks.generateTestHeaderString({ payload, secret });
fetch('http://localhost:3100/api/webhooks/stripe-checkout', { method:'POST', headers:{'Content-Type':'application/json','stripe-signature':sig}, body:payload })
.then(async (r)=>{const b=await r.text(); console.log('team_id=6e01589e-72cd-4a67-b58b-329bdbb2817c'); console.log('status='+r.status); console.log(b.slice(0,1000));})
.catch((e)=>{console.error(e); process.exit(1);});

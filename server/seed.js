// Demo data. Deterministic (seeded PRNG) so every cold start and every
// teammate sees the same queue, and every seeded ticket goes through the
// real triage pipeline so the dashboard numbers are genuine model output.

import bcrypt from 'bcryptjs';
import { triage } from './ai/index.js';

export const DEMO_ACCOUNTS = {
  agent: { email: 'agent@smartresolve.app', password: 'agent-demo-2026' },
  customer: { email: 'rohan.mehta@example.com', password: 'customer-demo-2026' },
};

const CUSTOMERS = [
  { id: 'u-c1', name: 'Rohan Mehta', email: 'rohan.mehta@example.com', tier: 'premium' },
  { id: 'u-c2', name: 'Ananya Kulkarni', email: 'ananya.k@example.com', tier: 'standard' },
  { id: 'u-c3', name: 'Vikram Desai', email: 'vikram@desaitextiles.example.com', tier: 'enterprise' },
  { id: 'u-c4', name: 'Sneha Patil', email: 'sneha.patil@example.com', tier: 'standard' },
  { id: 'u-c5', name: 'Arjun Nair', email: 'arjun.nair@example.com', tier: 'premium' },
  { id: 'u-c6', name: 'Meera Joshi', email: 'meera.joshi@example.com', tier: 'standard' },
  { id: 'u-c7', name: 'Kunal Shah', email: 'kunal@shahlogistics.example.com', tier: 'enterprise' },
  { id: 'u-c8', name: 'Priyanka Rao', email: 'priyanka.rao@example.com', tier: 'standard' },
  { id: 'u-c9', name: 'Siddharth Ghorpade', email: 'sid.ghorpade@example.com', tier: 'standard' },
  { id: 'u-c10', name: 'Tanvi Bhosale', email: 'tanvi.b@example.com', tier: 'premium' },
  { id: 'u-c11', name: 'Omkar Jadhav', email: 'omkar.jadhav@example.com', tier: 'standard' },
  { id: 'u-c12', name: 'Isha Deshpande', email: 'isha.d@example.com', tier: 'standard' },
  { id: 'u-c13', name: 'Rahul Kamble', email: 'rahul.kamble@example.com', tier: 'standard' },
  { id: 'u-c14', name: 'Neha Chavan', email: 'neha.chavan@example.com', tier: 'premium' },
  { id: 'u-c15', name: 'Aditya Pawar', email: 'aditya@pawarfoods.example.com', tier: 'enterprise' },
  { id: 'u-c16', name: 'Pooja Shinde', email: 'pooja.shinde@example.com', tier: 'standard' },
  { id: 'u-c17', name: 'Harsh Agarwal', email: 'harsh.agarwal@example.com', tier: 'standard' },
  { id: 'u-c18', name: 'Kavya Iyer', email: 'kavya.iyer@example.com', tier: 'standard' },
  { id: 'u-c19', name: 'Yash More', email: 'yash.more@example.com', tier: 'standard' },
  { id: 'u-c20', name: 'Ritika Salunkhe', email: 'ritika.s@example.com', tier: 'premium' },
  { id: 'u-c21', name: 'Manish Thakur', email: 'manish.thakur@example.com', tier: 'standard' },
  { id: 'u-c22', name: 'Shruti Mane', email: 'shruti.mane@example.com', tier: 'standard' },
];

const AGENTS = [
  { id: 'u-a1', name: 'Priya Sawant', email: 'agent@smartresolve.app', team: 'All teams' },
];

const TEMPLATES = [
  ['Charged twice for the same order', 'I was charged twice for order #48213. Both debits are showing on my credit card statement, not pending. Please refund the duplicate immediately.'],
  ['Refund still not received', 'It has been 12 days since you approved my refund and I still have not received it. This is the third time I am writing. Unacceptable.'],
  ['Payment failed but money deducted', 'Tried paying via UPI, the app said payment failed but the money was deducted from my account. Please check.'],
  ['Need GST invoice for last order', 'Hi, how do I download the GST invoice for my order last week? Need it for office reimbursement. Thanks!'],
  ['Subscription renewed without notice', 'My subscription auto renewed and I was charged even though I cancelled it last month. Very disappointed.'],
  ['Overcharged on bulk order', 'Our company placed a bulk order and we were overcharged by nearly 18,000 rupees compared to the quoted price. Our finance team needs this corrected before month end.'],
  ['Coupon not applied', 'The coupon code FESTIVE20 was accepted but the discount did not show on the final bill.'],
  ['App crashes when I open orders', 'The app keeps crashing every time I open the Orders tab after the latest update. Android 14, Samsung phone.'],
  ['Dashboard completely down', 'Your seller dashboard is completely down for our entire team since 9am. We cannot process any orders and this is costing us revenue. Please escalate.'],
  ['Website very slow', 'The website has been really slow since yesterday, product pages take almost a minute to load.'],
  ['Blank screen after login', 'After I log in I just get a blank screen. Tried two browsers. Not working at all.'],
  ['API returning 500 errors', 'Our integration is getting 500 errors from your order API for every request since the morning. All our customers are affected.'],
  ['Notifications not coming', 'I am not getting any notifications for order updates anymore. Small issue but would like it fixed.'],
  ['Feature request: dark mode', 'Love the app! Any plans to add a dark mode? Would be great for night use.'],
  ['Upload keeps failing', 'Trying to upload our product catalogue CSV and it fails with a timeout error every time. Still not fixed after two days.'],
  ['Parcel never arrived', 'My parcel was marked delivered yesterday but it never arrived. Nobody at home received anything. I want this resolved now.'],
  ['Order delayed by a week', 'My order was supposed to arrive last Monday, tracking has not updated in 6 days. When will it come?'],
  ['Received damaged item', 'The mixer grinder I received is damaged, the jar is cracked. I need a replacement.'],
  ['Wrong item delivered', 'Ordered a size M shirt and received a completely different product. Second time this has happened with your store!'],
  ['Change delivery address', 'Can I change the delivery address for order #50112? I will be at my parents place in Kolhapur that week.'],
  ['Delivery boy was rude', 'The delivery executive was very rude and threw the package at the door. Terrible experience.'],
  ['Refund for undelivered order', 'Order never delivered and the courier says it is lost. I want my money back, not a replacement.'],
  ['Multiple orders stuck in transit', 'We have 14 orders from our business account stuck in transit for over a week. Our clients are complaining. Please look into this urgently.'],
  ['Locked out of my account', 'I am locked out of my account after entering the wrong password a few times and the reset email is not coming.'],
  ['OTP not received', 'OTP not coming on my phone for login. Tried 5 times. Cannot log in to place an urgent order.'],
  ['Suspicious login on my account', 'I got an email about a login from Delhi and I have never been there. I think my account was hacked. Please secure it.'],
  ['Unauthorized order placed', 'Someone placed an order from my account using my saved card. This is fraud, I did not make this purchase.'],
  ['How to change my email', 'How do I change the email address on my account? I no longer use the old one.'],
  ['Delete my account', 'Please delete my account and all my data. I do not want to use the service anymore.'],
  ['Two factor setup question', 'Is it possible to turn on two factor authentication with an authenticator app instead of SMS?'],
  ['Great support last time', 'Just wanted to say thank you, the agent who helped me with my refund was very helpful and quick. Great service!'],
  ['Store timings question', 'What are your support hours on Sundays?'],
  ['Return policy question', 'What is the return policy for electronics? I bought headphones last week.'],
  ['STILL NO RESPONSE', 'I HAVE RAISED THIS ISSUE THREE TIMES AND STILL NO RESPONSE. MY ORDER IS STUCK AND NOBODY CARES. WORST SERVICE EVER!!!'],
  ['Wallet balance missing', 'My wallet balance of 1,250 rupees disappeared after the app update. Where did my money go?'],
  ['Checkout error', 'Getting an error at checkout saying something went wrong. Cart has items worth 6,000 and I cannot pay.'],
];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHANNELS = ['web', 'web', 'web', 'email', 'chat', 'whatsapp'];
const HOUR = 3600e3;

const AGENT_REPLIES = {
  billing: 'Thanks for flagging this. I have raised the correction with our payments team and you will see the amount back on your original payment method within 5 to 7 working days.',
  technical: 'Thanks for the details. Our engineering team has identified the cause and pushed a fix. Please update to the latest version and let us know if it happens again.',
  delivery: 'Sorry about this. I have opened a claim with the courier and arranged a priority replacement. You will get a tracking link by SMS shortly.',
  account: 'Your account is now secured. I have reset active sessions and you can sign in with a fresh password using the link we just emailed.',
  general: 'Thanks for reaching out. I have shared the details you asked for above, and you can reply here any time if you need anything else.',
};

export async function buildSeed() {
  const rand = mulberry32(20261011);
  const now = Date.now();
  const hashes = await Promise.all([
    bcrypt.hash(DEMO_ACCOUNTS.agent.password, 8),
    bcrypt.hash(DEMO_ACCOUNTS.customer.password, 8),
  ]);

  const users = [
    ...AGENTS.map((a) => ({ ...a, role: 'agent', passwordHash: hashes[0], createdAt: new Date(now - 60 * 24 * HOUR).toISOString() })),
    ...CUSTOMERS.map((c) => ({ ...c, role: 'customer', passwordHash: hashes[1], createdAt: new Date(now - 90 * 24 * HOUR).toISOString() })),
  ];

  // Spread 84 tickets over 14 days, weighted toward recent days and office hours.
  const draft = [];
  for (let i = 0; i < 84; i++) {
    const daysAgo = Math.floor(Math.pow(rand(), 1.4) * 14);
    const hour = 8 + Math.floor(rand() * 13);
    const created = new Date(now - daysAgo * 24 * HOUR);
    created.setHours(hour, Math.floor(rand() * 60), 0, 0);
    if (created.getTime() > now) created.setTime(now - (1 + rand() * 6) * HOUR);
    // A few customers contact far more often, which feeds the repeat-contact factor.
    const ci = rand() < 0.12 ? Math.floor(rand() * 3) : Math.floor(rand() * CUSTOMERS.length);
    draft.push({ created: created.getTime(), customer: CUSTOMERS[ci], tpl: TEMPLATES[Math.floor(rand() * TEMPLATES.length)] });
  }
  // Two fixed recent cases so the queue always opens on something that matters:
  // an enterprise outage and a likely account takeover, both still open.
  draft.push(
    { created: now - 1.6 * HOUR, customer: CUSTOMERS[14], tpl: TEMPLATES[8], pinned: true },
    { created: now - 0.7 * HOUR, customer: CUSTOMERS[11], tpl: TEMPLATES[26], pinned: true },
  );
  draft.sort((a, b) => a.created - b.created);

  const tickets = [];
  let number = 1001;
  for (const d of draft) {
    const since = d.created - 7 * 24 * HOUR;
    const priorContacts = tickets.filter((t) => t.customerId === d.customer.id && Date.parse(t.createdAt) >= since).length;
    const r = await triage({ subject: d.tpl[0], message: d.tpl[1], customer: d.customer, priorContacts, offline: true });

    const ageH = (now - d.created) / HOUR;
    const sla = r.priority.slaHours;
    // Older tickets are mostly resolved; a handful are left open past SLA so the
    // escalation view has real breaches to show.
    const resolveChance = ageH > 72 ? 0.97 : ageH > 24 ? 0.85 : ageH > 6 ? 0.45 : 0.08;
    const resolved = !d.pinned && rand() < resolveChance;
    const inProgress = !d.pinned && !resolved && rand() < 0.4;
    // Most tickets land inside their target; roughly one in five overruns it.
    const resolveAfterH = Math.min(ageH * 0.9, sla * (rand() < 0.8 ? 0.2 + rand() * 0.75 : 1.1 + rand() * 1.2));
    const firstRespH = Math.min(ageH, sla * 0.8, 0.25 + rand() * 4.5);
    const createdAt = new Date(d.created).toISOString();
    const resolvedAt = resolved ? new Date(d.created + resolveAfterH * HOUR).toISOString() : null;
    const firstResponseAt = resolved || inProgress ? new Date(d.created + firstRespH * HOUR).toISOString() : null;

    const thread = [{ id: 'm1', author: 'customer', name: d.customer.name, body: r.message, at: createdAt }];
    if (firstResponseAt) {
      thread.push({ id: 'm2', author: 'agent', name: AGENTS[0].name, body: AGENT_REPLIES[r.classification.category], at: firstResponseAt });
    }

    tickets.push({
      id: `SR-${number}`,
      number: number++,
      customerId: d.customer.id,
      customerName: d.customer.name,
      customerEmail: d.customer.email,
      customerTier: d.customer.tier,
      subject: d.tpl[0],
      message: r.message,
      channel: CHANNELS[Math.floor(rand() * CHANNELS.length)],
      status: resolved ? 'resolved' : inProgress ? 'in_progress' : 'open',
      team: r.routing.team,
      sentiment: r.sentiment,
      classification: r.classification,
      priority: r.priority,
      routing: r.routing,
      redactions: r.redactions,
      articleIds: r.articles.map((a) => a.id),
      priorContacts,
      corrections: [],
      thread,
      createdAt,
      updatedAt: resolvedAt || firstResponseAt || createdAt,
      firstResponseAt,
      resolvedAt,
    });
  }

  // A handful of agent corrections, so the model-agreement metric is honest.
  for (const t of tickets.filter((x) => x.classification.confidence < 0.5).slice(0, 4)) {
    const to = t.classification.alternatives?.[0]?.category || 'general';
    if (to !== t.classification.category) {
      t.corrections.push({ field: 'category', from: t.classification.category, to, by: AGENTS[0].name, at: t.updatedAt });
    }
  }

  return { users, tickets, nextNumber: number };
}

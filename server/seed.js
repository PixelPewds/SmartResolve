// Demo data, SIMULATED. Customers, agents, tickets and feedback are invented.
// What is real: every ticket below goes through the actual triage pipeline,
// so scores, categories and routing are genuine engine output, and incident
// candidates are DETECTED from this data at runtime, not stored as answers.
//
// Deterministic (seeded PRNG) and dated relative to "now", so a re-seed just
// before a demo gives a fresh, current-looking queue.

import bcrypt from 'bcryptjs';
import { triage } from './ai/index.js';

export const DEMO_ACCOUNTS = {
  agent: { email: 'agent@smartresolve.app', password: 'agent-demo-2026' },
  supervisor: { email: 'supervisor@smartresolve.app', password: 'supervisor-demo-2026' },
  customer: { email: 'rohan.mehta@example.com', password: 'customer-demo-2026' },
};

const HOUR = 3600e3;
const MIN = 60e3;

const CUSTOMERS = [
  ['u-c1', 'Rohan Mehta', 'rohan.mehta@example.com', 'premium'],
  ['u-c2', 'Ananya Kulkarni', 'ananya.k@example.com', 'standard'],
  ['u-c3', 'Vikram Desai', 'vikram@desaitextiles.example.com', 'enterprise'],
  ['u-c4', 'Sneha Patil', 'sneha.patil@example.com', 'standard'],
  ['u-c5', 'Arjun Nair', 'arjun.nair@example.com', 'premium'],
  ['u-c6', 'Meera Joshi', 'meera.joshi@example.com', 'standard'],
  ['u-c7', 'Kunal Shah', 'kunal@shahlogistics.example.com', 'enterprise'],
  ['u-c8', 'Priyanka Rao', 'priyanka.rao@example.com', 'standard'],
  ['u-c9', 'Siddharth Ghorpade', 'sid.ghorpade@example.com', 'standard'],
  ['u-c10', 'Tanvi Bhosale', 'tanvi.b@example.com', 'premium'],
  ['u-c11', 'Omkar Jadhav', 'omkar.jadhav@example.com', 'standard'],
  ['u-c12', 'Isha Deshpande', 'isha.d@example.com', 'standard'],
  ['u-c13', 'Rahul Kamble', 'rahul.kamble@example.com', 'standard'],
  ['u-c14', 'Neha Chavan', 'neha.chavan@example.com', 'premium'],
  ['u-c15', 'Aditya Pawar', 'aditya@pawarfoods.example.com', 'enterprise'],
  ['u-c16', 'Pooja Shinde', 'pooja.shinde@example.com', 'standard'],
  ['u-c17', 'Harsh Agarwal', 'harsh.agarwal@example.com', 'standard'],
  ['u-c18', 'Kavya Iyer', 'kavya.iyer@example.com', 'standard'],
  ['u-c19', 'Yash More', 'yash.more@example.com', 'standard'],
  ['u-c20', 'Ritika Salunkhe', 'ritika.s@example.com', 'premium'],
  ['u-c21', 'Manish Thakur', 'manish.thakur@example.com', 'standard'],
  ['u-c22', 'Shruti Mane', 'shruti.mane@example.com', 'standard'],
  ['u-c23', 'Gaurav Kadam', 'gaurav.kadam@example.com', 'standard'],
  ['u-c24', 'Sanika Bhide', 'sanika.bhide@example.com', 'standard'],
  ['u-c25', 'Nikhil Sawant', 'nikhil.sawant@example.com', 'premium'],
  ['u-c26', 'Aarti Gaikwad', 'aarti.g@example.com', 'standard'],
].map(([id, name, email, tier]) => ({ id, name, email, tier }));

// More customers so repeat-contact signals stay rare and meaningful.
const FIRST = ['Aniket', 'Bhavna', 'Chetan', 'Deepa', 'Eshan', 'Farah', 'Girish', 'Hema', 'Irfan', 'Jyoti', 'Ketan', 'Lata', 'Mihir', 'Nisha', 'Ojas', 'Payal', 'Rohit', 'Swati', 'Tushar', 'Urmila', 'Varun', 'Waman', 'Yamini', 'Zubin', 'Akash', 'Bina', 'Darshan', 'Gauri', 'Jay', 'Komal'];
const LAST = ['Kale', 'Shetty', 'Naik', 'Pande', 'Bapat', 'Kapoor', 'Mhatre', 'Sathe', 'Gokhale', 'Lele', 'Ranade', 'Chitale', 'Dixit', 'Mali', 'Tambe'];
FIRST.forEach((f, i) => {
  const l = LAST[(i * 7) % LAST.length];
  CUSTOMERS.push({ id: `u-c${27 + i}`, name: `${f} ${l}`, email: `${f}.${l}@example.com`.toLowerCase(), tier: i % 9 === 0 ? 'enterprise' : i % 4 === 0 ? 'premium' : 'standard' });
});
const OTHERS = () => CUSTOMERS.slice(1); // everyone but the demo customer

export const AGENTS = [
  { id: 'u-a1', name: 'Priya Sawant', email: 'agent@smartresolve.app', title: 'Senior Support Engineer', team: 'Technical Support', skills: ['Outages', 'API & integrations', 'Mobile app'], status: 'online', capacity: 7 },
  { id: 'u-a2', name: 'Amit Kulkarni', email: 'amit.k@smartresolve.app', title: 'DevOps Support Engineer', team: 'Technical Support', skills: ['Outages', 'API & integrations'], status: 'online', capacity: 6 },
  { id: 'u-a3', name: 'Sneha Iyer', email: 'sneha.i@smartresolve.app', title: 'Mobile Support Specialist', team: 'Technical Support', skills: ['Mobile app', 'Account access'], status: 'away', capacity: 6 },
  { id: 'u-a4', name: 'Rahul Deshmukh', email: 'rahul.d@smartresolve.app', title: 'Billing Specialist', team: 'Billing', skills: ['Payments', 'Refunds', 'Invoices & GST'], status: 'online', capacity: 7 },
  { id: 'u-a5', name: 'Fatima Shaikh', email: 'fatima.s@smartresolve.app', title: 'Payments & Risk Analyst', team: 'Billing', skills: ['Payments', 'Refunds', 'Subscriptions', 'Fraud'], status: 'online', capacity: 6 },
  { id: 'u-a6', name: 'Vikas Patil', email: 'vikas.p@smartresolve.app', title: 'Logistics Coordinator', team: 'Logistics', skills: ['Delivery', 'Returns'], status: 'online', capacity: 6 },
  { id: 'u-a7', name: 'Meghna Joshi', email: 'meghna.j@smartresolve.app', title: 'Regional Logistics Lead', team: 'Logistics', skills: ['Delivery', 'West region logistics', 'Returns'], status: 'online', capacity: 8 },
  { id: 'u-a8', name: 'Arjun Rao', email: 'arjun.r@smartresolve.app', title: 'Account Security Analyst', team: 'Account & Security', skills: ['Account access', 'Fraud'], status: 'online', capacity: 6 },
  { id: 'u-a9', name: 'Kavita Nair', email: 'kavita.n@smartresolve.app', title: 'Customer Care Associate', team: 'Customer Care', skills: ['General support', 'Invoices & GST'], status: 'offline', capacity: 8 },
];
const SUPERVISOR = { id: 'u-s1', name: 'Anjali Kulkarni', email: 'supervisor@smartresolve.app', title: 'Support Supervisor', team: 'All teams', skills: [], status: 'online', capacity: 0 };

// [subject, message, rootCause, fix]. Resolution text feeds "similar resolved tickets".
const T = {
  double: ['Charged twice for the same order', 'I was charged twice for order #48213. Both debits are showing on my credit card statement, not pending. Please refund the duplicate immediately.', 'Payment gateway retried a timed-out capture and both captures settled.', 'Refunded the duplicate capture, shared the refund reference with the customer.'],
  refund: ['Refund still not received', 'It has been 12 days since you approved my refund and I still have not received it. This is the third time I am writing. Unacceptable.', 'Refund was approved but stuck in the bank settlement batch.', 'Re-triggered the refund through the gateway, confirmed credit with the bank reference.'],
  upiFail: ['Payment failed but money deducted', 'Tried paying via UPI, the app said payment failed but the money was deducted from my account. Please check.', 'UPI callback from the bank arrived after our timeout, order was never created.', 'Matched the transaction ID and processed the auto-reversal manually.'],
  gst: ['Need GST invoice for last order', 'Hi, how do I download the GST invoice for my order last week? Need it for office reimbursement. Thanks!', 'Customer could not find the invoice option.', 'Shared the steps from KB-103 and attached the invoice PDF.'],
  renew: ['Subscription renewed without notice', 'My subscription auto renewed and I was charged even though I cancelled it last month. Very disappointed.', 'Cancellation request was saved but not synced to the billing provider.', 'Refunded the renewal and confirmed the subscription is cancelled.'],
  bulk: ['Overcharged on bulk order', 'Our company placed a bulk order and we were overcharged by nearly 18,000 rupees compared to the quoted price. Our finance team needs this corrected before month end.', 'Bulk discount tier was not applied at checkout.', 'Issued a credit note for the difference and fixed the price rule.'],
  coupon: ['Coupon not applied', 'The coupon code FESTIVE20 was accepted but the discount did not show on the final bill.', 'Coupon excluded sale items but the message did not say so.', 'Refunded the discount amount as a goodwill credit.'],
  crash: ['App crashes when I open orders', 'The app keeps crashing every time I open the Orders tab after the latest update. Android 14, Samsung phone.', 'Null value in an old order record crashed the Orders screen in app version 5.2.', 'Hotfix 5.2.1 released, asked the customer to update.'],
  dashboard: ['Dashboard completely down', 'Your seller dashboard is completely down for our entire team since 9am. We cannot process any orders and this is costing us revenue. Please escalate.', 'Expired TLS certificate on the dashboard load balancer.', 'Certificate renewed and auto-renewal monitoring added.'],
  blank: ['Blank screen after login', 'After I log in I just get a blank screen. Tried two browsers. Not working at all.', 'Browser extension blocked a script on the account page.', 'Asked customer to disable the ad blocker for our domain.'],
  api500: ['API returning 500 errors', 'Our integration is getting 500 errors from your order API for every request since the morning. All our customers are affected.', 'Bad deploy of the order service rejected a new optional field.', 'Rolled back the deploy and added a contract test.'],
  notif: ['Notifications not coming', 'I am not getting any notifications for order updates anymore. Small issue but would like it fixed.', 'Notification permission was reset by the phone OS update.', 'Guided the customer to re-enable notifications.'],
  darkmode: ['Feature request: dark mode', 'Love the app! Any plans to add a dark mode? Would be great for night use.', 'Feature request.', 'Logged the request with the product team and thanked the customer.'],
  upload: ['Upload keeps failing', 'Trying to upload our product catalogue CSV and it fails with a timeout error every time. Still not fixed after two days.', 'Upload limit was 5 MB, catalogue was 9 MB.', 'Raised the limit to 20 MB and confirmed the upload.'],
  parcel: ['Parcel never arrived', 'My parcel was marked delivered yesterday but it never arrived. Nobody at home received anything. I want this resolved now.', 'Courier marked delivered at the wrong address.', 'Courier claim raised, replacement shipped with priority.'],
  delayed: ['Order delayed by a week', 'My order was supposed to arrive last Monday, tracking has not updated in 6 days. When will it come?', 'Parcel was held at the hub because of a missing address detail.', 'Updated the address with the courier, delivered the next day.'],
  damaged: ['Received damaged item', 'The mixer grinder I received is damaged, the jar is cracked. I need a replacement.', 'Item damaged in transit, packaging was not reinforced.', 'Replacement shipped and packaging standard flagged to the warehouse.'],
  wrong: ['Wrong item delivered', 'Ordered a size M shirt and received a completely different product. Second time this has happened with your store!', 'Picking error at the warehouse, two orders swapped.', 'Correct item shipped, return pickup scheduled for the wrong one.'],
  address: ['Change delivery address', 'Can I change the delivery address for order #50112? I will be at my parents place in Kolhapur that week.', 'Address change request before dispatch.', 'Updated the address before dispatch.'],
  rude: ['Delivery boy was rude', 'The delivery executive was very rude and threw the package at the door. Terrible experience.', 'Courier partner conduct issue.', 'Reported to the courier partner, apology and voucher sent.'],
  transit: ['Multiple orders stuck in transit', 'We have 14 orders from our business account stuck in transit for over a week. Our clients are complaining. Please look into this urgently.', 'Hub congestion after a regional strike.', 'Rerouted through an alternate hub, all 14 delivered within 2 days.'],
  locked: ['Locked out of my account', 'I am locked out of my account after entering the wrong password a few times and the reset email is not coming.', 'Reset emails were going to spam for this email provider.', 'Unlocked the account and fixed the sender domain records.'],
  otp: ['OTP not received', 'OTP not coming on my phone for login. Tried 5 times. Cannot log in to place an urgent order.', 'DND setting blocked transactional SMS.', 'Switched the customer to email OTP and explained the DND setting.'],
  hacked: ['Suspicious login on my account', 'I got an email about a login from Delhi and I have never been there. I think my account was hacked. Please secure it.', 'Password reused from a breached site.', 'Reset sessions, forced password change, enabled two-factor authentication.'],
  fraud: ['Unauthorized order placed', 'Someone placed an order from my account using my saved card. This is fraud, I did not make this purchase.', 'Account takeover through a phishing link.', 'Cancelled the order, refunded, locked the account and removed the saved card.'],
  email: ['How to change my email', 'How do I change the email address on my account? I no longer use the old one.', 'Customer needed the email change steps.', 'Verified identity and updated the email.'],
  thanks: ['Great support last time', 'Just wanted to say thank you, the agent who helped me with my refund was very helpful and quick. Great service!', 'Positive feedback.', 'Thanked the customer and shared the feedback with the team.'],
  hours: ['Support hours question', 'What are your support hours on Sundays?', 'General enquiry.', 'Shared the support hours.'],
  caps: ['STILL NO RESPONSE', 'I HAVE RAISED THIS ISSUE THREE TIMES AND STILL NO RESPONSE. MY ORDER IS STUCK AND NOBODY CARES. WORST SERVICE EVER!!!', 'Earlier tickets were merged and the reply went to the wrong thread.', 'Apologised, delivered the order and linked the customer\'s tickets.'],
  wallet: ['Wallet balance missing', 'My wallet balance of 1,250 rupees disappeared after the app update. Where did my money go?', 'Display bug in app 5.2, balance was intact.', 'Confirmed balance on the server, fixed in 5.2.1.'],
  checkout: ['Checkout error', 'Getting an error at checkout saying something went wrong. Cart has items worth 6,000 and I cannot pay.', 'One item in the cart had gone out of stock.', 'Removed the item and the customer completed the payment.'],
};
const BACKGROUND = Object.keys(T);

// Live scenario 1: a real spike, all inside the last 3 hours.
const SPIKE_WEB = [
  ['Website very slow', 'The website has been very slow for the last hour, pages take forever to load.'],
  ['Pages not loading', 'Product pages are not loading on the website, I just see a spinner.'],
  ['Website not loading', 'Your website is not loading at all on my laptop, pages keep spinning.'],
  ['Site extremely slow', 'Website extremely slow right now, every page takes a minute to load.'],
  ['Cannot open product pages', 'Cannot open any product page, the website keeps loading forever.'],
  ['Checkout page not loading', 'The checkout page is not loading on the website, pages time out.'],
  ['Is the website down?', 'Is the website down? Pages are not loading since this afternoon.'],
  ['Website slow on mobile too', 'Website pages are very slow on my mobile browser too, not loading properly.'],
];
// Live scenario 2: a regional delivery spike.
const SPIKE_KOP = [
  ['Delivery to Kolhapur delayed', 'My delivery to Kolhapur is delayed, tracking is stuck at the Pune hub for two days.'],
  ['Kolhapur parcel stuck in transit', 'Parcel for Kolhapur still not delivered, courier tracking stuck in transit at Pune hub.'],
  ['Order to Kolhapur late', 'My Kolhapur order is late, courier says it is stuck in transit at the Pune hub.'],
  ['Kolhapur delivery not updated', 'Kolhapur delivery delayed, courier tracking has not updated since the Pune hub.'],
];
// Normal-volume group: similar wording, but spread out, so NOT a spike.
const STEADY_CRASH = ['App crashes after update', 'The app crashes after the latest update whenever I open it.'];
// Past incidents.
const PAST_UPI = ['UPI payment failed', 'UPI payment failed but money was deducted from my bank account.'];
const PAST_CRASH = ['App crashing after update', 'The app keeps crashing after the latest update, cannot use it.'];

const FEEDBACK = {
  5: ['Quick and clear, thank you.', 'Resolved faster than I expected.', 'Agent explained everything properly.', ''],
  4: ['Good, took a little longer than I hoped.', 'Sorted, thanks.', ''],
  3: ['Resolved, but I had to follow up twice.', 'Okay experience.'],
  2: ['Took too long and I had to repeat myself.', 'Fixed eventually, not happy with the wait.'],
  1: ['Nobody replied for two days.', 'Still not satisfied with the answer.'],
};

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function buildSeed() {
  const rand = mulberry32(20261012);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();

  const [hA, hS, hC] = await Promise.all([
    bcrypt.hash(DEMO_ACCOUNTS.agent.password, 8),
    bcrypt.hash(DEMO_ACCOUNTS.supervisor.password, 8),
    bcrypt.hash(DEMO_ACCOUNTS.customer.password, 8),
  ]);
  const users = [
    ...AGENTS.map((a) => ({ ...a, role: 'agent', passwordHash: hA, createdAt: iso(now - 200 * 24 * HOUR) })),
    { ...SUPERVISOR, role: 'supervisor', passwordHash: hS, createdAt: iso(now - 300 * 24 * HOUR) },
    ...CUSTOMERS.map((c) => ({ ...c, role: 'customer', passwordHash: hC, createdAt: iso(now - 120 * 24 * HOUR) })),
  ];

  /* ------------------------------------------------------------ drafts */
  const drafts = [];
  const add = (key, subject, message, created, customer, extra = {}) =>
    drafts.push({ key, subject, message, created, customer, ...extra });

  // Background volume over 14 days, weighted to office hours and recent days.
  for (let i = 0; i < 96; i++) {
    const daysAgo = Math.floor(Math.pow(rand(), 1.3) * 14);
    const d = new Date(now - daysAgo * 24 * HOUR);
    d.setHours(9 + Math.floor(rand() * 12), Math.floor(rand() * 60), 0, 0);
    let at = d.getTime();
    if (at > now - 25 * HOUR && at < now) at = now - (25 + rand() * 20) * HOUR; // keep last 24h for the scenarios
    if (at > now) at = now - (26 + rand() * 10) * HOUR;
    const key = pick(BACKGROUND);
    const c = rand() < 0.06 ? CUSTOMERS[1 + Math.floor(rand() * 3)] : pick(OTHERS());
    add(key, T[key][0], T[key][1], at, c);
  }
  // A few ordinary tickets inside the last 24h so the queue is not only spikes.
  for (const [key, hAgo, ci] of [['double', 1.2, 4], ['locked', 4.5, 11], ['damaged', 7, 13], ['gst', 9, 15], ['fraud', 0.8, 11], ['bulk', 5.5, 6], ['thanks', 11, 19], ['otp', 2.6, 20], ['dashboard', 6.5, 14], ['refund', 13, 9]]) {
    add(key, T[key][0], T[key][1], now - hAgo * HOUR, CUSTOMERS[ci]);
  }
  // Scenario 1: website spike, 16 complaints in the last ~2.8 hours.
  for (let i = 0; i < 16; i++) {
    const [s, m] = SPIKE_WEB[i % SPIKE_WEB.length];
    add('spikeWeb', s, m, now - (2.8 - i * 0.17) * HOUR - rand() * 5 * MIN, CUSTOMERS[1 + ((i * 5 + 3) % (CUSTOMERS.length - 1))], { scenario: 'web' });
  }
  // Scenario 2: Kolhapur deliveries, 7 in the last 5 hours.
  for (let i = 0; i < 7; i++) {
    const [s, m] = SPIKE_KOP[i % SPIKE_KOP.length];
    add('spikeKop', s, m, now - (4.8 - i * 0.65) * HOUR, CUSTOMERS[(i * 7 + 2) % CUSTOMERS.length], { scenario: 'kop' });
  }
  // Steady group: 4 in the last day but spread out, plus a long history.
  for (const hAgo of [5, 10, 15, 21]) add('steady', STEADY_CRASH[0], STEADY_CRASH[1], now - hAgo * HOUR, pick(OTHERS()));
  // History for the steady group: ~1 report every other day, so it is NOT a spike.
  for (let dAgo = 2; dAgo < 14; dAgo += 2) add('steady', STEADY_CRASH[0], STEADY_CRASH[1], now - dAgo * 24 * HOUR - 3 * HOUR, pick(OTHERS()));
  // Past incident INC-1 (confirmed and resolved), 7 days ago.
  for (let i = 0; i < 9; i++) add('pastUpi', PAST_UPI[0], PAST_UPI[1], now - 7 * 24 * HOUR + i * 14 * MIN, CUSTOMERS[(i * 3 + 1) % CUSTOMERS.length], { incident: 'INC-1' });
  // Past candidate INC-2 (dismissed as a false alarm), 3 days ago.
  for (let i = 0; i < 5; i++) add('pastCrash', PAST_CRASH[0], PAST_CRASH[1], now - 3 * 24 * HOUR + i * 30 * MIN, CUSTOMERS[(i * 4 + 6) % CUSTOMERS.length], { incident: 'INC-2' });
  // Demo customer: two older resolved requests, one resolved and waiting for
  // feedback, one in progress.
  add('gst', T.gst[0], T.gst[1], now - 11 * 24 * HOUR, CUSTOMERS[0]);
  add('damaged', T.damaged[0], T.damaged[1], now - 9 * 24 * HOUR, CUSTOMERS[0]);
  add('refund', T.refund[0], T.refund[1], now - 30 * HOUR, CUSTOMERS[0], { force: 'resolved-nofeedback' });
  add('delayed', T.delayed[0], T.delayed[1], now - 9.5 * HOUR, CUSTOMERS[0], { force: 'in_progress' });

  drafts.sort((a, b) => a.created - b.created);

  /* ----------------------------------------------------------- tickets */
  const byTeam = (team) => AGENTS.filter((a) => a.team === team);
  const openLoad = Object.fromEntries(AGENTS.map((a) => [a.id, 0]));
  const tickets = [];
  const notifications = [];
  let number = 1001;
  let nid = 1;
  const notify = (to, type, title, body, at, ticketId, read = true) =>
    notifications.push({ id: `n-${nid++}`, to, type, title, body, at, ticketId, read });

  for (const d of drafts) {
    const since = d.created - 7 * 24 * HOUR;
    const priorContacts = tickets.filter((t) => t.customerId === d.customer.id && Date.parse(t.createdAt) >= since).length;
    const r = await triage({ subject: d.subject, message: d.message, customer: d.customer, priorContacts, offline: true });

    const ageH = (now - d.created) / HOUR;
    const id = `SR-${number++}`;
    const team = r.routing.team === 'Triage Review' ? 'Customer Care' : r.routing.team;
    const createdAt = iso(d.created);
    const events = [
      { at: createdAt, type: 'created', by: d.customer.name, text: `Submitted via ${pick(['web', 'web', 'email', 'chat', 'whatsapp'])}` },
      { at: createdAt, type: 'triaged', by: 'SmartResolve', text: `${r.classification.label}, intake ${r.triage.intakeBand}, routed to ${r.routing.team}` },
    ];

    // Decide state from age, scenario and forced demo states.
    let status;
    if (d.force === 'resolved-nofeedback') status = 'resolved';
    else if (d.force === 'in_progress') status = 'in_progress';
    else if (d.scenario) status = 'open';
    else if (d.incident) status = 'resolved';
    else {
      // Most tickets are closed inside their target; a few overrun so the
      // SLA and escalation views have real breaches to show.
      const target = { P1: 4, P2: 8, P3: 24, P4: 72 }[r.triage.intakeBand];
      const p = ageH > target * 1.5 ? 0.94 : ageH > target ? 0.8 : ageH > 8 ? 0.45 : 0.1;
      status = rand() < p ? 'resolved' : rand() < 0.55 ? 'in_progress' : 'open';
    }

    // Assignment: everything except fresh/open scenario tickets has an owner.
    let assignee = null;
    const unassigned = status === 'open' && (d.scenario || ageH < 3 || (ageH < 12 && rand() < 0.3));
    if (!unassigned) {
      const pool = byTeam(team).filter((a) => status === 'resolved' || a.status !== 'offline');
      const free = pool.filter((a) => status === 'resolved' || openLoad[a.id] < a.capacity - 1);
      assignee = (free.length ? free : pool).sort((a, b) => openLoad[a.id] - openLoad[b.id] || a.id.localeCompare(b.id))[0] || null;
      if (d.scenario === 'web' && rand() < 0.15) assignee = AGENTS[0];
    }
    if (assignee && status !== 'resolved') openLoad[assignee.id]++;

    const sla = { P1: 4, P2: 8, P3: 24, P4: 72 }[r.triage.intakeBand];
    const firstRespH = assignee ? Math.min(ageH * 0.9, 0.15 + rand() * Math.min(3, sla / 3)) : null;
    const resolveH = status === 'resolved'
      ? Math.min(ageH * 0.95, d.force ? 6 : sla * (rand() < 0.82 ? 0.2 + rand() * 0.7 : 1.1 + rand() * 0.9))
      : null;

    // Anything assigned and older than a couple of hours has had a first reply.
    const firstResponseAt = assignee && (status !== 'open' || ageH > 2 || rand() < 0.5) ? iso(d.created + firstRespH * HOUR) : null;
    const resolvedAt = resolveH ? iso(d.created + resolveH * HOUR) : null;

    const thread = [{ id: 'm1', author: 'customer', name: d.customer.name, body: r.message, at: createdAt }];
    if (assignee) {
      const at = iso(d.created + Math.max(0.05, (firstRespH || 0.5) * 0.6) * HOUR);
      events.push({ at, type: 'assigned', by: 'Anjali Kulkarni', text: `Assigned to ${assignee.name}` });
    }
    if (firstResponseAt) {
      thread.push({ id: 'm2', author: 'agent', name: assignee.name, body: firstReply(r.classification.category), at: firstResponseAt });
      events.push({ at: firstResponseAt, type: 'reply', by: assignee.name, text: 'Replied to customer' });
    }

    const tpl = T[d.key] || (d.key === 'pastUpi' ? T.upiFail : d.key === 'pastCrash' || d.key === 'steady' ? T.crash : null);
    let resolution = null;
    if (resolvedAt) {
      resolution = {
        rootCause: d.incident === 'INC-1' ? 'Bank UPI switch outage at the acquiring bank.' : tpl?.[2] || 'Resolved by the agent.',
        fix: d.incident === 'INC-1' ? 'Bank restored the switch; all failed debits auto-reversed within 48 hours.' : tpl?.[3] || 'Resolved.',
        customerSummary: d.incident === 'INC-1'
          ? 'This was caused by a temporary outage at our payment bank. Your money was returned automatically.'
          : `We have resolved this. ${tpl?.[3] || ''}`.trim(),
        category: r.classification.category,
        by: assignee?.name || 'Anjali Kulkarni',
        at: resolvedAt,
      };
      thread.push({ id: 'm3', author: 'agent', name: assignee?.name || 'Support', body: resolution.customerSummary, at: resolvedAt });
      events.push({ at: resolvedAt, type: 'resolved', by: resolution.by, text: 'Resolved with summary' });
    }

    let feedback = null;
    if (resolvedAt && !d.force && rand() < 0.62) {
      const late = resolveH > sla;
      const roll = rand();
      const rating = late ? (roll < 0.4 ? 2 : roll < 0.6 ? 1 : roll < 0.85 ? 3 : 4) : (roll < 0.58 ? 5 : roll < 0.86 ? 4 : roll < 0.95 ? 3 : 2);
      const at = iso(Date.parse(resolvedAt) + (1 + rand() * 10) * HOUR);
      if (Date.parse(at) < now) {
        feedback = { rating, comment: pick(FEEDBACK[rating]), at };
        events.push({ at, type: 'feedback', by: d.customer.name, text: `Rated ${rating} of 5` });
      }
    }

    tickets.push({
      id, number: number - 1,
      customerId: d.customer.id, customerName: d.customer.name, customerEmail: d.customer.email, customerTier: d.customer.tier,
      subject: d.subject, message: r.message, channel: 'web', customerCategory: null, attachments: [],
      status, team,
      sentiment: r.sentiment, classification: r.classification, triage: r.triage, routing: r.routing,
      redactions: r.redactions, articleIds: r.articles.map((a) => a.id), actions: r.actions,
      priorContacts,
      assigneeId: assignee?.id || null, assigneeName: assignee?.name || null,
      assignment: assignee ? { method: 'recommended', by: 'Anjali Kulkarni', at: events.find((e) => e.type === 'assigned').at } : null,
      escalation: null, incidentId: d.incident || null,
      notes: [], corrections: [], resolution, feedback,
      thread, events: events.sort((a, b) => a.at.localeCompare(b.at)),
      createdAt, updatedAt: resolvedAt || firstResponseAt || createdAt, firstResponseAt, resolvedAt,
    });
  }

  /* ---------------------------------------------- hand-placed details */
  const find = (fn) => tickets.find(fn);

  // Manual escalations and internal notes on a few active tickets.
  const active = tickets.filter((t) => t.status !== 'resolved' && !t.incidentId);
  const esc1 = find((t) => t.status !== 'resolved' && t.subject === 'Charged twice for the same order');
  if (esc1) {
    esc1.escalation = { level: 'L2', reason: 'Customer disputes the refund timeline, needs payments lead.', by: 'Anjali Kulkarni', at: iso(now - 0.6 * HOUR), auto: false };
    esc1.events.push({ at: esc1.escalation.at, type: 'escalated', by: 'Anjali Kulkarni', text: 'Escalated to L2: payments lead' });
    esc1.notes.push({ id: 'note-1', by: 'Rahul Deshmukh', body: 'Gateway shows two captures, both settled. Waiting for finance to approve the reversal.', at: iso(now - 0.9 * HOUR) });
  }
  const esc2 = find((t) => t.status !== 'resolved' && t.subject === 'Multiple orders stuck in transit');
  if (esc2) {
    esc2.escalation = { level: 'Manager', reason: 'Enterprise account, 14 orders, client relationship at risk.', by: 'Anjali Kulkarni', at: iso(Date.parse(esc2.createdAt) + 2 * HOUR), auto: false };
    esc2.events.push({ at: esc2.escalation.at, type: 'escalated', by: 'Anjali Kulkarni', text: 'Escalated to Manager' });
  }
  for (const t of active.filter((x) => x.assigneeId).slice(0, 8)) {
    if (t.notes.length) continue;
    t.notes.push({ id: `note-${t.id}`, by: t.assigneeName, body: noteFor(t.classification.category), at: iso(Math.min(now, Date.parse(t.createdAt) + 0.7 * HOUR)) });
  }

  // Agent corrections where the model was weak, so learning data is honest.
  const lowConf = tickets.filter((t) => t.classification.confidence < 0.55 && t.classification.alternatives?.[0]).slice(0, 5);
  for (const t of lowConf) {
    const to = t.classification.alternatives[0].category;
    if (to === t.classification.category) continue;
    t.corrections.push({ field: 'category', from: t.classification.category, to, by: t.assigneeName || 'Anjali Kulkarni', at: t.updatedAt });
  }
  for (const t of tickets.filter((x) => x.sentiment.sarcasm || x.subject === 'Great support last time').slice(0, 2)) {
    t.corrections.push({ field: 'sentiment', from: t.sentiment.label, to: t.subject === 'Great support last time' ? 'positive' : 'negative', by: t.assigneeName || 'Anjali Kulkarni', at: t.updatedAt });
  }

  // Past incidents. Candidates for the live spikes are NOT seeded: the
  // engine detects them from the tickets above on the first request.
  const upi = tickets.filter((t) => t.incidentId === 'INC-1');
  const crash = tickets.filter((t) => t.incidentId === 'INC-2');
  for (const t of crash) t.incidentId = null; // dismissed: tickets were not linked
  const incidents = [
    {
      id: 'INC-1', title: 'UPI payments failing with money deducted', status: 'resolved', severity: 'critical',
      category: 'billing', team: 'Billing', ticketIds: upi.map((t) => t.id), keywords: ['upi', 'payment', 'fail', 'deduct', 'bank'],
      detectedAt: upi[3]?.createdAt, firstReportedAt: upi[0]?.createdAt, customers: new Set(upi.map((t) => t.customerId)).size,
      spike: { isSpike: true, recent: 9, expected: 0.4, ratio: 22.5, z: 12.1, windowHours: 3, historyDays: 14, series: [] },
      owner: 'Fatima Shaikh',
      resolutionNote: 'Acquiring bank UPI switch outage. Bank restored service; all failed debits reversed within 48 hours.',
      history: [
        { at: upi[3]?.createdAt, by: 'SmartResolve', action: 'detected', note: '9 similar complaints in 2 hours, 22x the usual rate' },
        { at: upi[4]?.createdAt, by: 'Anjali Kulkarni', action: 'confirmed', note: 'Confirmed with the bank status page.' },
        { at: upi.at(-1)?.resolvedAt, by: 'Anjali Kulkarni', action: 'resolved', note: 'Bank restored the switch.' },
      ],
    },
    {
      id: 'INC-2', title: 'App crashing after update', status: 'dismissed', severity: null,
      category: 'technical', team: 'Technical Support', ticketIds: crash.map((t) => t.id), keywords: ['app', 'crash', 'update'],
      detectedAt: crash[3]?.createdAt, firstReportedAt: crash[0]?.createdAt, customers: crash.length,
      spike: { isSpike: true, recent: 5, expected: 0.6, ratio: 8.3, z: 5.7, windowHours: 3, historyDays: 14, series: [] },
      dismissReason: 'Different devices and app versions, no shared root cause. Handled as individual tickets.',
      history: [
        { at: crash[3]?.createdAt, by: 'SmartResolve', action: 'detected', note: '5 similar complaints in 2 hours' },
        { at: crash.at(-1)?.createdAt, by: 'Anjali Kulkarni', action: 'dismissed', note: 'Different devices and versions, not one incident.' },
      ],
    },
  ];
  for (const t of upi) {
    t.events.push({ at: incidents[0].history[1].at, type: 'incident', by: 'Anjali Kulkarni', text: 'Linked to incident INC-1' });
    t.events.sort((a, b) => a.at.localeCompare(b.at));
  }

  // Seed notification history for the three demo users.
  const recent = tickets.filter((t) => now - Date.parse(t.createdAt) < 30 * HOUR);
  for (const t of recent.filter((x) => x.assigneeId === 'u-a1').slice(0, 4)) {
    notify('u-a1', 'assignment', `${t.id} assigned to you`, t.subject, t.events.find((e) => e.type === 'assigned')?.at || t.createdAt, t.id, false);
  }
  if (esc1) notify('u-s1', 'escalation', `${esc1.id} escalated to L2`, esc1.escalation.reason, esc1.escalation.at, esc1.id, false);
  const rohan = tickets.filter((t) => t.customerId === 'u-c1');
  for (const t of rohan.filter((x) => x.firstResponseAt).slice(-3)) {
    notify('u-c1', 'reply', `New reply on ${t.id}`, t.subject, t.firstResponseAt, t.id, Date.parse(t.firstResponseAt) < now - 12 * HOUR);
  }
  for (const t of rohan.filter((x) => x.resolvedAt && !x.feedback)) {
    notify('u-c1', 'resolved', `${t.id} resolved`, 'Tell us how we did.', t.resolvedAt, t.id, false);
  }

  return {
    users, tickets, incidents, notifications,
    counters: { ticket: number - 1, incident: 2 },
  };
}

function firstReply(category) {
  return {
    billing: 'Thanks for flagging this. I am checking the transaction with our payments team and will update you shortly.',
    technical: 'Thanks for the details. I am looking into this with engineering now.',
    delivery: 'Sorry about this. I have opened a check with the courier and will update you within a few hours.',
    account: 'I am securing your account now. Please do not share any codes with anyone.',
    general: 'Thanks for reaching out. Here is the information you asked for.',
  }[category];
}

function noteFor(category) {
  return {
    billing: 'Checked gateway logs. Waiting for the settlement file before replying with a timeline.',
    technical: 'Could not reproduce on staging. Asked for a screenshot and browser version.',
    delivery: 'Courier portal shows the last scan at the hub. Raised a trace request.',
    account: 'Two sign-ins from new devices in the last 24h. Sessions reset.',
    general: 'Answered from KB. Will close if no reply in 24h.',
  }[category];
}

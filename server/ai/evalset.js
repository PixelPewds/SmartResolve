// Hand-labelled evaluation set.
//
// Labels are what a human support lead would assign. About a third of the
// cases are deliberately hard (sarcasm, Hinglish, mixed issues, polite
// wording of a serious problem, vague text) so the score reflects the
// engine's real weaknesses instead of flattering it.
//
// Accuracy is COMPUTED by running the live pipeline over these cases on
// every request. Nothing here is a stored result.

import { triage } from './index.js';

export const EVAL_SET = [
  // straightforward
  { id: 'E01', text: 'I was charged twice for order 44120, both debits are on my card statement.', category: 'billing', sentiment: 'negative', urgency: 'critical' },
  { id: 'E02', text: 'How do I download the GST invoice for my last order?', category: 'billing', sentiment: 'neutral', urgency: 'low' },
  { id: 'E03', text: 'The app crashes every time I open the cart after the latest update.', category: 'technical', sentiment: 'negative', urgency: 'high' },
  { id: 'E04', text: 'My parcel was marked delivered but I never received it.', category: 'delivery', sentiment: 'negative', urgency: 'high' },
  { id: 'E05', text: 'I am locked out of my account and the reset email is not coming.', category: 'account', sentiment: 'negative', urgency: 'critical' },
  { id: 'E06', text: 'Thank you, the support agent sorted my refund quickly. Great service!', category: 'general', sentiment: 'positive', urgency: 'low' },
  { id: 'E07', text: 'What are your support hours on Sunday?', category: 'general', sentiment: 'neutral', urgency: 'low' },
  { id: 'E08', text: 'Received a damaged mixer, the jar is cracked. Need a replacement.', category: 'delivery', sentiment: 'negative', urgency: 'high' },
  { id: 'E09', text: 'Website is completely down for our entire team, we cannot process orders.', category: 'technical', sentiment: 'negative', urgency: 'critical' },
  { id: 'E10', text: 'OTP is not coming on my phone, cannot log in.', category: 'account', sentiment: 'negative', urgency: 'high' },
  { id: 'E11', text: 'Refund approved 10 days ago and still not received. Third time writing.', category: 'billing', sentiment: 'negative', urgency: 'high' },
  { id: 'E12', text: 'Can I change the delivery address for my order before it ships?', category: 'delivery', sentiment: 'neutral', urgency: 'low' },
  { id: 'E13', text: 'Someone placed an order from my account using my saved card. This is fraud.', category: 'account', sentiment: 'negative', urgency: 'critical' },
  { id: 'E14', text: 'Your API returns 500 errors for every request since this morning.', category: 'technical', sentiment: 'negative', urgency: 'critical' },
  { id: 'E15', text: 'Order delayed by a week, tracking has not updated.', category: 'delivery', sentiment: 'negative', urgency: 'medium' },
  { id: 'E16', text: 'Please add a dark mode, would love it for night use.', category: 'general', sentiment: 'positive', urgency: 'low' },
  { id: 'E17', text: 'Payment failed on UPI but the money was deducted.', category: 'billing', sentiment: 'negative', urgency: 'critical' },
  { id: 'E18', text: 'Product pages take almost a minute to load since yesterday.', category: 'technical', sentiment: 'negative', urgency: 'medium' },
  { id: 'E19', text: 'How do I enable two factor authentication with an app?', category: 'account', sentiment: 'neutral', urgency: 'low' },
  { id: 'E20', text: 'Subscription renewed even though I cancelled last month. Very disappointed.', category: 'billing', sentiment: 'negative', urgency: 'medium' },
  { id: 'E21', text: 'Wrong item delivered, ordered a shirt and got a phone cover.', category: 'delivery', sentiment: 'negative', urgency: 'high' },
  { id: 'E22', text: 'Notifications for order updates stopped coming. Minor, but please fix.', category: 'technical', sentiment: 'neutral', urgency: 'low' },
  { id: 'E23', text: 'Coupon was accepted but the discount did not appear on the bill.', category: 'billing', sentiment: 'negative', urgency: 'medium' },
  { id: 'E24', text: 'Delivery boy was rude and threw the package at my door.', category: 'delivery', sentiment: 'negative', urgency: 'medium' },
  { id: 'E25', text: 'Please delete my account and all my data.', category: 'account', sentiment: 'neutral', urgency: 'medium' },

  // hard cases: expected to expose weaknesses
  { id: 'H01', hard: 'sarcasm', text: 'Great job guys, my parcel has been "out for delivery" for six days now. Amazing service.', category: 'delivery', sentiment: 'negative', urgency: 'medium' },
  { id: 'H02', hard: 'sarcasm', text: 'Wow, love how I get charged for a subscription I never signed up for. Brilliant.', category: 'billing', sentiment: 'negative', urgency: 'high' },
  { id: 'H03', hard: 'Hinglish', text: 'Paise do baar kat gaye, refund kab milega? Bahut pareshaan hoon.', category: 'billing', sentiment: 'negative', urgency: 'critical' },
  { id: 'H04', hard: 'Hinglish', text: 'Order abhi tak nahi aaya, 5 din ho gaye.', category: 'delivery', sentiment: 'negative', urgency: 'medium' },
  { id: 'H05', hard: 'polite but serious', text: 'Hello, kindly note that my account appears to have been accessed by someone else last night. Regards.', category: 'account', sentiment: 'neutral', urgency: 'critical' },
  { id: 'H06', hard: 'mixed issue', text: 'Package arrived damaged and I was also billed for express shipping that I did not choose.', category: 'delivery', sentiment: 'negative', urgency: 'high' },
  { id: 'H07', hard: 'vague', text: 'It is not working. Please help.', category: 'technical', sentiment: 'negative', urgency: 'medium' },
  { id: 'H08', hard: 'praise + problem', text: 'Love your products and the app is great, but my order from last week still has not shipped.', category: 'delivery', sentiment: 'negative', urgency: 'medium' },
  { id: 'H09', hard: 'negation', text: 'Not unhappy with the service, just want to know the return window for shoes.', category: 'general', sentiment: 'neutral', urgency: 'low' },
  { id: 'H10', hard: 'domain words', text: 'The checkout spinner never stops, I tried three cards.', category: 'technical', sentiment: 'negative', urgency: 'high' },
  { id: 'H11', hard: 'angry routine', text: 'WHY CAN I NOT FIND WHERE TO CHANGE MY PROFILE PHOTO??? Ridiculous!!!', category: 'account', sentiment: 'negative', urgency: 'low' },
  { id: 'H12', hard: 'understated outage', text: 'Small thing: none of our 40 staff can open the seller dashboard this morning.', category: 'technical', sentiment: 'neutral', urgency: 'critical' },
];

const URG_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

export async function evaluate() {
  const rows = [];
  for (const c of EVAL_SET) {
    const r = await triage({ subject: '', message: c.text, offline: true });
    const pred = {
      category: r.classification.category,
      sentiment: r.sentiment.label,
      urgency: r.triage.urgency.level,
      categoryConfidence: r.classification.confidence,
    };
    rows.push({
      ...c,
      predicted: pred,
      correct: {
        category: pred.category === c.category,
        sentiment: pred.sentiment === c.sentiment,
        // One level off counts as "near", reported separately from exact.
        urgency: pred.urgency === c.urgency,
        urgencyNear: Math.abs(URG_RANK[pred.urgency] - URG_RANK[c.urgency]) <= 1,
      },
    });
  }

  const pct = (xs) => Math.round((xs.filter(Boolean).length / xs.length) * 100);
  const split = (filter) => {
    const xs = rows.filter(filter);
    return {
      n: xs.length,
      category: pct(xs.map((r) => r.correct.category)),
      sentiment: pct(xs.map((r) => r.correct.sentiment)),
      urgency: pct(xs.map((r) => r.correct.urgency)),
      urgencyNear: pct(xs.map((r) => r.correct.urgencyNear)),
    };
  };

  const cats = ['billing', 'technical', 'delivery', 'account', 'general'];
  const confusion = cats.map((actual) => ({
    actual,
    predicted: Object.fromEntries(cats.map((p) => [p, rows.filter((r) => r.category === actual && r.predicted.category === p).length])),
  }));

  return {
    engine: 'local (lexicon + keyword)',
    overall: split(() => true),
    standard: split((r) => !r.hard),
    hard: split((r) => r.hard),
    confusion,
    rows,
  };
}

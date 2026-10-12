// Knowledge-base recommender. Keyword overlap plus a category bonus; enough
// to deflect routine questions without a vector store.

import { normalize, matchPhrases } from './text.js';

export const ARTICLES = [
  { id: 'kb-101', category: 'billing', title: 'I was charged twice for one order',
    summary: 'Duplicate charges are usually a pending authorisation that drops off within 3 to 5 working days.',
    steps: ['Check whether one charge says "pending" in your bank app', 'Wait 5 working days for the hold to release', 'If both charges settle, reply with the two transaction IDs and we refund the duplicate'],
    keywords: ['charged twice', 'double charged', 'duplicate', 'two charges', 'deducted twice'] },
  { id: 'kb-102', category: 'billing', title: 'When will my refund arrive?',
    summary: 'Refunds reach UPI and wallets in 1 to 2 days, cards in 5 to 7 working days after approval.',
    steps: ['Open Orders and check the refund status', 'Note the refund reference number', 'Contact your bank with that reference if the window has passed'],
    keywords: ['refund', 'money back', 'refund status', 'not refunded'] },
  { id: 'kb-103', category: 'billing', title: 'Downloading a GST invoice',
    summary: 'Every paid order has a GST invoice under Orders, then Invoice.',
    steps: ['Go to Orders', 'Select the order', 'Choose Download invoice'],
    keywords: ['invoice', 'gst', 'bill', 'receipt', 'tax'] },
  { id: 'kb-104', category: 'billing', title: 'Payment failed but money was deducted',
    summary: 'Failed payments are auto-reversed by the bank within 48 hours.',
    steps: ['Do not retry immediately', 'Wait 48 hours for the auto-reversal', 'Share the UPI or bank reference if it does not reverse'],
    keywords: ['payment failed', 'money deducted', 'upi', 'transaction failed', 'debited'] },
  { id: 'kb-201', category: 'technical', title: 'App crashes on launch',
    summary: 'Most launch crashes are fixed by updating the app and clearing its cache.',
    steps: ['Update to the latest version', 'Clear the app cache from phone settings', 'Restart the phone and try again'],
    keywords: ['crash', 'crashes', 'crashing', 'closes', 'force close', 'launch'] },
  { id: 'kb-202', category: 'technical', title: 'Pages load slowly or show a blank screen',
    summary: 'Usually a cached script or a browser extension blocking content.',
    steps: ['Hard refresh with Ctrl+Shift+R', 'Try a private window', 'Disable ad blockers for our domain'],
    keywords: ['slow', 'blank screen', 'not loading', 'loading', 'white screen'] },
  { id: 'kb-203', category: 'technical', title: 'Checking service status',
    summary: 'Live status for every service, including planned maintenance windows.',
    steps: ['Open the status page', 'Subscribe to updates for the affected service'],
    keywords: ['outage', 'down', 'server', 'status', 'not working'] },
  { id: 'kb-301', category: 'delivery', title: 'Tracking a delayed order',
    summary: 'Courier scans can lag up to 24 hours. The expected date shown at checkout is the commitment.',
    steps: ['Open Orders and select Track', 'Check the latest courier scan', 'If past the expected date, raise a delivery ticket'],
    keywords: ['delayed', 'late', 'tracking', 'where is my order', 'not delivered', 'courier'] },
  { id: 'kb-302', category: 'delivery', title: 'Received a damaged or wrong item',
    summary: 'Report within 7 days with photos and we send a replacement or refund.',
    steps: ['Take photos of the item and packaging', 'Go to Orders, then Report a problem', 'Choose replacement or refund'],
    keywords: ['damaged', 'wrong item', 'broken', 'defective', 'replacement', 'return'] },
  { id: 'kb-303', category: 'delivery', title: 'Changing the delivery address',
    summary: 'Address can be changed until the order is dispatched.',
    steps: ['Open the order', 'Choose Edit address', 'Save before the dispatch cut-off'],
    keywords: ['address', 'change address', 'wrong address', 'shipping address'] },
  { id: 'kb-401', category: 'account', title: 'Locked out after too many login attempts',
    summary: 'Accounts unlock automatically after 30 minutes, or immediately with a password reset.',
    steps: ['Choose Forgot password on the sign-in page', 'Use the reset link within 15 minutes', 'Sign in with the new password'],
    keywords: ['locked out', 'login', 'log in', 'sign in', 'password', 'cannot login'] },
  { id: 'kb-402', category: 'account', title: 'OTP not arriving',
    summary: 'OTPs can be delayed by DND settings or a full SMS inbox.',
    steps: ['Wait 60 seconds before requesting again', 'Check that DND is off for transactional SMS', 'Use the email OTP option instead'],
    keywords: ['otp', 'verification code', 'sms', 'not receiving otp', 'otp not'] },
  { id: 'kb-403', category: 'account', title: 'Securing an account you think was accessed',
    summary: 'Reset your password and sign out of all devices right away, then contact us.',
    steps: ['Reset your password', 'Choose Sign out of all devices in Settings', 'Turn on two-factor authentication', 'Reply to your ticket so we can review recent activity'],
    keywords: ['hacked', 'unauthorized', 'suspicious', 'someone else', 'security'] },
  { id: 'kb-501', category: 'general', title: 'Support hours and response times',
    summary: 'Chat runs 8am to 10pm IST every day. Tickets are answered by priority.',
    steps: ['Critical issues are answered within 1 hour', 'Everything else within one working day'],
    keywords: ['hours', 'timing', 'response time', 'when will', 'contact'] },
];

export function recommendArticles(text, category, limit = 3) {
  const norm = normalize(text);
  return ARTICLES
    .map((a) => {
      const hits = matchPhrases(norm, a.keywords);
      const score = hits.length * 2 + (a.category === category ? 1.5 : 0);
      return { ...a, score, matched: hits };
    })
    .filter((a) => a.matched.length > 0 || a.category === category)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ keywords, ...a }) => a);
}

// Suggested next steps for the agent. Rule-based, by category and severity.
const ACTIONS = {
  billing: ['Check both transactions in the payment gateway', 'Confirm whether either charge is still pending', 'Refund the duplicate if both have settled', 'Send the refund timeline article'],
  technical: ['Check the status page and error monitoring for the reported time', 'Ask for device, browser and a screenshot', 'Search Incident Watch for similar reports', 'Escalate to engineering if reproducible'],
  delivery: ['Open the courier tracking for the order', 'Check the last scan location and date', 'Raise a claim with the courier if past the expected date', 'Offer replacement or refund'],
  account: ['Verify the customer through the registered email', 'Check recent sign-ins and devices', 'Reset sessions if anything looks unfamiliar', 'Confirm two-factor authentication is on'],
  general: ['Answer from the knowledge base', 'Link the relevant help article', 'Close if no follow-up is needed'],
};

export function recommendedActions({ text, category, severity, routing }) {
  const norm = normalize(text);
  const list = [...ACTIONS[category]];
  if (routing?.rule === 'security-override') list.unshift('Treat as a possible account takeover: lock the account first');
  if (severity === 'critical' && category === 'technical') list.unshift('Check Incident Watch: this may affect many customers');
  if (matchPhrases(norm, ['charged twice', 'double charged']).length) list.splice(1, 0, 'Use template KB-101 "I was charged twice"');
  return list.slice(0, 5);
}

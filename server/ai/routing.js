// Routing: category decides the default team, explicit business rules
// override it. The rule that fired is returned so the decision is auditable.

import { normalize, matchPhrases } from './text.js';

export const TEAMS = {
  billing:   'Billing',
  technical: 'Technical Support',
  delivery:  'Logistics',
  account:   'Account & Security',
  general:   'Customer Care',
  triage:    'Triage Review',
};

export function routeTicket({ text, classification, priority, customer = {} }) {
  const norm = normalize(text);

  if (matchPhrases(norm, ['hacked', 'unauthorized', 'fraud', 'stolen', 'suspicious', 'security breach']).length) {
    return { team: TEAMS.account, rule: 'security-override', reason: 'Security or fraud language always goes to Account & Security' };
  }
  if (classification.category === 'delivery' && matchPhrases(norm, ['refund', 'money back', 'charged']).length) {
    return { team: TEAMS.billing, rule: 'refund-on-delivery', reason: 'Delivery issue asking for money back is owned by Billing' };
  }
  if (classification.confidence < 0.45) {
    return { team: TEAMS.triage, rule: 'low-confidence', reason: `Category confidence ${Math.round(classification.confidence * 100)}% is below 45%, needs a human check` };
  }
  return {
    team: TEAMS[classification.category],
    rule: 'category-default',
    reason: `${classification.label} tickets go to ${TEAMS[classification.category]}${
      priority.band === 'P1' && customer.tier === 'enterprise' ? ', plus escalation desk for enterprise P1' : ''
    }`,
  };
}

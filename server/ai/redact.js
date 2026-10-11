// PII minimisation. Runs before the message is stored or sent to any model,
// per the deck's privacy strategy: "minimize stored personal data".

function luhn(digits) {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function redact(text) {
  const found = [];
  let out = String(text || '');

  out = out.replace(/\b(?:\d[ -]?){13,19}\b/g, (m) => {
    const d = m.replace(/\D/g, '');
    if (d.length < 13 || d.length > 19 || !luhn(d)) return m;
    found.push('card');
    return `[card ending ${d.slice(-4)}]`;
  });

  out = out.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, () => { found.push('email'); return '[email]'; });

  // Indian mobiles (+91 optional) and generic 10-digit numbers.
  out = out.replace(/(?:\+?91[ -]?)?\b[6-9]\d{4}[ -]?\d{5}\b/g, () => { found.push('phone'); return '[phone]'; });

  out = out.replace(/\b(otp|pin|cvv)\b\s*(is|:)?\s*\d{3,8}\b/gi, (m, k) => { found.push(k.toLowerCase()); return `${k} [removed]`; });

  return { text: out, redactions: found };
}

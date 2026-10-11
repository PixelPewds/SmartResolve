// Hugging Face Inference API client.
//
// Only used when HF_TOKEN is set. Every call has a hard timeout and returns
// null on any failure, so callers fall back to the local model and a slow or
// rate-limited API never blocks ticket creation.

export const HF_MODELS = {
  sentiment: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
  zeroShot: 'facebook/bart-large-mnli',
};

const TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS || 3500);

export function hfEnabled() {
  return Boolean(process.env.HF_TOKEN);
}

export async function hfInference(model, body) {
  if (!hfEnabled()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

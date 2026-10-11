// Local API server. On Vercel the same app runs from api/index.js instead.
import { readFileSync, existsSync } from 'node:fs';

// Tiny .env loader so local dev needs no extra dependency. Vercel injects env
// vars itself and never runs this file.
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const { default: app } = await import('./app.js');
const { getStore } = await import('./store.js');
const port = Number(process.env.PORT || 3001);

const store = await getStore();
app.listen(port, () => {
  console.log(`SmartResolve API on http://localhost:${port}  db=${store.mode}  ai=${process.env.HF_TOKEN ? 'huggingface' : 'local'}`);
});

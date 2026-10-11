// Vercel serverless entry. vercel.json rewrites every /api/* request here,
// and Express keeps the original URL, so routes match as they do locally.
import app from '../server/app.js';

export default app;

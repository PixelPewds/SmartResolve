import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// Secret resolution, strongest first:
//   1. JWT_SECRET            set this in Vercel for any public deploy
//   2. hash of MONGODB_URI   already secret, stable across serverless instances
//   3. fixed dev string      memory mode only, where data is throwaway anyway
function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.MONGODB_URI) return crypto.createHash('sha256').update(process.env.MONGODB_URI).digest('hex');
  return 'smartresolve-local-dev-only';
}

const COOKIE = 'sr_session';

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id, role: user.role, name: user.name }, secret(), { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export function readSession(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try { req.user = jwt.verify(token, secret()); } catch { req.user = null; }
  }
  next();
}

export const requireAuth = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Sign in required' });
  if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed for this role' });
  next();
};

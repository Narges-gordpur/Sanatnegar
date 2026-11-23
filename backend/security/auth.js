'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const { getDb } = require('../database/db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  const actualBuf = crypto.scryptSync(String(password), salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

function signToken(payload) {
  const exp = Date.now() + env.sessionTtlHours * 3600 * 1000;
  const data = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', env.authSecret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', env.authSecret).update(data).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  });
  return out;
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookies = parseCookies(req.headers.cookie);
  return cookies.sn_session || null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'احراز هویت الزامی است. لطفاً وارد شوید.' });
  }
  const db = getDb();
  const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(payload.id);
  if (!user) {
    return res.status(401).json({ error: 'نشست کاربری نامعتبر است.' });
  }
  req.user = user;
  next();
}

function setSessionCookie(res, token) {
  const maxAge = env.sessionTtlHours * 3600;
  const parts = [
    `sn_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (env.isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  extractToken,
  requireAuth,
  setSessionCookie,
  clearSessionCookie
};

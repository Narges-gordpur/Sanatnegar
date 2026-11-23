'use strict';

const env = require('../config/env');
const { getDb } = require('../database/db');
const { hashPassword, verifyPassword, signToken, setSessionCookie, clearSessionCookie, extractToken, verifyToken } = require('../security/auth');
const { cleanString } = require('../security/sanitizer');
const { logActivity } = require('../services/auditService');

exports.session = (req, res) => {
  const token = extractToken(req);
  const payload = verifyToken(token);
  if (!payload) {
    return res.json({ authenticated: false, demoMode: env.demoMode, user: null });
  }
  const user = getDb().prepare('SELECT id, username, display_name, role FROM users WHERE id = ?').get(payload.id);
  if (!user) {
    return res.json({ authenticated: false, demoMode: env.demoMode, user: null });
  }
  res.json({ authenticated: true, demoMode: env.demoMode, user });
};

exports.login = (req, res) => {
  const username = cleanString(req.body?.username, 80).toLowerCase();
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است.' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = ?').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    logActivity({ action: 'تلاش ناموفق ورود', details: `نام کاربری: ${username}`, securityEvent: true, ip: req.ip });
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است.' });
  }
  const token = signToken({ id: user.id, username: user.username, role: user.role });
  setSessionCookie(res, token);
  logActivity({ user, action: 'ورود موفق کاربر', securityEvent: true, ip: req.ip });
  res.json({
    token,
    user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role }
  });
};

exports.demoLogin = (req, res) => {
  if (!env.demoMode) {
    return res.status(403).json({ error: 'ورود سریع نمایشی در محیط تولید غیرفعال است.' });
  }
  const db = getDb();
  const user = db.prepare('SELECT id, username, display_name, role FROM users WHERE username = ?').get(env.defaultAdminUsername)
    || db.prepare('SELECT id, username, display_name, role FROM users ORDER BY id ASC LIMIT 1').get();
  if (!user) {
    return res.status(404).json({ error: 'کاربر آزمایشی یافت نشد.' });
  }
  const token = signToken({ id: user.id, username: user.username, role: user.role });
  setSessionCookie(res, token);
  logActivity({ user, action: 'ورود با حساب نمایشی [DEMO]', securityEvent: true, ip: req.ip });
  res.json({ token, user });
};

exports.register = (req, res) => {
  const username = cleanString(req.body?.username, 60).toLowerCase();
  const displayName = cleanString(req.body?.display_name || req.body?.username, 100);
  const password = String(req.body?.password || '');

  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) {
    return res.status(400).json({ error: 'نام کاربری باید بین ۳ تا ۴۰ کاراکتر انگلیسی/عدد باشد.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' });
  }
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username);
  if (exists) {
    return res.status(409).json({ error: 'این نام کاربری قبلاً ثبت شده است.' });
  }

  const info = db.prepare('INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(username, displayName, hashPassword(password), 'editor');
  const user = { id: info.lastInsertRowid, username, display_name: displayName, role: 'editor' };
  const token = signToken({ id: user.id, username: user.username, role: user.role });
  setSessionCookie(res, token);
  logActivity({ user, action: 'ثبت‌نام کاربر جدید', securityEvent: true, ip: req.ip });
  res.status(201).json({ token, user });
};

exports.logout = (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
};

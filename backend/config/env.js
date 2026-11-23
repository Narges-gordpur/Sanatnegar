'use strict';

const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const rootDir = path.resolve(__dirname, '../..');

function resolvePath(relOrAbs, fallbackRel) {
  const val = relOrAbs || fallbackRel;
  return path.isAbsolute(val) ? val : path.resolve(rootDir, val);
}

// Ephemeral fallback secret for local dev if AUTH_SECRET isn't set in .env
const ephemeralSecret = crypto.randomBytes(32).toString('hex');

module.exports = {
  rootDir,
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  authSecret: process.env.AUTH_SECRET || ephemeralSecret,
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS) || 24,
  demoMode: process.env.DEMO_MODE !== 'false' && process.env.NODE_ENV !== 'production',
  defaultAdminUsername: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'Sanatnegar@2026',
  maxFileSizeMb: Math.max(1, Number(process.env.MAX_FILE_SIZE_MB) || 20),
  get maxFileSizeBytes() {
    return this.maxFileSizeMb * 1024 * 1024;
  },
  ocrEnabled: process.env.OCR_ENABLED !== 'false',
  tessdataDir: resolvePath(process.env.TESSDATA_DIR, 'storage/tessdata'),
  sqlitePath: resolvePath(process.env.SQLITE_PATH, 'storage/database/sanatnegar.sqlite'),
  uploadsDir: resolvePath(null, 'storage/uploads'),
  catalogsDir: resolvePath(null, 'storage/catalogs'),
  exportsDir: resolvePath(null, 'storage/exports'),
  frontendDir: resolvePath(null, 'frontend'),
  aiKeys: {
    openai: () => (process.env.OPENAI_API_KEY || '').trim(),
    deepseek: () => (process.env.DEEPSEEK_API_KEY || '').trim(),
    gemini: () => (process.env.GEMINI_API_KEY || '').trim()
  },
  aiDefaultModels: {
    openai: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    deepseek: process.env.DEEPSEEK_DEFAULT_MODEL || 'deepseek-chat',
    gemini: process.env.GEMINI_DEFAULT_MODEL || 'gemini-2.0-flash'
  }
};

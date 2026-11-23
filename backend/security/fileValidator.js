'use strict';

const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'csv', 'txt']);

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream' // Fallback when some browsers/CLI tools upload without specific MIME
]);

function checkMagicBytes(ext, buffer) {
  if (!buffer || buffer.length === 0) {
    return { ok: false, error: 'فایل خالی است (0 بایت).' };
  }
  if (ext === 'pdf') {
    const header = buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      return { ok: false, error: 'محتوای فایل با ساختار معتبر PDF (%PDF-) مطابقت ندارد.' };
    }
    return { ok: true };
  }
  if (ext === 'docx' || ext === 'xlsx') {
    // OOXML files are ZIP containers starting with PK\x03\x04
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      return { ok: false, error: `محتوای فایل با ساختار معتبر ${ext.toUpperCase()} (ZIP/OOXML) مطابقت ندارد.` };
    }
    return { ok: true };
  }
  if (ext === 'txt' || ext === 'csv') {
    // Reject binary executables/null bytes inside text/csv files
    const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0x00) {
        return { ok: false, error: `فایل ${ext.toUpperCase()} حاوی بایت‌های باینری غیرمجاز است.` };
      }
    }
    return { ok: true };
  }
  return { ok: false, error: 'فرمت فایل پشتیبانی نمی‌شود.' };
}

function sanitizeOriginalFilename(name) {
  const base = path.basename(String(name || 'document')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
  return base || 'document';
}

function validateUploadedFile(file) {
  if (!file) return { ok: false, error: 'هیچ فایلی ارسال نشده است.' };

  const cleanName = sanitizeOriginalFilename(file.originalname);
  const ext = (path.extname(cleanName).slice(1) || '').toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `فرمت «.${ext || '?'}» مجاز نیست. فرمت‌های مجاز: PDF، DOCX، XLSX، CSV، TXT.` };
  }

  if (file.mimetype && !ALLOWED_MIMES.has(file.mimetype.toLowerCase())) {
    return { ok: false, error: `نوع MIME نامعتبر برای فایل: ${file.mimetype}` };
  }

  const size = file.size ?? (file.buffer ? file.buffer.length : 0);
  if (size <= 0) {
    return { ok: false, error: `فایل «${cleanName}» خالی است.` };
  }
  if (size > env.maxFileSizeBytes) {
    return { ok: false, error: `حجم فایل «${cleanName}» از سقف مجاز ${env.maxFileSizeMb} مگابایت بیشتر است.` };
  }

  const magic = checkMagicBytes(ext, file.buffer);
  if (!magic.ok) return magic;

  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const storedFilename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;

  return {
    ok: true,
    cleanName,
    ext,
    size,
    sha256,
    storedFilename
  };
}

function safeResolveWithin(baseDir, targetPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, targetPath);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('مسیر فایل نامعتبر است (Path Traversal مسدود شد).');
  }
  return resolvedTarget;
}

module.exports = {
  ALLOWED_EXTENSIONS,
  validateUploadedFile,
  sanitizeOriginalFilename,
  safeResolveWithin
};

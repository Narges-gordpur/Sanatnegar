'use strict';

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function redactSecrets(text) {
  return String(text ?? '')
    .replace(/sk-[A-Za-z0-9_\-]{10,}/g, '[REDACTED_KEY]')
    .replace(/AIza[A-Za-z0-9_\-]{20,}/g, '[REDACTED_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]{12,}/gi, 'Bearer [REDACTED]');
}

function wrapUntrustedDocumentText(text) {
  const cleaned = String(text ?? '').replace(/=== UNTRUSTED_DOCUMENT_TEXT_(START|END) ===/g, '');
  return `=== UNTRUSTED_DOCUMENT_TEXT_START ===\n${cleaned}\n=== UNTRUSTED_DOCUMENT_TEXT_END ===`;
}

function cleanString(v, maxLen = 500) {
  return String(v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, maxLen);
}

module.exports = {
  escapeHtml,
  redactSecrets,
  wrapUntrustedDocumentText,
  cleanString
};

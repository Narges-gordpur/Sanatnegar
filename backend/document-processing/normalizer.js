'use strict';

function digitsToAscii(str) {
  return String(str ?? '')
    .replace(/[\u06F0-\u06F9]/g, ch => String(ch.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, ch => String(ch.charCodeAt(0) - 0x0660))
    .replace(/\u066B/g, '.')   // Arabic decimal separator
    .replace(/\u066C/g, ',')   // Arabic thousands separator
    .replace(/[−–—]/g, '-');
}

function normalizePersianText(str) {
  return digitsToAscii(str)
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/أ|إ|آ/g, m => (m === 'آ' ? 'آ' : 'ا'))
    .replace(/\u200C/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKeepZwnj(str) {
  return digitsToAscii(str)
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let s = digitsToAscii(String(raw)).trim().replace(/\s+/g, '');
  if (!s) return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (/^-?\d+,\d{1,2}$/.test(s)) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  digitsToAscii,
  normalizePersianText,
  normalizeKeepZwnj,
  parseNumber
};

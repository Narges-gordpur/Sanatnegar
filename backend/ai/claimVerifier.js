'use strict';

const { digitsToAscii, parseNumber } = require('../document-processing/normalizer');

function verifyGeneratedClaims(text, approvedFacts, product = {}) {
  const safeText = String(text || '');
  const approvedIds = new Set(approvedFacts.map(f => Number(f.id)));
  const citedIds = new Set();
  const invalidIds = new Set();

  const citeRe = /\[F(\d+)\]/gi;
  let cm;
  while ((cm = citeRe.exec(safeText)) !== null) {
    const fid = Number(cm[1]);
    if (approvedIds.has(fid)) citedIds.add(fid);
    else invalidIds.add(fid);
  }

  // Collect all approved numerical tokens
  const allowedNumbers = new Set();
  const factNumberMap = new Map();

  for (const f of approvedFacts) {
    const norm = digitsToAscii(f.raw_value);
    const nums = norm.match(/-?\d+(?:[.,]\d+)*/g) || [];
    const parsedList = [];
    for (const raw of nums) {
      const p = parseNumber(raw);
      if (p !== null) {
        allowedNumbers.add(String(p));
        parsedList.push(String(p));
      }
    }
    factNumberMap.set(Number(f.id), parsedList);
  }

  // Numbers from product code / model / approved fact count are non-technical structural numbers
  const metaText = digitsToAscii(`${product.name || ''} ${product.product_code || ''} ${product.model_name || ''} ${approvedFacts.length}`);
  (metaText.match(/\d+(?:\.\d+)?/g) || []).forEach(n => allowedNumbers.add(String(Number(n))));

  // Strip [F#] citations and numbered list prefixes before checking numbers
  const origLines = safeText.split('\n');
  const cleanedLines = digitsToAscii(safeText)
    .replace(/\[F\d+\]/gi, ' ')
    .split('\n')
    .map(l => l.replace(/^\s*\d+[.)]\s+/, '').replace(/^#{1,6}\s+/, ''));

  const unsupportedNumbers = [];
  const uncitedNumericLines = [];
  const mismatchedCitations = [];

  cleanedLines.forEach((line, idx) => {
    const nums = line.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/g) || [];
    if (!nums.length) return;

    const origLine = origLines[idx] || '';
    const lineCites = [];
    let lm;
    const lineCiteRe = /\[F(\d+)\]/gi;
    while ((lm = lineCiteRe.exec(origLine)) !== null) {
      lineCites.push(Number(lm[1]));
    }

    let lineHasFactNum = false;
    for (const rawNum of nums) {
      const p = parseNumber(rawNum);
      if (p === null) continue;
      if (!allowedNumbers.has(String(p))) {
        if (!unsupportedNumbers.includes(rawNum)) unsupportedNumbers.push(rawNum);
      } else {
        lineHasFactNum = true;
        // If line has citation(s), verify at least one cited fact contains that number or is referenced properly
        if (lineCites.length) {
          const validMatch = lineCites.some(cid => (factNumberMap.get(cid) || []).includes(String(p)));
          if (!validMatch && !metaText.includes(String(p))) {
            mismatchedCitations.push({ line: idx + 1, number: rawNum, citations: lineCites });
          }
        }
      }
    }

    if (lineHasFactNum && lineCites.length === 0) {
      uncitedNumericLines.push(idx + 1);
    }
  });

  const hasWarnings =
    invalidIds.size > 0 ||
    unsupportedNumbers.length > 0 ||
    uncitedNumericLines.length > 0 ||
    mismatchedCitations.length > 0;

  return {
    cited_fact_ids: [...citedIds],
    invalid_fact_ids: [...invalidIds],
    unsupported_numbers: unsupportedNumbers,
    uncited_numeric_lines: uncitedNumericLines,
    mismatched_citations: mismatchedCitations,
    has_warnings: hasWarnings,
    disclaimer: 'این گزارش نتیجه کنترل خودکار تطبیق اعداد و شناسه‌های [F#] با مشخصات تأییدشده است و جایگزین بازبینی تخصصی نهایی انسان نیست.'
  };
}

module.exports = { verifyGeneratedClaims };

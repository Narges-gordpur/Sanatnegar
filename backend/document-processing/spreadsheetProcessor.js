'use strict';

const XLSX = require('xlsx');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === ',' || ch === ';' || ch === '\t') && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function processXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  if (!wb.SheetNames || !wb.SheetNames.length) {
    return {
      ok: false,
      status: 'failed',
      pagesCount: 0,
      extractedText: '',
      pagesJson: [],
      segments: [],
      extractionMethod: 'xlsx-sheetjs',
      errorMessage: 'فایل اکسل هیچ شیتی ندارد.'
    };
  }

  const segments = [];
  const pages = [];
  const textParts = [];

  wb.SheetNames.forEach((sheetName, sIdx) => {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const sheetLines = [];
    let headers = [];

    rows.forEach((row, rIdx) => {
      const cells = row.map(c => String(c ?? '').trim());
      if (!cells.some(c => c !== '')) return;
      if (rIdx === 0 && cells.length >= 2) {
        headers = cells;
      }
      const nonEmpty = cells.filter(c => c !== '');
      const line = nonEmpty.join(' | ');
      sheetLines.push(line);

      // Attach header mapping when multi-column data table exists
      const headerMap = headers.length === cells.length && rIdx > 0
        ? headers.map((h, ci) => (h && cells[ci] ? `${h}: ${cells[ci]}` : '')).filter(Boolean)
        : [];

      segments.push({
        text: line,
        cells: nonEmpty,
        headers,
        headerPairs: headerMap,
        page_number: sIdx + 1,
        source_location: `شیت «${sheetName}» · ردیف ${rIdx + 1}`
      });
    });

    const sheetText = sheetLines.join('\n');
    if (sheetText.trim()) {
      textParts.push(`### شیت: ${sheetName}\n${sheetText}`);
      pages.push({ page: sIdx + 1, sheet: sheetName, method: 'xlsx-sheetjs', text: sheetText, char_count: sheetText.length });
    }
  });

  const fullText = textParts.join('\n\n').trim();
  if (!fullText) {
    return {
      ok: false,
      status: 'failed',
      pagesCount: wb.SheetNames.length,
      extractedText: '',
      pagesJson: [],
      segments: [],
      extractionMethod: 'xlsx-sheetjs',
      errorMessage: 'فایل اکسل فاقد داده‌های متنی است.'
    };
  }

  return {
    ok: true,
    status: 'processed',
    pagesCount: wb.SheetNames.length,
    extractedText: fullText,
    pagesJson: pages,
    segments,
    extractionMethod: 'xlsx-sheetjs'
  };
}

function processCsv(buffer) {
  const raw = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!raw) {
    return {
      ok: false,
      status: 'failed',
      pagesCount: 0,
      extractedText: '',
      pagesJson: [],
      segments: [],
      extractionMethod: 'csv-parser',
      errorMessage: 'فایل CSV خالی است.'
    };
  }
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const headers = lines.length ? parseCsvLine(lines[0]) : [];
  const segments = lines.map((line, idx) => {
    const cells = parseCsvLine(line);
    return {
      text: line,
      cells,
      headers,
      page_number: 1,
      source_location: `ردیف ${idx + 1}`
    };
  });

  return {
    ok: true,
    status: 'processed',
    pagesCount: 1,
    extractedText: raw,
    pagesJson: [{ page: 1, method: 'csv-parser', text: raw, char_count: raw.length }],
    segments,
    extractionMethod: 'csv-parser'
  };
}

module.exports = { processXlsx, processCsv, parseCsvLine };

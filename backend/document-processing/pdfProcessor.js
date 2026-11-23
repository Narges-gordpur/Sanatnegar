'use strict';

const env = require('../config/env');
const ocrEngine = require('./ocrEngine');

let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return pdfjsPromise;
}

function reconstructLines(items) {
  if (!items || !items.length) return '';
  const lines = [];
  let current = [];
  let lastY = null;

  for (const item of items) {
    const str = item.str || '';
    if (!str) continue;
    const y = item.transform ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
      if (current.length) lines.push(current.join(' ').replace(/\s+/g, ' ').trim());
      current = [str];
    } else {
      current.push(str);
    }
    if (y !== null) lastY = y;
    if (item.hasEOL) {
      if (current.length) lines.push(current.join(' ').replace(/\s+/g, ' ').trim());
      current = [];
      lastY = null;
    }
  }
  if (current.length) lines.push(current.join(' ').replace(/\s+/g, ' ').trim());
  return lines.filter(Boolean).join('\n');
}

async function processPdf(buffer) {
  const pdfjs = await getPdfjs();
  const uint8 = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({
    data: uint8,
    verbosity: 0,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;

  const pages = [];
  const segments = [];
  const ocrPages = [];
  const scannedNoOcrPages = [];
  let ocrUsed = false;
  let ocrError = '';

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let pageText = reconstructLines(content.items);
    const nonWs = pageText.replace(/\s+/g, '').length;
    let method = 'pdf-text';

    if (nonWs < 20) {
      // Scanned / image-only page detected
      if (env.ocrEnabled) {
        try {
          const pngBuf = await ocrEngine.renderPdfPageToPng(page, 2.0);
          const ocrText = await ocrEngine.recognizeBuffer(pngBuf);
          if (ocrText.replace(/\s+/g, '').length >= 5) {
            pageText = ocrText;
            method = 'ocr-tesseract';
            ocrUsed = true;
            ocrPages.push(p);
          } else {
            scannedNoOcrPages.push(p);
          }
        } catch (err) {
          ocrError = err.message;
          scannedNoOcrPages.push(p);
        }
      } else {
        scannedNoOcrPages.push(p);
      }
    }

    pages.push({ page: p, method, text: pageText, char_count: pageText.length });
    if (pageText.trim()) {
      pageText.split(/\n+/).forEach(line => {
        const clean = line.trim();
        if (clean) {
          segments.push({
            text: clean,
            page_number: p,
            source_location: method === 'ocr-tesseract' ? `صفحه ${p} (OCR)` : `صفحه ${p}`
          });
        }
      });
    }
  }

  const fullText = pages
    .filter(p => p.text.trim())
    .map(p => `--- صفحه ${p.page} (${p.method}) ---\n${p.text}`)
    .join('\n\n');

  if (!fullText.trim()) {
    return {
      ok: false,
      status: 'failed',
      pagesCount: pdf.numPages,
      extractedText: '',
      pagesJson: pages,
      segments: [],
      extractionMethod: ocrUsed ? 'pdf-ocr' : 'pdf-text',
      ocrUsed,
      ocrPages,
      errorMessage: ocrError
        ? `فایل PDF فاقد متن قابل انتخاب است و اجرای OCR با خطا مواجه شد: ${ocrError}`
        : 'فایل PDF فاقد متن قابل استخراج است (اسکن‌شده یا خالی).'
    };
  }

  const warningMessage = scannedNoOcrPages.length
    ? `صفحات ${scannedNoOcrPages.join('، ')} متن قابل استخراجی نداشتند.`
    : '';

  return {
    ok: true,
    status: warningMessage ? 'warning_scanned' : 'processed',
    pagesCount: pdf.numPages,
    extractedText: fullText,
    pagesJson: pages,
    segments,
    extractionMethod: ocrUsed ? 'pdf-hybrid-ocr' : 'pdf-text',
    ocrUsed,
    ocrPages,
    warningMessage
  };
}

module.exports = { processPdf };

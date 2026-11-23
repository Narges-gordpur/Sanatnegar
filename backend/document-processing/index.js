'use strict';

const { processPdf } = require('./pdfProcessor');
const { processDocx } = require('./docxProcessor');
const { processXlsx, processCsv } = require('./spreadsheetProcessor');
const { processTxt } = require('./textProcessor');

async function processDocumentBuffer(ext, buffer) {
  const started = Date.now();
  let result;
  if (ext === 'pdf') result = await processPdf(buffer);
  else if (ext === 'docx') result = await processDocx(buffer);
  else if (ext === 'xlsx') result = processXlsx(buffer);
  else if (ext === 'csv') result = processCsv(buffer);
  else if (ext === 'txt') result = processTxt(buffer);
  else {
    result = {
      ok: false,
      status: 'failed',
      pagesCount: 0,
      extractedText: '',
      pagesJson: [],
      segments: [],
      extractionMethod: 'unsupported',
      errorMessage: `فرمت پشتیبانی نمی‌شود: ${ext}`
    };
  }
  result.processingMs = Date.now() - started;
  return result;
}

module.exports = { processDocumentBuffer };

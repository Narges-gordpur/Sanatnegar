'use strict';

function processTxt(buffer) {
  const raw = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!raw) {
    return {
      ok: false,
      status: 'failed',
      pagesCount: 0,
      extractedText: '',
      pagesJson: [],
      segments: [],
      extractionMethod: 'txt-utf8',
      errorMessage: 'فایل متنی خالی است.'
    };
  }

  const lines = raw.split(/\r?\n/);
  const segments = [];
  lines.forEach((line, idx) => {
    const clean = line.trim();
    if (clean) {
      segments.push({
        text: clean,
        page_number: 1,
        source_location: `خط ${idx + 1}`
      });
    }
  });

  return {
    ok: true,
    status: 'processed',
    pagesCount: 1,
    extractedText: raw,
    pagesJson: [{ page: 1, method: 'txt-utf8', text: raw, char_count: raw.length }],
    segments,
    extractionMethod: 'txt-utf8'
  };
}

module.exports = { processTxt };

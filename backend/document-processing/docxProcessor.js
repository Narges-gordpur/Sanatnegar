'use strict';

const mammoth = require('mammoth');

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
}

async function processDocx(buffer) {
  const [rawRes, htmlRes] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml({ buffer })
  ]);

  const rawText = (rawRes.value || '').trim();
  const html = htmlRes.value || '';

  if (!rawText) {
    return {
      ok: false,
      status: 'failed',
      pagesCount: 0,
      extractedText: '',
      pagesJson: [],
      segments: [],
      extractionMethod: 'docx-mammoth',
      errorMessage: 'سند Word فاقد متن قابل استخراج است.'
    };
  }

  const segments = [];
  let currentSection = 'بدنه سند';

  // Extract structured blocks (headings, paragraphs, table rows)
  const blockRe = /<(h[1-6]|p|li|tr)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  let blockIdx = 0;

  while ((m = blockRe.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    if (tag.startsWith('h')) {
      const heading = stripHtmlTags(inner).replace(/\s+/g, ' ').trim();
      if (heading) {
        currentSection = heading.slice(0, 60);
        blockIdx++;
        segments.push({
          text: heading,
          page_number: 1,
          source_location: `بخش «${currentSection}» · عنوان`
        });
      }
    } else if (tag === 'tr') {
      const cells = [];
      const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let td;
      while ((td = tdRe.exec(inner)) !== null) {
        const val = stripHtmlTags(td[1]).replace(/\s+/g, ' ').trim();
        if (val) cells.push(val);
      }
      if (cells.length) {
        blockIdx++;
        segments.push({
          text: cells.join(' | '),
          cells,
          page_number: 1,
          source_location: `بخش «${currentSection}» · جدول ردیف ${blockIdx}`
        });
      }
    } else {
      const para = stripHtmlTags(inner).replace(/\s+/g, ' ').trim();
      if (para) {
        blockIdx++;
        segments.push({
          text: para,
          page_number: 1,
          source_location: `بخش «${currentSection}» · پاراگراف ${blockIdx}`
        });
      }
    }
  }

  // Fallback if HTML had no standard blocks
  if (!segments.length) {
    rawText.split(/\n+/).forEach((line, idx) => {
      if (line.trim()) {
        segments.push({ text: line.trim(), page_number: 1, source_location: `پاراگراف ${idx + 1}` });
      }
    });
  }

  return {
    ok: true,
    status: 'processed',
    pagesCount: 1,
    extractedText: rawText,
    pagesJson: [{ page: 1, method: 'docx-mammoth', text: rawText, char_count: rawText.length }],
    segments,
    extractionMethod: 'docx-mammoth'
  };
}

module.exports = { processDocx };

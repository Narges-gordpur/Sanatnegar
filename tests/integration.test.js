'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { createCanvas } = require('@napi-rs/canvas');

// Use isolated temp DB for integration tests
const testDbPath = `/tmp/sanatnegar_test_${Date.now()}.sqlite`;
process.env.SQLITE_PATH = testDbPath;
process.env.DEMO_MODE = 'true';

const { createApp } = require('../backend/app');
const { closeDb } = require('../backend/database/db');
const { terminateOcrWorker } = require('../backend/document-processing/ocrEngine');

let server;
let baseUrl;
let authCookie = '';

async function api(route, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (authCookie) headers.Cookie = authCookie;
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${baseUrl}/api${route}`, { ...opts, headers });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) authCookie = setCookie.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data, headers: res.headers };
}

function makeTextPdfBuffer(lines) {
  return new Promise(resolve => {
    const doc = new PDFDocument({ size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    lines.forEach((l, i) => {
      if (i > 0) doc.addPage();
      doc.fontSize(14).text(l, 50, 80);
    });
    doc.end();
  });
}

function makeScannedImagePdfBuffer(text) {
  return new Promise(resolve => {
    const c = createCanvas(700, 180);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 700, 180);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 28px Sans';
    ctx.fillText(text, 30, 100);
    const imgBuf = c.toBuffer('image/png');

    const doc = new PDFDocument({ size: 'A4' });
    const chunks = [];
    doc.on('data', ch => chunks.push(ch));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.image(imgBuf, 40, 80, { width: 500 });
    doc.end();
  });
}

function makeDocxBuffer(text) {
  const tmpDocx = `/tmp/test_sn_${Date.now()}.docx`;
  execFileSync('python3', ['-c', `
import sys, docx
d = docx.Document()
d.add_heading('Technical Specs', level=1)
d.add_paragraph(sys.argv[2])
d.save(sys.argv[1])
`, tmpDocx, text]);
  const buf = fs.readFileSync(tmpDocx);
  fs.unlinkSync(tmpDocx);
  return buf;
}

function makeXlsxBuffer() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Attribute', 'Value', 'Unit'],
    ['Motor Power', '18.5', 'kW'],
    ['Flow Rate', '6', 'm3/h']
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Specs');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('SANATNEGAR Integration & End-to-End Tests', () => {
  before(async () => {
    const app = createApp();
    await new Promise(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await terminateOcrWorker();
    await new Promise(resolve => server.close(resolve));
    closeDb();
    try { if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch {}
  });

  it('blocks unauthenticated API access and authenticates cleanly', async () => {
    const unauth = await api('/projects');
    assert.equal(unauth.status, 401);

    const badLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong' } });
    assert.equal(badLogin.status, 401);

    const okLogin = await api('/auth/demo-login', { method: 'POST' });
    assert.equal(okLogin.status, 200);
    assert.ok(okLogin.data.user.username);
  });

  it('creates, updates, uploads PDF/OCR/DOCX/XLSX/CSV/TXT, detects conflicts, generates content & real PDF', async () => {
    // 1. Create Project
    const pRes = await api('/projects', {
      method: 'POST',
      body: { name: 'کمپرسور اسکرو تست', product_code: 'SC-900', manufacturer: 'صنعت آزمون', sector: 'نفت، گاز و پتروشیمی' }
    });
    assert.equal(pRes.status, 201);
    const pid = pRes.data.project.id;

    // 2. Reject fake PDF (magic byte attack)
    const fdEvil = new FormData();
    fdEvil.append('project_id', String(pid));
    fdEvil.append('files', new Blob(['<script>evil</script>'], { type: 'application/pdf' }), 'malware.pdf');
    const evilUp = await api('/documents/upload', { method: 'POST', body: fdEvil });
    assert.equal(evilUp.data.results[0].ok, false);

    // 3. Upload TXT, CSV, XLSX, DOCX, searchable PDF, and scanned PDF (OCR)
    const pdfTextBuf = await makeTextPdfBuffer(['Page 1 Header', 'Rated Power: 15 kW']);
    const pdfScanBuf = await makeScannedImagePdfBuffer('Working Pressure: 12 bar');
    const docxBuf = makeDocxBuffer('Net Weight: 120 kg');
    const xlsxBuf = makeXlsxBuffer();

    const fd = new FormData();
    fd.append('project_id', String(pid));
    fd.append('files', new Blob(['ظرفیت آبدهی: ۱۰۰ لیتر در دقیقه\nدما: 85 °C'], { type: 'text/plain' }), 'specs.txt');
    fd.append('files', new Blob(['ویژگی,مقدار,واحد\nولتاژ کاری,380,V'], { type: 'text/csv' }), 'elec.csv');
    fd.append('files', new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'sheet.xlsx');
    fd.append('files', new Blob([docxBuf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'manual.docx');
    fd.append('files', new Blob([pdfTextBuf], { type: 'application/pdf' }), 'datasheet.pdf');
    fd.append('files', new Blob([pdfScanBuf], { type: 'application/pdf' }), 'scanned.pdf');

    const upRes = await api('/documents/upload', { method: 'POST', body: fd });
    assert.equal(upRes.status, 201);
    assert.equal(upRes.data.results.length, 6);
    upRes.data.results.forEach(r => assert.equal(r.ok, true, `Expected ${r.filename} ok, got ${r.error}`));

    const scanResult = upRes.data.results.find(r => r.filename === 'scanned.pdf');
    assert.equal(scanResult.ocr_used, true, 'Scanned PDF must trigger real OCR');

    // Verify page number 2 tracked on datasheet.pdf
    const factsRes = await api(`/facts?project_id=${pid}&status=all`);
    const pdfPowerFact = factsRes.data.facts.find(f => f.document_filename === 'datasheet.pdf' && f.attribute_key === 'power');
    assert.ok(pdfPowerFact, 'Should extract power from PDF page 2');
    assert.equal(pdfPowerFact.page_number, 2);

    // 4. Content generation must fail before facts are approved
    const blockedGen = await api('/content/generate', {
      method: 'POST',
      body: { project_id: pid, template_slug: 'technical', language: 'fa', use_ai: false }
    });
    assert.equal(blockedGen.status, 400);

    // 5. Conflict detection: 100 L/min vs 6 m3/h must NOT conflict, 15 kW vs 18.5 kW MUST conflict
    const confRes = await api(`/conflicts?project_id=${pid}`);
    assert.ok(confRes.data.equivalentSkipped >= 1, '100 L/min and 6 m3/h should be detected as equivalent');
    const powerConflict = confRes.data.conflicts.find(c => c.attribute_key === 'power');
    assert.ok(powerConflict, '15 kW vs 18.5 kW must create an open conflict');

    // Resolve conflict by human choosing 15 kW
    const chosenId = powerConflict.left.raw_value === '15' ? powerConflict.left.id : powerConflict.right.id;
    const rejId = chosenId === powerConflict.left.id ? powerConflict.right.id : powerConflict.left.id;
    const resConf = await api(`/conflicts/${powerConflict.id}/resolve`, {
      method: 'POST',
      body: { action: 'choose_one', chosen_fact_id: chosenId, rejected_fact_id: rejId, reason: 'دیتاشیت اصلی معتبرتر است' }
    });
    assert.equal(resConf.status, 200);

    // Check fact review audit trail recorded
    const histRes = await api(`/facts/${chosenId}/history`);
    assert.ok(histRes.data.reviews.length >= 1);

    // 6. Generate grounded content in Persian & English (honest non-AI fallback since no API keys in test env)
    const genFa = await api('/content/generate', {
      method: 'POST',
      body: { project_id: pid, template_slug: 'technical', language: 'fa', use_ai: true, consent_confirmed: true }
    });
    assert.equal(genFa.status, 201);
    assert.equal(genFa.data.is_ai_generated, false);
    assert.ok(genFa.data.body.includes(`[F${chosenId}]`));

    const genEn = await api('/content/generate', {
      method: 'POST',
      body: { project_id: pid, template_slug: 'export', language: 'en', use_ai: false }
    });
    assert.equal(genEn.status, 201);
    assert.ok(genEn.data.body.includes(`[F${chosenId}]`));

    // 7. Generate real downloadable PDF catalog
    const catGen = await api('/catalogs/generate', {
      method: 'POST',
      body: { project_id: pid, content_draft_id: genFa.data.draft_id, visual_theme: 'turquoise', language: 'fa' }
    });
    assert.equal(catGen.status, 201);
    assert.ok(catGen.data.catalog.file_size > 1000);

    const dl = await api(`/catalogs/${catGen.data.catalog.id}/download`);
    assert.equal(dl.status, 200);
    assert.equal(dl.data.subarray(0, 5).toString('ascii'), '%PDF-');

    // 8. Readiness & Assistant Q&A
    const qaRes = await api(`/projects/${pid}/assistant`, {
      method: 'POST',
      body: { question: 'توان این محصول چقدر است؟', use_ai: false }
    });
    assert.equal(qaRes.status, 200);
    assert.equal(qaRes.data.answered, true);
    assert.ok(qaRes.data.answer.includes(`[F${chosenId}]`));

    // 9. Demo seed endpoint & Analytics
    const demoRes = await api('/demo/load', { method: 'POST' });
    assert.equal(demoRes.status, 200);
    const analytics = await api('/analytics');
    assert.ok(analytics.data.counts.products >= 2);
  });
});

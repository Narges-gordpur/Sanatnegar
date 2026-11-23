'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { digitsToAscii, normalizePersianText, parseNumber } = require('../backend/document-processing/normalizer');
const { canonicalAttribute, compareFactValues, normalizeFactMeasurement } = require('../backend/services/units');
const { extractRuleBasedFacts, verifyQuoteInText } = require('../backend/ai/extractor');
const { verifyGeneratedClaims } = require('../backend/ai/claimVerifier');
const { validateUploadedFile, safeResolveWithin } = require('../backend/security/fileValidator');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../backend/security/auth');

describe('SANATNEGAR Unit Tests', () => {
  it('normalizes Persian and Arabic digits, decimals, and Kaf/Yeh', () => {
    assert.equal(digitsToAscii('۱۲۳٫۴۵ و ٦٧٨'), '123.45 و 678');
    assert.equal(normalizePersianText('تجهيزات صنعتي كافي'), 'تجهیزات صنعتی کافی');
    assert.equal(parseNumber('۱,۵۰۰'), 1500);
    assert.equal(parseNumber('۱۲٫۵'), 12.5);
  });

  it('recognizes physically equivalent values across units (100 L/min == 6 m3/h, 1.5 kW == 1500 W)', () => {
    assert.equal(canonicalAttribute('توان موتور').key, canonicalAttribute('Rated Power').key);
    assert.equal(canonicalAttribute('ظرفیت آبدهی').key, canonicalAttribute('دبی نامی').key);

    const flowCmp = compareFactValues(
      { raw_value: '100', raw_unit: 'لیتر در دقیقه' },
      { raw_value: '6', raw_unit: 'مترمکعب در ساعت' }
    );
    assert.equal(flowCmp.conflict, false);
    assert.equal(flowCmp.equivalent, true);

    const powerCmp = compareFactValues(
      { raw_value: '1.5', raw_unit: 'kW' },
      { raw_value: '1500', raw_unit: 'وات' }
    );
    assert.equal(powerCmp.conflict, false);
    assert.equal(powerCmp.equivalent, true);

    const realConflict = compareFactValues(
      { raw_value: '15', raw_unit: 'kW' },
      { raw_value: '18.5', raw_unit: 'کیلووات' }
    );
    assert.equal(realConflict.conflict, true);

    const incompatibleDims = compareFactValues(
      { raw_value: '10', raw_unit: 'bar' },
      { raw_value: '10', raw_unit: '°C' }
    );
    assert.equal(incompatibleDims.conflict, true);
  });

  it('extracts rule-based specs with page numbers and normalized units', () => {
    const facts = extractRuleBasedFacts([
      { text: 'توان موتور: ۱۵ کیلووات', page_number: 2, source_location: 'صفحه 2' },
      { text: 'فشار کاری: 10 bar', page_number: 3, source_location: 'صفحه 3' },
      { text: 'استاندارد: ISO 5199', page_number: 4, source_location: 'صفحه 4' }
    ]);
    assert.ok(facts.length >= 3);
    assert.equal(facts[0].raw_value, '15');
    assert.equal(facts[0].page_number, 2);
    assert.equal(facts[0].status, 'pending_review');
    const norm = normalizeFactMeasurement(facts[0].raw_value, facts[0].raw_unit);
    assert.equal(norm.normalizedValue, 15000);
    assert.equal(norm.unitDimension, 'power');
  });

  it('flags unverified AI quotes not present in source document', () => {
    const pages = [{ page: 1, text: 'Rated voltage: 380 V' }];
    assert.equal(verifyQuoteInText('380 V', pages, 'Rated voltage: 380 V').verified, true);
    assert.equal(verifyQuoteInText('ISO 9001 certified', pages, 'Rated voltage: 380 V').verified, false);
  });

  it('verifies generated claims and detects unsupported numbers & invalid citations', () => {
    const approved = [{ id: 12, raw_value: '15', raw_unit: 'kW' }];
    const ok = verifyGeneratedClaims('توان نامی: ۱۵ کیلووات [F12]', approved, { name: 'Pump' });
    assert.equal(ok.has_warnings, false);
    assert.deepEqual(ok.cited_fact_ids, [12]);

    const bad = verifyGeneratedClaims('توان نامی: ۲۵ کیلووات [F999]', approved, { name: 'Pump' });
    assert.equal(bad.has_warnings, true);
    assert.deepEqual(bad.invalid_fact_ids, [999]);
    assert.ok(bad.unsupported_numbers.includes('25'));
  });

  it('enforces file magic-byte, extension, size validation and path-traversal protection', () => {
    const fakePdf = { originalname: 'evil.pdf', mimetype: 'application/pdf', size: 20, buffer: Buffer.from('<script>alert(1)</script>') };
    assert.equal(validateUploadedFile(fakePdf).ok, false);

    const validPdf = { originalname: 'spec.pdf', mimetype: 'application/pdf', size: 10, buffer: Buffer.from('%PDF-1.4\n...') };
    assert.equal(validateUploadedFile(validPdf).ok, true);

    const overLimit = { originalname: 'big.txt', mimetype: 'text/plain', size: 25 * 1024 * 1024, buffer: Buffer.from('a') };
    assert.equal(validateUploadedFile(overLimit).ok, false);

    assert.throws(() => safeResolveWithin('/tmp/safe', '../../etc/passwd'));
  });

  it('hashes passwords securely and signs/verifies session tokens', () => {
    const h = hashPassword('MyPass@2026');
    assert.equal(verifyPassword('MyPass@2026', h), true);
    assert.equal(verifyPassword('WrongPass', h), false);

    const tok = signToken({ id: 1, username: 'admin', role: 'admin' });
    const parsed = verifyToken(tok);
    assert.equal(parsed.username, 'admin');
    assert.equal(verifyToken(tok + 'tamper'), null);
  });
});

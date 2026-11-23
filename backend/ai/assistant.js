'use strict';

const { normalizePersianText } = require('../document-processing/normalizer');
const { ATTR_SYNONYMS } = require('../services/units');
const { runAITask } = require('./adapter');

const SYNONYM_MAP = new Map(ATTR_SYNONYMS);

async function answerProductQuestion({ project, product, approvedFacts, question, userId = null, useAi = true, consentConfirmed = false }) {
  if (!approvedFacts.length) {
    return {
      answered: false,
      isAiGenerated: false,
      provider: 'grounded-rule',
      answer: 'هیچ مشخصه تأییدشده‌ای برای این محصول ثبت نشده است. لطفاً ابتدا مشخصات استخراج‌شده را در بخش اعتبارسنجی تأیید کنید.',
      citedFacts: []
    };
  }

  const normQ = normalizePersianText(question).toLowerCase();
  const tokens = normQ.split(/\s+/).filter(t => t.length >= 2);
  const scored = approvedFacts.map(f => {
    const syns = (SYNONYM_MAP.get(f.attribute_key) || []).join(' ');
    const hay = normalizePersianText(`${f.attribute_name} ${syns} ${f.raw_value} ${f.raw_unit} ${f.evidence_text}`).toLowerCase();
    let score = 0;
    tokens.forEach(tok => { if (hay.includes(tok)) score++; });
    return { fact: f, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  if (useAi) {
    try {
      const factsBlock = approvedFacts.map(f => `[F${f.id}] ${f.attribute_name}: ${f.raw_value} ${f.raw_unit || ''} (منبع: ${f.document_filename || 'سند'} - ${f.source_location || 'صفحه ' + f.page_number})`).join('\n');
      const system = `تو دستیار هوشمند مبتنی بر دانش محصول صنعت‌نگار هستی.
قانون مطلق: فقط از فهرست مشخصات تأییدشده زیر پاسخ بده و برای هر ادعا شناسه [F#] را بنویس.
اگر پاسخ سؤال در مشخصات تأییدشده موجود نیست، صریحاً اعلام کن: «اطلاعات کافی و تأییدشده برای پاسخ به این سؤال در اسناد موجود نیست.» و هرگز حدس نزن.`;
      const aiRes = await runAITask({
        taskType: 'quality_check',
        projectId: project.id,
        userId,
        system,
        user: `محصول: ${product.name}\n\nمشخصات تأییدشده:\n${factsBlock}\n\nسؤال کاربر: ${question}`,
        temperature: 0.1,
        consentConfirmed
      });
      return {
        answered: true,
        isAiGenerated: true,
        provider: aiRes.provider,
        model: aiRes.model,
        answer: aiRes.text,
        citedFacts: scored.slice(0, 5).map(s => s.fact)
      };
    } catch {
      // Fall through cleanly to grounded deterministic answer
    }
  }

  if (!scored.length) {
    return {
      answered: false,
      isAiGenerated: false,
      provider: 'grounded-rule',
      answer: 'پاسخ معتبری برای این پرسش در میان مشخصات تأییدشده این محصول یافت نشد. (دستیار فقط به داده‌های تأییدشده استناد می‌کند.)',
      citedFacts: []
    };
  }

  const top = scored.slice(0, 5).map(s => s.fact);
  const lines = top.map(f => `• ${f.attribute_name}: ${f.raw_value}${f.raw_unit ? ' ' + f.raw_unit : ''} [F${f.id}] (منبع: ${f.document_filename || '—'}، ${f.source_location || 'صفحه ' + f.page_number})`);
  return {
    answered: true,
    isAiGenerated: false,
    provider: 'grounded-rule',
    answer: `بر اساس مشخصات تأییدشده محصول «${product.name}»:\n${lines.join('\n')}`,
    citedFacts: top
  };
}

module.exports = { answerProductQuestion };

'use strict';

const { runAITask } = require('./adapter');
const { verifyGeneratedClaims } = require('./claimVerifier');

const LANGUAGE_PACKS = {
  fa: {
    label: 'فارسی',
    dir: 'rtl',
    instruction: 'خروجی را به زبان فارسی رسمی، تخصصی و روان بنویس.',
    fallbackPrefix: 'تولیدشده با قالب پایه بدون هوش مصنوعی'
  },
  en: {
    label: 'English',
    dir: 'ltr',
    instruction: 'Write the output in clear, formal, professional industrial English.',
    fallbackPrefix: 'Generated using non-AI base template'
  },
  ar: {
    label: 'العربية',
    dir: 'rtl',
    instruction: 'اكتب المحتوى باللغة العربية الفصحى التقنية والمهنية.',
    fallbackPrefix: 'تم الإنشاء باستخدام القالب الأساسي بدون ذكاء اصطناعي'
  }
};

function buildFallbackDraft({ project, product, facts, template, language, options = {} }) {
  const specsList = facts.map(f => `- ${f.attribute_name}: ${f.raw_value}${f.raw_unit ? ' ' + f.raw_unit : ''} [F${f.id}]`).join('\n');
  const tableRows = facts.map(f => `| ${f.attribute_name} | ${f.raw_value} | ${f.raw_unit || '—'} | [F${f.id}] |`).join('\n');
  const brand = options.brand_name || product.brand_name || product.manufacturer || '';
  const contact = options.contact_info || product.contact_info || '';

  if (language === 'en') {
    const head = `# ${product.name}\n` +
      (brand ? `Brand / Manufacturer: ${brand}\n` : '') +
      (product.product_code ? `Model / Code: ${product.product_code}\n` : '') +
      `Sector: ${project.sector}\n\n`;
    const foot = contact ? `\n\n## Contact Information\n${contact}` : '';

    if (template.slug === 'datasheet') {
      return head + `## Technical Datasheet (${facts.length} Verified Specifications)\n\n| Attribute | Value | Unit | Reference |\n|---|---|---|---|\n${tableRows}` + foot;
    }
    if (template.slug === 'social') {
      return `Introducing **${product.name}**${brand ? ' by ' + brand : ''} (${project.sector}).\n\nVerified Specifications:\n${facts.slice(0, 6).map(f => `• ${f.attribute_name}: ${f.raw_value}${f.raw_unit ? ' ' + f.raw_unit : ''} [F${f.id}]`).join('\n')}${contact ? '\n\nContact: ' + contact : ''}\n\n#Industrial #Engineering`;
    }
    if (template.slug === 'email') {
      return `Subject: Product Introduction — ${product.name}\n\nDear Partner,\n\nWe are pleased to share the verified technical overview of **${product.name}**${brand ? ' (' + brand + ')' : ''}:\n\n${specsList}\n\nPlease let us know if you require the full technical catalog.${foot}`;
    }
    return head + `## Verified Technical & Commercial Overview (${template.name})\n\n${specsList}` + foot;
  }

  if (language === 'ar') {
    const head = `# ${product.name}\n` +
      (brand ? `العلامة / المصنّع: ${brand}\n` : '') +
      (product.product_code ? `الرمز الفني: ${product.product_code}\n` : '') +
      `القطاع: ${project.sector}\n\n`;
    const foot = contact ? `\n\n## معلومات التواصل\n${contact}` : '';

    if (template.slug === 'datasheet') {
      return head + `## ورقة البيانات الفنية المعتمدة\n\n| الخاصية | القيمة | الوحدة | المرجع |\n|---|---|---|---|\n${tableRows}` + foot;
    }
    return head + `## المواصفات الفنية الموثقة (${template.name})\n\n${specsList}` + foot;
  }

  // Persian (fa)
  const head = `# ${product.name}\n` +
    (brand ? `برند / تولیدکننده: ${brand}\n` : '') +
    (product.product_code ? `کد فنی / مدل: ${product.product_code}\n` : '') +
    `حوزه صنعتی: ${project.sector}\n\n`;
  const foot = contact ? `\n\n## اطلاعات تماس\n${contact}` : '';

  if (template.slug === 'datasheet') {
    return head + `## جدول مشخصات فنی تأییدشده (${facts.length} مورد)\n\n| ویژگی | مقدار | واحد | شناسه شاهد |\n|---|---|---|---|\n${tableRows}` + foot;
  }
  if (template.slug === 'email') {
    return `موضوع: معرفی فنی و تجاری محصول ${product.name}\n\nبا سلام و احترام،\n\nبه پیوست مشخصات مستند و تأییدشده محصول «${product.name}»${brand ? ` (${brand})` : ''} جهت بررسی فنی و بازرگانی تقدیم می‌گردد:\n\n${specsList}\n\nدر صورت نیاز به کاتالوگ کامل یا استعلام فنی، با ما در ارتباط باشید.${foot}`;
  }
  if (template.slug === 'social') {
    return `معرفی **${product.name}**${brand ? ' | ' + brand : ''} (${project.sector})\n\nمهم‌ترین مشخصات مستند و تأییدشده:\n${facts.slice(0, 6).map(f => `• ${f.attribute_name}: ${f.raw_value}${f.raw_unit ? ' ' + f.raw_unit : ''} [F${f.id}]`).join('\n')}\n\n#صنعت_نگار #محتوای_مستند` + (contact ? `\n${contact}` : '');
  }
  return head + `## ${template.name} (مستند به ${facts.length} مشخصه تأییدشده)\n\n${specsList}` + foot;
}

async function generateProductContent({ project, product, approvedFacts, template, language = 'fa', options = {}, userId = null, useAi = true, consentConfirmed = false }) {
  const langPack = LANGUAGE_PACKS[language] || LANGUAGE_PACKS.fa;
  const factsBlock = approvedFacts.map(f => `[F${f.id}] ${f.attribute_name}: ${f.raw_value} ${f.raw_unit || ''}`.trim()).join('\n');

  const customContext = [
    options.audience ? `مخاطب هدف: ${options.audience}` : '',
    options.target_market ? `بازار هدف: ${options.target_market}` : '',
    options.tone ? `لحن نگارش: ${options.tone}` : '',
    options.expertise_level ? `سطح تخصصی: ${options.expertise_level}` : '',
    options.length_pref ? `طول متن: ${options.length_pref}` : '',
    options.brand_name ? `نام برند: ${options.brand_name}` : '',
    options.contact_info ? `اطلاعات تماس مجاز: ${options.contact_info}` : ''
  ].filter(Boolean).join('\n');

  const system = `${template.system_prompt}
قوانین الزامی ضدتوهم:
1. فقط و فقط از مشخصات تأییدشده زیر استفاده کن.
2. هیچ عدد، استاندارد، گواهینامه یا ادعای تبلیغاتی بی‌اساس نساز.
3. کنار هر ادعای عددی یا فنی، شناسه شاهد مربوطه را به صورت [Fشماره] بنویس.
4. ${langPack.instruction}`;

  const user = `نوع قالب: ${template.name}
دستورالعمل: ${template.user_prompt}
${customContext ? '\nتنظیمات شخصی‌سازی:\n' + customContext : ''}

اطلاعات محصول:
نام محصول: ${product.name}
کد فنی: ${product.product_code || 'ثبت‌نشده'}
تولیدکننده: ${product.manufacturer || 'ثبت‌نشده'}
حوزه: ${project.sector}

مشخصات تأییدشده (تنها مرجع مجاز اعداد):
${factsBlock}

اکنون محتوا را بنویس.`;

  let body = '';
  let provider = 'template-fallback';
  let model = '';
  let isAiGenerated = false;
  let fallbackReason = '';

  if (useAi) {
    try {
      const aiRes = await runAITask({
        taskType: language === 'fa' ? 'content_generation' : 'translation',
        projectId: project.id,
        userId,
        system,
        user,
        temperature: 0.25,
        consentConfirmed
      });
      body = aiRes.text;
      provider = aiRes.provider;
      model = aiRes.model;
      isAiGenerated = true;
    } catch (err) {
      fallbackReason = err.message;
      body = buildFallbackDraft({ project, product, facts: approvedFacts, template, language, options });
    }
  } else {
    fallbackReason = 'تولید با قالب پایه به انتخاب کاربر';
    body = buildFallbackDraft({ project, product, facts: approvedFacts, template, language, options });
  }

  const verificationReport = verifyGeneratedClaims(body, approvedFacts, product);

  return {
    title: `${product.name} · ${template.name}`,
    body,
    provider,
    model,
    isAiGenerated,
    fallbackReason,
    verificationReport
  };
}

module.exports = {
  LANGUAGE_PACKS,
  generateProductContent,
  buildFallbackDraft
};

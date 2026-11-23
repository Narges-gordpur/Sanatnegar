'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { getDb } = require('./db');
const { hashPassword } = require('../security/auth');

const SEED_TEMPLATES = [
  {
    slug: 'technical',
    name: 'معرفی فنی محصول',
    category: 'فنی',
    description: 'معرفی دقیق مهندسی با تکیه بر مشخصات تأییدشده و ارجاع [F#] به شواهد.',
    system_prompt: 'تو یک نویسنده فنی ارشد در حوزه تجهیزات صنعتی هستی.',
    user_prompt: 'یک معرفی فنی دقیق و ساختاریافته بنویس که تمام اعداد و ویژگی‌ها را تنها از فهرست مشخصات تأییدشده با ارجاع [F#] بیان کند.'
  },
  {
    slug: 'brochure',
    name: 'بروشور تجاری B2B',
    category: 'بازاریابی',
    description: 'متن متقاعدکننده برای مدیران تدارکات و خریداران صنعتی بدون اغراق بی‌سند.',
    system_prompt: 'تو یک متخصص بازاریابی صنعتی B2B مبتنی بر شواهد هستی.',
    user_prompt: 'یک بروشور تجاری B2B حرفه‌ای بنویس که ارزش فنی محصول را با تکیه بر مشخصات مستند و ارجاع [F#] تشریح کند.'
  },
  {
    slug: 'catalog_copy',
    name: 'کاتالوگ محصول',
    category: 'فروش',
    description: 'متن جامع قابل استفاده در کاتالوگ رسمی و معرفی خط تولید.',
    system_prompt: 'تو طراح محتوای کاتالوگ‌های صنعتی هستی.',
    user_prompt: 'متن یک کاتالوگ حرفه‌ای شامل معرفی کلی، کاربردهای مجاز بر اساس اسناد و جدول مشخصات با ارجاع [F#] بنویس.'
  },
  {
    slug: 'datasheet',
    name: 'دیتاشیت یا برگه مشخصات',
    category: 'فنی',
    description: 'ساختار مهندسی خلاصه شامل جدول کامل مشخصات و محدودیت‌های فنی.',
    system_prompt: 'تو مهندس مستندسازی فنی هستی.',
    user_prompt: 'یک برگه مشخصات فنی (Datasheet) با جدول منظم مشخصات تأییدشده و شناسه [F#] برای هر ردیف تولید کن.'
  },
  {
    slug: 'website',
    name: 'توضیحات صفحه محصول وب‌سایت',
    category: 'دیجیتال',
    description: 'متن خوانا، ساختاریافته و مناسب صفحه فروش اینترنتی B2B.',
    system_prompt: 'تو نویسنده محتوای وب‌سایت‌های صنعتی هستی.',
    user_prompt: 'توضیحات صفحه محصول وب‌سایت را با تیترهای منظم، نکات کلیدی بولت‌شده و ارجاع [F#] تولید کن.'
  },
  {
    slug: 'seo',
    name: 'محتوای سئو شده',
    category: 'دیجیتال',
    description: 'مقاله و لندینگ صنعتی بهینه برای موتورهای جست‌وجو با داده‌های معتبر.',
    system_prompt: 'تو متخصص سئوی صنعتی مبتنی بر داده مستند هستی.',
    user_prompt: 'محتوای سئو شده با ساختار H1/H2، پرسش‌های پرتکرار مستند و حفظ ارجاع [F#] بدون ساخت ادعای غیرواقعی بنویس.'
  },
  {
    slug: 'exhibition',
    name: 'معرفی نمایشگاهی',
    category: 'نمایشگاه',
    description: 'متن کوتاه، شفاف و اثرگذار برای استند، پوستر غرفه و معرفی سریع.',
    system_prompt: 'تو متخصص ارتباطات نمایشگاه‌های صنعتی هستی.',
    user_prompt: 'یک معرفی نمایشگاهی فشرده و گویا بنویس که مهم‌ترین ویژگی‌های تأییدشده را با [F#] برجسته کند.'
  },
  {
    slug: 'profile',
    name: 'پروفایل تجاری محصول',
    category: 'فروش',
    description: 'معرفی رسمی محصول برای ارسال در مناقصات و ارزیابی تأمین‌کنندگان.',
    system_prompt: 'تو کارشناس تهیه اسناد پروفایل تأمین‌کنندگان صنعتی هستی.',
    user_prompt: 'یک پروفایل تجاری رسمی مناسب ارائه به کارفرمایان و مناقصات صنعتی با ارجاع [F#] تهیه کن.'
  },
  {
    slug: 'export',
    name: 'معرفی صادراتی',
    category: 'صادرات',
    description: 'محتوای استاندارد بین‌المللی برای ارائه به واردکنندگان و بازارهای خارجی.',
    system_prompt: 'تو متخصص توسعه صادرات تجهیزات صنعتی هستی.',
    user_prompt: 'یک معرفی استاندارد صادراتی بنویس. هیچ گواهینامه یا استاندارد بین‌المللی بدون شاهد اضافه نکن و همه اعداد را به [F#] ارجاع بده.'
  },
  {
    slug: 'social',
    name: 'محتوای شبکه‌های اجتماعی صنعتی',
    category: 'دیجیتال',
    description: 'پست تخصصی لینکدین و شبکه‌های صنعتی با استناد به داده‌های واقعی.',
    system_prompt: 'تو مدیر محتوای شبکه‌های اجتماعی تخصصی B2B هستی.',
    user_prompt: 'یک پست تخصصی برای لینکدین بنویس که با تمرکز بر داده‌های واقعی [F#] توجه مهندسان و خریداران را جلب کند.'
  },
  {
    slug: 'email',
    name: 'متن ایمیل معرفی محصول',
    category: 'فروش',
    description: 'ایمیل مستقیم B2B برای معرفی محصول به سرنخ‌های تجاری و مشتریان سازمانی.',
    system_prompt: 'تو کارشناس فروش مستقیم صنعتی B2B هستی.',
    user_prompt: 'یک ایمیل حرفه‌ای معرفی محصول با موضوع جذاب، نکات مستند [F#] و دعوت به اقدام محترمانه بنویس.'
  },
  {
    slug: 'proposal',
    name: 'پیشنهاد اولیه فروش محصول',
    category: 'فروش',
    description: 'ساختار پیش‌نویس پروپوزال فنی-تجاری اولیه برای ارسال به مشتری.',
    system_prompt: 'تو مهندس فروش صنعتی هستی.',
    user_prompt: 'یک پیشنهاد اولیه فروش محصول (Technical-Commercial Proposal) با بخش‌های خلاصه نیاز، مشخصات مستند [F#] و اطلاعات تماس بنویس.'
  }
];

const SEED_AI_TASKS = [
  { task_type: 'ocr', provider: 'deepseek', model: env.aiDefaultModels.deepseek, is_enabled: 0 },
  { task_type: 'extraction', provider: 'deepseek', model: env.aiDefaultModels.deepseek, is_enabled: 1 },
  { task_type: 'conflict_analysis', provider: 'deepseek', model: env.aiDefaultModels.deepseek, is_enabled: 0 },
  { task_type: 'content_generation', provider: 'deepseek', model: env.aiDefaultModels.deepseek, is_enabled: 1 },
  { task_type: 'quality_check', provider: 'deepseek', model: env.aiDefaultModels.deepseek, is_enabled: 0 },
  { task_type: 'translation', provider: 'deepseek', model: env.aiDefaultModels.deepseek, is_enabled: 1 }
];

const SEED_CUSTOM_ATTRIBUTES = [
  { attribute_key: 'power', attribute_label: 'توان نامی', unit_hint: 'kW / HP', category: 'الکتریکی' },
  { attribute_key: 'voltage', attribute_label: 'ولتاژ کاری', unit_hint: 'V / kV', category: 'الکتریکی' },
  { attribute_key: 'current', attribute_label: 'جریان نامی', unit_hint: 'A', category: 'الکتریکی' },
  { attribute_key: 'frequency', attribute_label: 'فرکانس', unit_hint: 'Hz', category: 'الکتریکی' },
  { attribute_key: 'operating_pressure', attribute_label: 'فشار کاری', unit_hint: 'bar / MPa', category: 'عملکردی' },
  { attribute_key: 'flow_rate', attribute_label: 'دبی / ظرفیت', unit_hint: 'm³/h / L/min', category: 'عملکردی' },
  { attribute_key: 'temperature', attribute_label: 'دمای کاری', unit_hint: '°C', category: 'شرایط محیطی' },
  { attribute_key: 'weight', attribute_label: 'وزن خالص', unit_hint: 'kg', category: 'فیزیکی' },
  { attribute_key: 'efficiency', attribute_label: 'بازده / راندمان', unit_hint: '%', category: 'عملکردی' },
  { attribute_key: 'speed', attribute_label: 'دور موتور / سرعت', unit_hint: 'rpm', category: 'مکانیکی' }
];

function runMigrations(customDb = null) {
  const db = customDb || getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);

  // Seed default admin user if users table is empty
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    db.prepare(
      'INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(env.defaultAdminUsername, 'مدیر سامانه صنعت‌نگار', hashPassword(env.defaultAdminPassword), 'admin');
  }

  // Upsert 12 system templates
  const tplStmt = db.prepare(`
    INSERT INTO templates (slug, name, category, description, system_prompt, user_prompt, is_system)
    VALUES (@slug, @name, @category, @description, @system_prompt, @user_prompt, 1)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      description = excluded.description,
      system_prompt = excluded.system_prompt,
      user_prompt = excluded.user_prompt
  `);
  const insertTpls = db.transaction(rows => { for (const r of rows) tplStmt.run(r); });
  insertTpls(SEED_TEMPLATES);

  // Seed AI task routing settings
  const aiStmt = db.prepare(`
    INSERT OR IGNORE INTO ai_provider_settings (task_type, provider, model, is_enabled, timeout_ms, max_retries, allow_external_send)
    VALUES (@task_type, @provider, @model, @is_enabled, 25000, 2, 0)
  `);
  const insertAi = db.transaction(rows => { for (const r of rows) aiStmt.run(r); });
  insertAi(SEED_AI_TASKS);

  // Seed base industrial attributes
  const attrStmt = db.prepare(`
    INSERT OR IGNORE INTO custom_attributes (attribute_key, attribute_label, unit_hint, category)
    VALUES (@attribute_key, @attribute_label, @unit_hint, @category)
  `);
  const insertAttrs = db.transaction(rows => { for (const r of rows) attrStmt.run(r); });
  insertAttrs(SEED_CUSTOM_ATTRIBUTES);

  return db;
}

if (require.main === module) {
  runMigrations();
  console.log('✓ پایگاه داده و جداول صنعت‌نگار با موفقیت مقداردهی شد.');
}

module.exports = { runMigrations, SEED_TEMPLATES };

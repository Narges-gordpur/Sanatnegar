'use strict';

const env = require('../config/env');
const { redactSecrets } = require('../security/sanitizer');

function errorHandler(err, req, res, _next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `حجم فایل از سقف مجاز ${env.maxFileSizeMb} مگابایت بیشتر است.`
    });
  }
  const status = err.status || err.statusCode || 500;
  const safeMsg = redactSecrets(err.message || 'خطای داخلی سرور رخ داد.');
  if (status >= 500 && !env.isProd) {
    console.error('[ERROR]', safeMsg);
  }
  res.status(status).json({
    error: env.isProd && status >= 500 ? 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.' : safeMsg
  });
}

module.exports = { errorHandler };

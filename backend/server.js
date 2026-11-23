'use strict';

const env = require('./config/env');
const { createApp } = require('./app');
const { terminateOcrWorker } = require('./document-processing/ocrEngine');
const { closeDb } = require('./database/db');

const app = createApp();

const server = app.listen(env.port, env.host, () => {
  console.log(`✓ سرور صنعت‌نگار (SANATNEGAR v2.0) روی http://${env.host}:${env.port} آماده است.`);
  console.log(`  - حالت نمایشی (DEMO_MODE): ${env.demoMode ? 'فعال' : 'غیرفعال'}`);
  console.log(`  - موتور OCR (Tesseract fas+eng): ${env.ocrEnabled ? 'فعال' : 'غیرفعال'}`);
});

async function shutdown() {
  server.close(async () => {
    await terminateOcrWorker();
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

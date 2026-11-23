'use strict';

const fs = require('fs');
const Tesseract = require('tesseract.js');
const { createCanvas } = require('@napi-rs/canvas');
const env = require('../config/env');

let workerPromise = null;

async function getOcrWorker() {
  if (!fs.existsSync(env.tessdataDir)) {
    fs.mkdirSync(env.tessdataDir, { recursive: true });
  }
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker('fas+eng', 1, {
        cachePath: env.tessdataDir,
        logger: () => {}
      });
      return worker;
    })().catch(err => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

async function renderPdfPageToPng(page, scale = 2.0) {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  // White background improves OCR accuracy on transparent PDFs
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport
  }).promise;

  return canvas.toBuffer('image/png');
}

async function recognizeBuffer(imageBuffer) {
  const worker = await getOcrWorker();
  const res = await worker.recognize(imageBuffer);
  return (res?.data?.text || '').trim();
}

async function terminateOcrWorker() {
  if (workerPromise) {
    try {
      const w = await workerPromise;
      await w.terminate();
    } catch { /* ignore */ }
    workerPromise = null;
  }
}

module.exports = {
  renderPdfPageToPng,
  recognizeBuffer,
  terminateOcrWorker
};

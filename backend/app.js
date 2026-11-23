'use strict';

const express = require('express');
const helmet = require('helmet');
const env = require('./config/env');
const { runMigrations } = require('./database/migrate');
const { generalLimiter } = require('./middleware/rateLimiter');
const { errorHandler } = require('./middleware/errorHandler');
const apiRouter = require('./routes');

function createApp(customDb = null) {
  runMigrations(customDb);

  const app = express();
  app.set('trust proxy', 1);

  // Security headers compatible with iframe preview
  app.use(helmet({
    frameguard: false,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use('/api', generalLimiter, apiRouter);

  // Serve only frontend static assets (never /storage!)
  app.use(express.static(env.frontendDir, { index: 'index.html' }));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };

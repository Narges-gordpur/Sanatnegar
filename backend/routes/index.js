'use strict';

const express = require('express');
const multer = require('multer');
const env = require('../config/env');
const { requireAuth } = require('../security/auth');
const { authLimiter, aiLimiter, uploadLimiter } = require('../middleware/rateLimiter');

const authCtrl = require('../controllers/authController');
const projCtrl = require('../controllers/projectsController');
const docCtrl = require('../controllers/documentsController');
const factCtrl = require('../controllers/factsController');
const confCtrl = require('../controllers/conflictsController');
const contCtrl = require('../controllers/contentController');
const catCtrl = require('../controllers/catalogsController');
const adminCtrl = require('../controllers/adminController');

const router = express.Router();

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxFileSizeBytes,
    files: 10
  }
});

// Public health & auth
router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'SANATNEGAR API', version: '2.0.0', timestamp: new Date().toISOString() });
});
router.get('/auth/session', authCtrl.session);
router.post('/auth/login', authLimiter, authCtrl.login);
router.post('/auth/demo-login', authLimiter, authCtrl.demoLogin);
router.post('/auth/register', authLimiter, authCtrl.register);
router.post('/auth/logout', authCtrl.logout);

// All routes below require authentication
router.use(requireAuth);

// Projects & Products
router.get('/projects', projCtrl.list);
router.post('/projects', projCtrl.create);
router.get('/projects/compare', projCtrl.compareProducts);
router.get('/projects/:id', projCtrl.getDetail);
router.put('/projects/:id', projCtrl.update);
router.delete('/projects/:id', projCtrl.remove);
router.get('/projects/:id/passport', projCtrl.passport);
router.get('/projects/:id/export', projCtrl.exportJson);
router.post('/projects/:id/assistant', aiLimiter, asyncHandler(projCtrl.askAssistant));

// Documents & Versions
router.get('/documents', docCtrl.list);
router.post('/documents/upload', uploadLimiter, upload.array('files', 10), asyncHandler(docCtrl.upload));
router.get('/documents/:id', docCtrl.getDetail);
router.delete('/documents/:id', docCtrl.remove);

// Facts & Reviews & Custom Attributes
router.get('/facts', factCtrl.list);
router.patch('/facts/:id/review', factCtrl.review);
router.get('/facts/:id/history', factCtrl.history);
router.delete('/facts/:id', factCtrl.remove);
router.get('/attributes', factCtrl.listCustomAttributes);
router.post('/attributes', factCtrl.addCustomAttribute);

// Conflicts
router.get('/conflicts', confCtrl.list);
router.post('/conflicts/:id/resolve', confCtrl.resolve);

// Content Studio & Templates
router.get('/templates', contCtrl.listTemplates);
router.get('/content', contCtrl.listDrafts);
router.post('/content/generate', aiLimiter, asyncHandler(contCtrl.generate));
router.post('/content/verify', contCtrl.verifyBody);
router.put('/content/:id', contCtrl.updateDraft);
router.delete('/content/:id', contCtrl.removeDraft);

// Catalogs & PDF
router.get('/catalogs', catCtrl.list);
router.post('/catalogs/generate', asyncHandler(catCtrl.generate));
router.get('/catalogs/:id/download', catCtrl.download);
router.delete('/catalogs/:id', catCtrl.remove);

// Analytics, AI Settings, Search, Backup, Demo
router.get('/analytics', adminCtrl.analytics);
router.get('/activity', adminCtrl.activity);
router.get('/search', adminCtrl.globalSearch);
router.get('/ai/settings', adminCtrl.getAiSettings);
router.put('/ai/settings/:taskType', adminCtrl.updateAiSetting);
router.post('/ai/test', aiLimiter, asyncHandler(adminCtrl.testAiProvider));
router.get('/backup', asyncHandler(adminCtrl.backupDb));
router.post('/demo/load', asyncHandler(adminCtrl.loadDemo));

module.exports = router;

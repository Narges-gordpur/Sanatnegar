'use strict';

const { getDb } = require('../database/db');
const { redactSecrets } = require('../security/sanitizer');

function logActivity({ user = null, projectId = null, action, entityType = '', entityId = null, details = '', securityEvent = false, ip = '' }) {
  try {
    getDb().prepare(`
      INSERT INTO activity_logs (user_id, actor_name, project_id, action, entity_type, entity_id, details, security_event, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user?.id || null,
      user?.display_name || user?.username || 'system',
      projectId,
      action,
      entityType,
      entityId,
      redactSecrets(details).slice(0, 1000),
      securityEvent ? 1 : 0,
      String(ip || '').slice(0, 64)
    );
  } catch { /* avoid breaking primary flow */ }
}

module.exports = { logActivity };

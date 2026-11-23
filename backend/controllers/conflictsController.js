'use strict';

const { syncAndListConflicts, resolveConflict } = require('../services/conflictService');
const { cleanString } = require('../security/sanitizer');
const { logActivity } = require('../services/auditService');

exports.list = (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!projectId) return res.json({ conflicts: [], equivalentSkipped: 0, resolutions: [] });
  const data = syncAndListConflicts(projectId);
  res.json(data);
};

exports.resolve = (req, res) => {
  const conflictId = Number(req.params.id);
  const action = cleanString(req.body?.action || 'choose_one', 40);
  const chosenFactId = Number(req.body?.chosen_fact_id) || null;
  const rejectedFactId = Number(req.body?.rejected_fact_id) || null;
  const reason = cleanString(req.body?.reason || '', 400);

  const conflict = resolveConflict(conflictId, {
    chosenFactId,
    rejectedFactId,
    user: req.user,
    action,
    reason
  });

  logActivity({
    user: req.user,
    projectId: conflict.project_id,
    action: 'حل تعارض با تصمیم انسانی',
    entityType: 'conflict',
    entityId: conflictId,
    details: `${action}${chosenFactId ? ' | انتخاب [F' + chosenFactId + ']' : ''}${rejectedFactId ? ' | رد [F' + rejectedFactId + ']' : ''}`,
    ip: req.ip
  });

  res.json({ ok: true });
};

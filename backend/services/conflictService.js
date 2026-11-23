'use strict';

const { getDb } = require('../database/db');
const { canonicalAttribute, compareFactValues } = require('./units');

function syncAndListConflicts(projectId) {
  const db = getDb();
  const facts = db.prepare(`
    SELECT f.*,
           COALESCE(p.model_name, p.product_code, '') AS product_model,
           d.original_filename AS document_filename,
           dv.version_number AS document_version_number,
           dv.created_at AS document_date,
           fe.page_number,
           fe.source_location,
           fe.evidence_text
    FROM extracted_facts f
    LEFT JOIN products p ON p.id = f.product_id
    LEFT JOIN documents d ON d.id = f.document_id
    LEFT JOIN document_versions dv ON dv.id = f.document_version_id
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    WHERE f.project_id = ? AND f.status NOT IN ('rejected', 'unverified')
    ORDER BY f.id ASC
  `).all(projectId);

  // Group by product_id + model_scope + condition_scope + canonical attribute key
  const groups = new Map();
  for (const f of facts) {
    const canon = canonicalAttribute(f.attribute_name);
    const scopeKey = `${f.product_id || 0}|${(f.model_scope || '').toLowerCase()}|${(f.condition_scope || '').toLowerCase()}|${canon.key}`;
    if (!groups.has(scopeKey)) {
      groups.set(scopeKey, { key: canon.key, label: canon.label, items: [] });
    }
    groups.get(scopeKey).items.push(f);
  }

  const activePairs = [];
  let equivalentSkipped = 0;

  for (const g of groups.values()) {
    if (g.items.length < 2) continue;
    for (let i = 0; i < g.items.length; i++) {
      for (let j = i + 1; j < g.items.length; j++) {
        const left = g.items[i];
        const right = g.items[j];
        const cmp = compareFactValues(left, right);
        if (cmp.conflict) {
          const isVersionConflict = left.document_id && left.document_id === right.document_id && left.document_version_id !== right.document_version_id;
          const reason = isVersionConflict
            ? `تعارض میان نسخه‌های مختلف سند (${cmp.reason})`
            : cmp.reason;
          activePairs.push({
            project_id: projectId,
            product_id: left.product_id || right.product_id || null,
            attribute_key: g.key,
            attribute_label: g.label,
            left,
            right,
            reason
          });
        } else if (cmp.equivalent) {
          equivalentSkipped++;
        }
      }
    }
  }

  // Persist open conflicts & mark resolved if a fact was rejected
  const existingOpen = db.prepare("SELECT * FROM conflicts WHERE project_id = ? AND status = 'open'").all(projectId);
  const existingMap = new Map(existingOpen.map(c => [`${c.left_fact_id}:${c.right_fact_id}`, c]));
  const activeKeySet = new Set(activePairs.map(p => `${p.left.id}:${p.right.id}`));

  const insertStmt = db.prepare(`
    INSERT INTO conflicts (project_id, product_id, attribute_key, attribute_label, left_fact_id, right_fact_id, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
  `);
  const updateReasonStmt = db.prepare(`
    UPDATE conflicts SET reason = ?, updated_at = datetime('now') WHERE id = ?
  `);
  const autoCloseStmt = db.prepare(`
    UPDATE conflicts SET status = 'resolved', updated_at = datetime('now') WHERE id = ?
  `);

  const syncTx = db.transaction(() => {
    for (const c of existingOpen) {
      if (!activeKeySet.has(`${c.left_fact_id}:${c.right_fact_id}`)) {
        autoCloseStmt.run(c.id);
      }
    }
    for (const p of activePairs) {
      const k = `${p.left.id}:${p.right.id}`;
      const existing = existingMap.get(k);
      if (!existing) {
        const res = insertStmt.run(p.project_id, p.product_id, p.attribute_key, p.attribute_label, p.left.id, p.right.id, p.reason);
        p.id = res.lastInsertRowid;
      } else {
        p.id = existing.id;
        if (existing.reason !== p.reason) updateReasonStmt.run(p.reason, existing.id);
      }
    }
  });
  syncTx();

  const resolutions = db.prepare(`
    SELECT cr.*, c.attribute_label
    FROM conflict_resolutions cr
    JOIN conflicts c ON c.id = cr.conflict_id
    WHERE c.project_id = ?
    ORDER BY cr.created_at DESC
    LIMIT 30
  `).all(projectId);

  return {
    conflicts: activePairs,
    equivalentSkipped,
    resolutions
  };
}

function resolveConflict(conflictId, { chosenFactId, rejectedFactId, user, action, reason }) {
  const db = getDb();
  const conflict = db.prepare('SELECT * FROM conflicts WHERE id = ?').get(conflictId);
  if (!conflict) {
    const err = new Error('تعارض مورد نظر یافت نشد.');
    err.status = 404;
    throw err;
  }

  const tx = db.transaction(() => {
    if (action === 'choose_one' && chosenFactId && rejectedFactId) {
      const prevChosen = db.prepare('SELECT status, raw_value, raw_unit FROM extracted_facts WHERE id = ?').get(chosenFactId);
      const prevRej = db.prepare('SELECT status, raw_value, raw_unit FROM extracted_facts WHERE id = ?').get(rejectedFactId);

      db.prepare("UPDATE extracted_facts SET status = 'approved', updated_at = datetime('now') WHERE id = ?").run(chosenFactId);
      db.prepare("UPDATE extracted_facts SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(rejectedFactId);

      if (prevChosen) {
        db.prepare(`
          INSERT INTO fact_reviews (fact_id, reviewer_id, reviewer_name, previous_value, new_value, previous_unit, new_unit, previous_status, new_status, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?)
        `).run(chosenFactId, user.id, user.display_name, prevChosen.raw_value, prevChosen.raw_value, prevChosen.raw_unit, prevChosen.raw_unit, prevChosen.status, `انتخاب در حل تعارض: ${reason || 'بدون توضیح'}`);
      }
      if (prevRej) {
        db.prepare(`
          INSERT INTO fact_reviews (fact_id, reviewer_id, reviewer_name, previous_value, new_value, previous_unit, new_unit, previous_status, new_status, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?)
        `).run(rejectedFactId, user.id, user.display_name, prevRej.raw_value, prevRej.raw_value, prevRej.raw_unit, prevRej.raw_unit, prevRej.status, `رد در حل تعارض: ${reason || 'بدون توضیح'}`);
      }
    } else if (action === 'reject_one' && rejectedFactId) {
      const prevRej = db.prepare('SELECT status, raw_value, raw_unit FROM extracted_facts WHERE id = ?').get(rejectedFactId);
      db.prepare("UPDATE extracted_facts SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(rejectedFactId);
      if (prevRej) {
        db.prepare(`
          INSERT INTO fact_reviews (fact_id, reviewer_id, reviewer_name, previous_value, new_value, previous_unit, new_unit, previous_status, new_status, reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?)
        `).run(rejectedFactId, user.id, user.display_name, prevRej.raw_value, prevRej.raw_value, prevRej.raw_unit, prevRej.raw_unit, prevRej.status, reason || 'رد مقدار در مقایسه تعارض');
      }
    } else if (action === 'approve_both') {
      // Mark both as approved if human explicitly confirms different conditions
      db.prepare("UPDATE extracted_facts SET status = 'approved', updated_at = datetime('now') WHERE id IN (?, ?)").run(conflict.left_fact_id, conflict.right_fact_id);
    }

    db.prepare("UPDATE conflicts SET status = 'resolved', updated_at = datetime('now') WHERE id = ?").run(conflictId);
    db.prepare(`
      INSERT INTO conflict_resolutions (conflict_id, chosen_fact_id, rejected_fact_id, resolved_by, resolver_name, resolution_action, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(conflictId, chosenFactId || null, rejectedFactId || null, user.id, user.display_name, action, reason || '');
  });
  tx();

  return conflict;
}

module.exports = { syncAndListConflicts, resolveConflict };

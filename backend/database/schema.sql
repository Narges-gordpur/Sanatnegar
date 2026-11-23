-- SANATNEGAR Relational Database Schema (SQLite, PostgreSQL-compatible design)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  sector TEXT NOT NULL DEFAULT 'صنعت و تولید',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  product_code TEXT DEFAULT '',
  manufacturer TEXT DEFAULT '',
  model_name TEXT DEFAULT '',
  category TEXT DEFAULT '',
  brand_name TEXT DEFAULT '',
  contact_info TEXT DEFAULT '',
  custom_attributes_json TEXT DEFAULT '{}',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attribute_key TEXT NOT NULL UNIQUE,
  attribute_label TEXT NOT NULL,
  unit_hint TEXT DEFAULT '',
  category TEXT DEFAULT 'عمومی',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT DEFAULT '',
  current_version_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  stored_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  sha256_hash TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 0,
  extracted_text TEXT DEFAULT '',
  pages_json TEXT DEFAULT '[]',
  extraction_method TEXT DEFAULT '',
  ocr_used INTEGER NOT NULL DEFAULT 0,
  ocr_pages_json TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT DEFAULT '',
  warning_message TEXT DEFAULT '',
  processing_ms INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extracted_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id INTEGER REFERENCES document_versions(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  attribute_name TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  raw_unit TEXT DEFAULT '',
  normalized_value REAL,
  standard_unit TEXT DEFAULT '',
  unit_dimension TEXT DEFAULT '',
  model_scope TEXT DEFAULT '',
  condition_scope TEXT DEFAULT '',
  extraction_method TEXT NOT NULL DEFAULT 'rule-based',
  confidence REAL NOT NULL DEFAULT 0.7,
  status TEXT NOT NULL DEFAULT 'pending_review',
  evidence_verified INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fact_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_id INTEGER NOT NULL REFERENCES extracted_facts(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  document_version_id INTEGER REFERENCES document_versions(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1,
  source_location TEXT DEFAULT '',
  evidence_text TEXT NOT NULL,
  exact_match INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fact_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fact_id INTEGER NOT NULL REFERENCES extracted_facts(id) ON DELETE CASCADE,
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewer_name TEXT NOT NULL DEFAULT 'system',
  previous_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  previous_unit TEXT DEFAULT '',
  new_unit TEXT DEFAULT '',
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  attribute_label TEXT NOT NULL,
  left_fact_id INTEGER NOT NULL REFERENCES extracted_facts(id) ON DELETE CASCADE,
  right_fact_id INTEGER NOT NULL REFERENCES extracted_facts(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conflict_resolutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conflict_id INTEGER NOT NULL REFERENCES conflicts(id) ON DELETE CASCADE,
  chosen_fact_id INTEGER REFERENCES extracted_facts(id) ON DELETE SET NULL,
  rejected_fact_id INTEGER REFERENCES extracted_facts(id) ON DELETE SET NULL,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolver_name TEXT NOT NULL DEFAULT '',
  resolution_action TEXT NOT NULL,
  reason TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'commercial',
  description TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  template_slug TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'fa',
  audience TEXT DEFAULT '',
  target_market TEXT DEFAULT '',
  tone TEXT DEFAULT '',
  expertise_level TEXT DEFAULT '',
  length_pref TEXT DEFAULT '',
  brand_name TEXT DEFAULT '',
  contact_info TEXT DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'template-fallback',
  model TEXT DEFAULT '',
  is_ai_generated INTEGER NOT NULL DEFAULT 0,
  verification_report_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS content_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id INTEGER NOT NULL REFERENCES content_drafts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  cited_fact_ids_json TEXT DEFAULT '[]',
  verification_report_json TEXT DEFAULT '{}',
  edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS catalogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  content_draft_id INTEGER REFERENCES content_drafts(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  visual_theme TEXT NOT NULL DEFAULT 'turquoise',
  language TEXT NOT NULL DEFAULT 'fa',
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  fact_count INTEGER NOT NULL DEFAULT 0,
  verified_only INTEGER NOT NULL DEFAULT 1,
  sha256_hash TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_provider_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'deepseek',
  model TEXT NOT NULL DEFAULT 'deepseek-chat',
  is_enabled INTEGER NOT NULL DEFAULT 0,
  timeout_ms INTEGER NOT NULL DEFAULT 25000,
  max_retries INTEGER NOT NULL DEFAULT 2,
  allow_external_send INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  estimated_cost_usd REAL DEFAULT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL DEFAULT 'system',
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT DEFAULT '',
  entity_id INTEGER,
  details TEXT DEFAULT '',
  security_event INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_project ON products(project_id);
CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_docver_doc ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_facts_project_status ON extracted_facts(project_id, status);
CREATE INDEX IF NOT EXISTS idx_facts_product_status ON extracted_facts(product_id, status);
CREATE INDEX IF NOT EXISTS idx_evidence_fact ON fact_evidence(fact_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_project ON conflicts(project_id, status);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

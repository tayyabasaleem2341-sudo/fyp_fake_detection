-- Fake Detection: full schema (Phase 3 uses the first group; the rest are ready for later phases)

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  anonymized_at TIMESTAMPTZ
);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);

CREATE TABLE cases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','analyzing','completed')),
  notes      JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cases_user ON cases(user_id);
CREATE INDEX idx_cases_status ON cases(status);

CREATE TABLE uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id       UUID REFERENCES cases(id) ON DELETE SET NULL,
  module        TEXT NOT NULL,
  original_name TEXT,
  stored_path   TEXT NOT NULL,
  mime          TEXT,
  size_bytes    BIGINT,
  sha256        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_uploads_user ON uploads(user_id);
CREATE INDEX idx_uploads_sha ON uploads(sha256);

CREATE TABLE analysis_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_id     UUID REFERENCES uploads(id) ON DELETE SET NULL,
  module        TEXT NOT NULL,
  score         NUMERIC(5,4) NOT NULL,
  label         TEXT NOT NULL,
  reliability   TEXT NOT NULL CHECK (reliability IN ('low','medium','high')),
  signals       JSONB NOT NULL DEFAULT '[]',
  explanation   TEXT,
  regions       JSONB NOT NULL DEFAULT '[]',
  timeline      JSONB NOT NULL DEFAULT '[]',
  model_version TEXT,
  input_preview TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_analysis_user ON analysis_results(user_id);
CREATE INDEX idx_analysis_module ON analysis_results(module);

CREATE TABLE evidence_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES analysis_results(id) ON DELETE SET NULL,
  module      TEXT NOT NULL,
  title       TEXT NOT NULL,
  result      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_evidence_case ON evidence_items(case_id);

CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  ip         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user ON audit_log(user_id);

CREATE TABLE model_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module     TEXT NOT NULL,
  name       TEXT NOT NULL,
  version    TEXT NOT NULL,
  metrics    JSONB NOT NULL DEFAULT '{}',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-module detail tables (filled in Phases 4-7)
CREATE TABLE forgery_regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
  x NUMERIC, y NUMERIC, w NUMERIC, h NUMERIC, score NUMERIC
);
CREATE INDEX idx_forgery_analysis ON forgery_regions(analysis_id);

CREATE TABLE message_analysis (
  analysis_id UUID PRIMARY KEY REFERENCES analysis_results(id) ON DELETE CASCADE,
  text TEXT, scam_probability NUMERIC, signals JSONB
);
CREATE TABLE email_analysis (
  analysis_id UUID PRIMARY KEY REFERENCES analysis_results(id) ON DELETE CASCADE,
  sender TEXT, reply_to TEXT, subject TEXT, headers JSONB, phishing_probability NUMERIC
);
CREATE TABLE url_analysis (
  analysis_id UUID PRIMARY KEY REFERENCES analysis_results(id) ON DELETE CASCADE,
  url TEXT, domain TEXT, features JSONB, brand_similarity NUMERIC
);
CREATE INDEX idx_url_domain ON url_analysis(domain);
CREATE TABLE qr_analysis (
  analysis_id UUID PRIMARY KEY REFERENCES analysis_results(id) ON DELETE CASCADE,
  payload TEXT, payload_type TEXT, redirect_chain JSONB
);
CREATE TABLE metadata_analysis (
  analysis_id UUID PRIMARY KEY REFERENCES analysis_results(id) ON DELETE CASCADE,
  exif JSONB, flagged_fields JSONB
);
CREATE TABLE image_matches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id       UUID NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
  matched_upload_id UUID REFERENCES uploads(id) ON DELETE SET NULL,
  matched_case_id   UUID REFERENCES cases(id) ON DELETE SET NULL,
  similarity        NUMERIC,
  first_seen        TIMESTAMPTZ
);
CREATE INDEX idx_matches_analysis ON image_matches(analysis_id);
CREATE TABLE document_analysis (
  analysis_id UUID PRIMARY KEY REFERENCES analysis_results(id) ON DELETE CASCADE,
  fields JSONB, tampered_fields JSONB, integrity_score NUMERIC
);
CREATE TABLE video_analysis (
  analysis_id UUID PRIMARY KEY REFERENCES analysis_results(id) ON DELETE CASCADE,
  duration_s NUMERIC, frames_analyzed INT, timeline JSONB, job_status TEXT
);

CREATE TABLE fusion_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  overall_score NUMERIC(5,4),
  risk          TEXT CHECK (risk IN ('low','medium','high')),
  reasons       JSONB,
  weights       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fusion_case ON fusion_results(case_id);

CREATE TABLE graph_nodes (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id  UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  kind     TEXT NOT NULL,
  label    TEXT,
  risk     TEXT,
  detail   JSONB
);
CREATE INDEX idx_graph_nodes_case ON graph_nodes(case_id);
CREATE TABLE graph_edges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL
);
CREATE INDEX idx_graph_edges_case ON graph_edges(case_id);

CREATE TABLE reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  file_path  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_case ON reports(case_id);
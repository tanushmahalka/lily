PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY, channel TEXT NOT NULL CHECK (channel IN ('instagram','email')),
  handle TEXT NOT NULL, speaks_as TEXT NOT NULL, live INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ideating' CHECK (status IN ('ideating','active','done')),
  autonomy TEXT NOT NULL DEFAULT 'human_first' CHECK (autonomy IN ('human_first','autopilot','full_autopilot')),
  budget_usd INTEGER NOT NULL, product_url TEXT NOT NULL, product_json TEXT, goal TEXT NOT NULL,
  chosen_idea_id TEXT, brief_json TEXT, guardrails_json TEXT, chat_thread_id TEXT,
  created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), position INTEGER NOT NULL,
  title TEXT NOT NULL, angle TEXT NOT NULL, video_description TEXT NOT NULL, creator_profile TEXT NOT NULL,
  keywords_json TEXT NOT NULL, video_rules_json TEXT NOT NULL, creators_target INTEGER NOT NULL,
  fee_hint_usd INTEGER NOT NULL, chosen INTEGER NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY, ig_handle TEXT NOT NULL UNIQUE, ig_user_id TEXT, name TEXT, avatar_url TEXT,
  bio TEXT, email TEXT, followers INTEGER, niche TEXT, lily_note TEXT, profile_json TEXT,
  updated_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS found_reels (
  id TEXT PRIMARY KEY, campaign_id TEXT REFERENCES campaigns(id), creator_id TEXT NOT NULL REFERENCES creators(id),
  keyword TEXT, shortcode TEXT NOT NULL, url TEXT NOT NULL, caption TEXT, thumbnail_url TEXT,
  views INTEGER, likes INTEGER, comments INTEGER, posted_at INTEGER,
  UNIQUE (campaign_id, shortcode));

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY, creator_id TEXT NOT NULL REFERENCES creators(id), campaign_id TEXT REFERENCES campaigns(id),
  fit TEXT NOT NULL CHECK (fit IN ('great','good','weak','excluded')), score_internal INTEGER NOT NULL,
  reasons_json TEXT NOT NULL, metrics_json TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), creator_id TEXT NOT NULL REFERENCES creators(id),
  source TEXT NOT NULL DEFAULT 'lily' CHECK (source IN ('lily','manual')),
  stage TEXT NOT NULL DEFAULT 'shortlisted' CHECK (stage IN ('shortlisted','reached_out','talking','negotiating','deal_ready','awaiting_video','video_feedback','video_ready','completed','declined')),
  channel TEXT NOT NULL DEFAULT 'instagram' CHECK (channel IN ('instagram','email')),
  agreed_fee_usd INTEGER, ig_thread_id TEXT, email_thread_id TEXT, latest_action TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE (campaign_id, creator_id));

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), version INTEGER NOT NULL,
  by TEXT NOT NULL CHECK (by IN ('lily','creator')), terms_json TEXT NOT NULL,
  within_guardrails INTEGER NOT NULL, violations_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','superseded','accepted','rejected')),
  created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, deal_id TEXT REFERENCES deals(id), creator_id TEXT REFERENCES creators(id),
  channel TEXT NOT NULL CHECK (channel IN ('instagram','email')), direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  body TEXT NOT NULL, external_id TEXT, attachments_json TEXT NOT NULL DEFAULT '[]',
  suppressed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), round INTEGER NOT NULL,
  source_url TEXT, local_path TEXT, review_json TEXT,
  status TEXT NOT NULL DEFAULT 'reviewing' CHECK (status IN ('reviewing','changes','lily_ok','admin_ok','admin_changes')),
  created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaigns(id), deal_id TEXT REFERENCES deals(id),
  kind TEXT NOT NULL CHECK (kind IN ('shortlist','deal','video','payment')), ref_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','changes')),
  decided_by TEXT CHECK (decided_by IN ('admin','lily')), admin_note TEXT,
  created_at INTEGER NOT NULL, decided_at INTEGER);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY, deal_id TEXT NOT NULL UNIQUE REFERENCES deals(id), amount_usd INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
  created_at INTEGER NOT NULL, paid_at INTEGER);

CREATE TABLE IF NOT EXISTS perf_snapshots (
  id TEXT PRIMARY KEY, deal_id TEXT NOT NULL REFERENCES deals(id), post_url TEXT,
  views INTEGER, likes INTEGER, comments INTEGER, taken_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, campaign_id TEXT REFERENCES campaigns(id), created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES chat_threads(id),
  role TEXT NOT NULL CHECK (role IN ('admin','lily')),
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','ideas','approval','update','steps')),
  body TEXT NOT NULL, ref_json TEXT, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL, campaign_id TEXT, deal_id TEXT,
  actor TEXT NOT NULL CHECK (actor IN ('lily','admin','creator','system')),
  type TEXT NOT NULL, summary TEXT NOT NULL, data_json TEXT);

CREATE INDEX IF NOT EXISTS events_campaign_ts ON events (campaign_id, ts);
CREATE INDEX IF NOT EXISTS messages_deal ON messages (deal_id, created_at);
CREATE INDEX IF NOT EXISTS deals_campaign ON deals (campaign_id, stage);

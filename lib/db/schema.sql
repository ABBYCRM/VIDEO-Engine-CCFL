CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS avatars (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  archetype TEXT NOT NULL,
  wardrobe_standard TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  front_asset_url TEXT,
  left_asset_url TEXT,
  right_asset_url TEXT,
  back_asset_url TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS backgrounds (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY,
  category TEXT NOT NULL,
  mission TEXT NOT NULL,
  website TEXT,
  prompt_hash TEXT,
  provider_operation_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  avatar_id UUID REFERENCES avatars(id),
  background_id UUID REFERENCES backgrounds(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_posts (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id),
  publish_at TIMESTAMPTZ,
  network TEXT NOT NULL,
  approval_state TEXT NOT NULL DEFAULT 'pending',
  auto_post BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_library (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

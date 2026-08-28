import crypto from "node:crypto";
import { db } from "@/lib/db";

db.exec(`
CREATE TABLE IF NOT EXISTS influencers (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  platform TEXT NOT NULL,
  profile_url TEXT,
  follower_count INTEGER,
  engagement_rate REAL,
  niche TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'prospect',
  notes TEXT NOT NULL DEFAULT '',
  source TEXT,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS influencer_outreach (
  id TEXT PRIMARY KEY,
  influencer_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TEXT,
  response_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_influencers_status ON influencers(status);
CREATE INDEX IF NOT EXISTS idx_influencer_outreach_influencer ON influencer_outreach(influencer_id);
`);

const STATUSES = new Set(["prospect", "contacted", "negotiating", "active", "declined"]);

export type Influencer = {
  id: string;
  handle: string;
  platform: string;
  profileUrl: string | null;
  followerCount: number | null;
  engagementRate: number | null;
  niche: string | null;
  contactEmail: string | null;
  status: string;
  notes: string;
  source: string | null;
  discoveredAt: string;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: any): Influencer {
  return {
    id: row.id,
    handle: row.handle,
    platform: row.platform,
    profileUrl: row.profile_url,
    followerCount: row.follower_count,
    engagementRate: row.engagement_rate,
    niche: row.niche,
    contactEmail: row.contact_email,
    status: STATUSES.has(row.status) ? row.status : "prospect",
    notes: row.notes || "",
    source: row.source,
    discoveredAt: row.discovered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listInfluencers(status?: string): Influencer[] {
  const rows = status
    ? db.prepare("SELECT * FROM influencers WHERE status=? ORDER BY discovered_at DESC").all(status)
    : db.prepare("SELECT * FROM influencers ORDER BY discovered_at DESC").all();
  return (rows as any[]).map(mapRow);
}

export function getInfluencer(id: string): Influencer | null {
  const row = db.prepare("SELECT * FROM influencers WHERE id=?").get(id) as any;
  return row ? mapRow(row) : null;
}

export function findInfluencerByHandle(platform: string, handle: string): Influencer | null {
  const row = db.prepare("SELECT * FROM influencers WHERE platform=? AND handle=?").get(platform, handle) as any;
  return row ? mapRow(row) : null;
}

export function createInfluencer(input: {
  handle: string;
  platform: string;
  profileUrl?: string | null;
  followerCount?: number | null;
  engagementRate?: number | null;
  niche?: string | null;
  contactEmail?: string | null;
  notes?: string;
  source?: string | null;
}): Influencer {
  const existing = findInfluencerByHandle(input.platform, input.handle);
  if (existing) return existing;
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO influencers(id,handle,platform,profile_url,follower_count,engagement_rate,niche,contact_email,notes,source) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).run(
    id,
    input.handle.trim().slice(0, 100),
    input.platform.trim().slice(0, 40),
    input.profileUrl || null,
    Number.isFinite(input.followerCount) ? input.followerCount : null,
    Number.isFinite(input.engagementRate) ? input.engagementRate : null,
    input.niche ? String(input.niche).slice(0, 200) : null,
    input.contactEmail || null,
    (input.notes || "").slice(0, 2000),
    input.source || null
  );
  return getInfluencer(id)!;
}

export function updateInfluencerStatus(id: string, status: string, notes?: string): Influencer | null {
  if (!STATUSES.has(status)) throw new Error(`status must be one of ${[...STATUSES].join(", ")}`);
  const current = getInfluencer(id);
  if (!current) return null;
  db.prepare("UPDATE influencers SET status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(status, notes !== undefined ? notes.slice(0, 2000) : current.notes, id);
  return getInfluencer(id);
}

export function deleteInfluencer(id: string): boolean {
  return db.prepare("DELETE FROM influencers WHERE id=?").run(id).changes > 0;
}

export function recordOutreach(input: { influencerId: string; channel: string; message: string; sentAt?: string | null; response?: unknown }) {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO influencer_outreach(id,influencer_id,channel,message,sent_at,response_json) VALUES(?,?,?,?,?,?)").run(
    id,
    input.influencerId,
    input.channel,
    input.message.slice(0, 5000),
    input.sentAt || null,
    input.response !== undefined ? JSON.stringify(input.response).slice(0, 8000) : null
  );
  if (input.sentAt) db.prepare("UPDATE influencers SET status='contacted',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='prospect'").run(input.influencerId);
  return db.prepare("SELECT id,influencer_id,channel,message,sent_at,created_at FROM influencer_outreach WHERE id=?").get(id);
}

export function listOutreach(influencerId: string) {
  return db.prepare("SELECT id,channel,message,sent_at,response_json,created_at FROM influencer_outreach WHERE influencer_id=? ORDER BY created_at DESC").all(influencerId);
}

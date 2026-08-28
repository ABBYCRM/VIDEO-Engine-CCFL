import crypto from "node:crypto";
import { db } from "@/lib/db";

db.exec(`
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  site_id TEXT,
  title TEXT NOT NULL,
  horizon TEXT NOT NULL DEFAULT 'monthly',
  goals_json TEXT NOT NULL DEFAULT '[]',
  channel_mix_json TEXT NOT NULL DEFAULT '[]',
  content_pillars_json TEXT NOT NULL DEFAULT '[]',
  rationale TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  model TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS strategy_revisions (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  editor TEXT,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_strategies_site ON strategies(site_id);
CREATE INDEX IF NOT EXISTS idx_strategy_revisions_strategy ON strategy_revisions(strategy_id);
`);

export type ChannelMixEntry = { channel: string; cadence: string; rationale: string };
export type StrategyRecord = {
  id: string;
  siteId: string | null;
  title: string;
  horizon: "weekly" | "monthly" | "quarterly";
  goals: string[];
  channelMix: ChannelMixEntry[];
  contentPillars: string[];
  rationale: string;
  status: "draft" | "approved";
  model: string | null;
  createdAt: string;
  updatedAt: string;
};

const HORIZONS = new Set(["weekly", "monthly", "quarterly"]);

function mapRow(row: any): StrategyRecord {
  return {
    id: row.id,
    siteId: row.site_id,
    title: row.title,
    horizon: HORIZONS.has(row.horizon) ? row.horizon : "monthly",
    goals: JSON.parse(row.goals_json || "[]"),
    channelMix: JSON.parse(row.channel_mix_json || "[]"),
    contentPillars: JSON.parse(row.content_pillars_json || "[]"),
    rationale: row.rationale || "",
    status: row.status === "approved" ? "approved" : "draft",
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listStrategies(siteId?: string): StrategyRecord[] {
  const rows = siteId
    ? db.prepare("SELECT * FROM strategies WHERE site_id=? ORDER BY created_at DESC").all(siteId)
    : db.prepare("SELECT * FROM strategies ORDER BY created_at DESC").all();
  return (rows as any[]).map(mapRow);
}

export function getStrategy(id: string): StrategyRecord | null {
  const row = db.prepare("SELECT * FROM strategies WHERE id=?").get(id) as any;
  return row ? mapRow(row) : null;
}

export function createStrategy(input: {
  siteId?: string | null;
  title: string;
  horizon?: string;
  goals: string[];
  channelMix: ChannelMixEntry[];
  contentPillars: string[];
  rationale?: string;
  model?: string | null;
}): StrategyRecord {
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO strategies(id,site_id,title,horizon,goals_json,channel_mix_json,content_pillars_json,rationale,status,model) VALUES(?,?,?,?,?,?,?,?,?,?)"
  ).run(
    id,
    input.siteId || null,
    input.title.slice(0, 200),
    HORIZONS.has(String(input.horizon)) ? input.horizon : "monthly",
    JSON.stringify(input.goals.slice(0, 20)),
    JSON.stringify(input.channelMix.slice(0, 20)),
    JSON.stringify(input.contentPillars.slice(0, 20)),
    (input.rationale || "").slice(0, 2000),
    "draft",
    input.model || null
  );
  return getStrategy(id)!;
}

export function updateStrategy(id: string, input: Partial<{ title: string; horizon: string; goals: string[]; channelMix: ChannelMixEntry[]; contentPillars: string[]; rationale: string; status: string }>, editor = "operator"): StrategyRecord | null {
  const current = getStrategy(id);
  if (!current) return null;
  const before = JSON.stringify(current);
  const next = {
    title: input.title ?? current.title,
    horizon: HORIZONS.has(String(input.horizon)) ? input.horizon! : current.horizon,
    goals: input.goals ?? current.goals,
    channelMix: input.channelMix ?? current.channelMix,
    contentPillars: input.contentPillars ?? current.contentPillars,
    rationale: input.rationale ?? current.rationale,
    status: input.status === "approved" ? "approved" : input.status === "draft" ? "draft" : current.status
  };
  db.prepare(
    "UPDATE strategies SET title=?,horizon=?,goals_json=?,channel_mix_json=?,content_pillars_json=?,rationale=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
  ).run(next.title.slice(0, 200), next.horizon, JSON.stringify(next.goals), JSON.stringify(next.channelMix), JSON.stringify(next.contentPillars), next.rationale.slice(0, 2000), next.status, id);
  const after = getStrategy(id)!;
  db.prepare("INSERT INTO strategy_revisions(id,strategy_id,editor,before_json,after_json,note) VALUES(?,?,?,?,?,?)").run(
    crypto.randomUUID(),
    id,
    editor,
    before,
    JSON.stringify(after),
    input.status === "approved" ? "approved" : "edited"
  );
  return after;
}

export function deleteStrategy(id: string): boolean {
  return db.prepare("DELETE FROM strategies WHERE id=?").run(id).changes > 0;
}

export function listStrategyRevisions(strategyId: string) {
  return db.prepare("SELECT id,editor,note,created_at FROM strategy_revisions WHERE strategy_id=? ORDER BY created_at DESC").all(strategyId);
}

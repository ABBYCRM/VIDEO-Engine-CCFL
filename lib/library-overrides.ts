import { db } from "@/lib/db";

db.exec(`CREATE TABLE IF NOT EXISTS library_text_overrides(
  asset_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  label TEXT NOT NULL,
  hide_prompt INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`);

export type LibraryTextOverride = {
  assetId: string;
  title: string;
  label: string;
  hidePrompt: boolean;
  updatedAt: string;
};

function fromRow(row: any): LibraryTextOverride {
  return { assetId: row.asset_id, title: row.title, label: row.label, hidePrompt: Boolean(row.hide_prompt), updatedAt: row.updated_at };
}

export function listLibraryTextOverrides(): LibraryTextOverride[] {
  return (db.prepare("SELECT * FROM library_text_overrides ORDER BY updated_at DESC").all() as any[]).map(fromRow);
}

export function getLibraryTextOverride(assetId: string): LibraryTextOverride | null {
  const row = db.prepare("SELECT * FROM library_text_overrides WHERE asset_id=?").get(assetId);
  return row ? fromRow(row) : null;
}

export function setLibraryTextOverride(input: { assetId: string; title: string; label: string; hidePrompt?: boolean }): LibraryTextOverride {
  db.prepare("INSERT INTO library_text_overrides(asset_id,title,label,hide_prompt,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(asset_id) DO UPDATE SET title=excluded.title,label=excluded.label,hide_prompt=excluded.hide_prompt,updated_at=CURRENT_TIMESTAMP").run(input.assetId, input.title, input.label, input.hidePrompt === false ? 0 : 1);
  return getLibraryTextOverride(input.assetId)!;
}
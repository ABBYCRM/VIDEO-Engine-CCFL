import { db } from "@/lib/db";
import { getSplitTemplate, type SplitTemplateDef } from "@/lib/split-templates";

db.exec(`CREATE TABLE IF NOT EXISTS custom_split_templates(
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  base_template_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

export type CustomSplitTemplate = {
  id: string;
  label: string;
  baseTemplateId: string;
  filePath: string;
  createdAt: string;
};

function fromRow(row: any): CustomSplitTemplate {
  return { id: row.id, label: row.label, baseTemplateId: row.base_template_id, filePath: row.file_path, createdAt: row.created_at };
}

export function listCustomSplitTemplates(): CustomSplitTemplate[] {
  return (db.prepare("SELECT * FROM custom_split_templates ORDER BY created_at DESC").all() as any[]).map(fromRow);
}

export function getCustomSplitTemplate(id: string): CustomSplitTemplate | null {
  const row = db.prepare("SELECT * FROM custom_split_templates WHERE id=?").get(id);
  return row ? fromRow(row) : null;
}

export function resolveSplitTemplate(id?: string | null): SplitTemplateDef {
  const custom = id ? getCustomSplitTemplate(id) : null;
  if (!custom) return getSplitTemplate(id);
  const base = getSplitTemplate(custom.baseTemplateId);
  return { ...base, id: custom.id, label: custom.label, assetPath: `/api/split-templates/${custom.id}/file` } as SplitTemplateDef;
}
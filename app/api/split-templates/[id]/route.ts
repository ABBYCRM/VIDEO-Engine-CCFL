import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCustomSplitTemplate } from "@/lib/custom-split-templates";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const template = getCustomSplitTemplate(id);
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  db.prepare("DELETE FROM custom_split_templates WHERE id=?").run(id);
  await fs.unlink(template.filePath).catch(() => {});
  return NextResponse.json({ ok: true });
}
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listCustomSplitTemplates } from "@/lib/custom-split-templates";
import { getSplitTemplate, isSplitTemplateId, SPLIT_TEMPLATES } from "@/lib/split-templates";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const builtIn = SPLIT_TEMPLATES.map(t => ({ ...t, baseTemplateId: t.id, previewUrl: t.assetPath }));
  const custom = listCustomSplitTemplates().map(t => {
    const base = getSplitTemplate(t.baseTemplateId);
    return { ...base, id: t.id, label: t.label, baseTemplateId: t.baseTemplateId, previewUrl: `/api/split-templates/${t.id}/file`, assetPath: `/api/split-templates/${t.id}/file` };
  });
  return NextResponse.json({ templates: [...builtIn, ...custom] });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const label = String(form.get("label") || "").trim().slice(0, 100);
  const baseTemplateId = String(form.get("baseTemplateId") || "");
  if (!(file instanceof File) || !label || !isSplitTemplateId(baseTemplateId)) return NextResponse.json({ error: "File, label, and valid baseTemplateId are required" }, { status: 400 });
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Template must be a PNG/JPEG no larger than 15MB" }, { status: 400 });
  const id = `custom-${crypto.randomUUID()}`;
  const dir = path.resolve(process.cwd(), "data/split-templates");
  const filePath = path.join(dir, `${id}.${file.type === "image/png" ? "png" : "jpg"}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  db.prepare("INSERT INTO custom_split_templates(id,label,base_template_id,file_path) VALUES(?,?,?,?)").run(id, label, baseTemplateId, filePath);
  return NextResponse.json({ id }, { status: 201 });
}
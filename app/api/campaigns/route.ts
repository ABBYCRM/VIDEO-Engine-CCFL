import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaigns = db.prepare(`SELECT id,name,category,website,mission,tone,platform,target_audience as targetAudience,avatar_id as avatarId,background_id as backgroundId,status,created_at as createdAt,updated_at as updatedAt FROM campaigns ORDER BY created_at DESC`).all();
  return NextResponse.json({ campaigns });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 180);
  const category = String(body.category || "").trim().slice(0, 80);
  const website = String(body.website || "").trim().slice(0, 500);
  const mission = String(body.mission || "").trim().slice(0, 4000);
  const tone = String(body.tone || "").trim().slice(0, 200);
  const platform = String(body.platform || "instagram").trim().slice(0, 80);
  const avatarId = String(body.avatarId || "").trim().slice(0, 120);
  const backgroundId = String(body.backgroundId || "").trim().slice(0, 120);
  if (!name || !category || !mission) return NextResponse.json({ error: "Name, category, and mission are required" }, { status: 400 });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO campaigns(id,name,category,website,mission,tone,platform,avatar_id,background_id,status) VALUES(?,?,?,?,?,?,?,?,?,'draft')`).run(
    id, name, category, website || null, mission, tone || null, platform || null, avatarId || null, backgroundId || null
  );
  const campaign = db.prepare(`SELECT id,name,category,website,mission,tone,platform,avatar_id as avatarId,background_id as backgroundId,status,created_at as createdAt FROM campaigns WHERE id=?`).get(id);
  return NextResponse.json({ campaign }, { status: 201 });
}

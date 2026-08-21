import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const NETWORKS = new Set(["instagram", "facebook", "youtube", "tiktok", "linkedin"]);
const STATUSES = new Set(["draft", "pending", "approved", "published", "failed"]);

function rowToPost(row: any) {
  return {
    id: row.id,
    title: row.title,
    network: row.network,
    scheduledAt: row.scheduled_at,
    status: row.status,
    autoPost: Boolean(row.auto_post),
    caption: row.caption,
    videoJobId: row.video_job_id,
    connectedAccountId: row.connected_account_id,
    publishedAt: row.published_at,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = db.prepare("SELECT * FROM scheduled_posts ORDER BY scheduled_at ASC").all();
  return NextResponse.json({ posts: rows.map(rowToPost) });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim().slice(0, 180);
  const network = String(body.network || "").toLowerCase();
  const scheduledAt = String(body.scheduledAt || "");
  const status = String(body.status || "draft");
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!NETWORKS.has(network)) return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const when = new Date(scheduledAt);
  if (!scheduledAt || Number.isNaN(when.getTime())) return NextResponse.json({ error: "Valid scheduledAt is required" }, { status: 400 });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO scheduled_posts(id,title,network,scheduled_at,status,auto_post,caption,video_job_id,connected_account_id)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(
      id,
      title,
      network,
      when.toISOString(),
      status,
      body.autoPost ? 1 : 0,
      String(body.caption || "").slice(0, 5000),
      body.videoJobId ? String(body.videoJobId) : null,
      body.connectedAccountId ? String(body.connectedAccountId) : null
    );
  const row = db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id);
  return NextResponse.json({ post: rowToPost(row) }, { status: 201 });
}

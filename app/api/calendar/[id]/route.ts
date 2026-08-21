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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const current = db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id) as any;
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  const title = body.title === undefined ? current.title : String(body.title).trim().slice(0, 180);
  const network = body.network === undefined ? current.network : String(body.network).toLowerCase();
  const status = body.status === undefined ? current.status : String(body.status);
  const scheduledAt = body.scheduledAt === undefined ? current.scheduled_at : new Date(String(body.scheduledAt)).toISOString();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!NETWORKS.has(network)) return NextResponse.json({ error: "Invalid network" }, { status: 400 });
  if (!STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });

  db.prepare(`UPDATE scheduled_posts SET title=?,network=?,scheduled_at=?,status=?,auto_post=?,caption=?,connected_account_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(
      title,
      network,
      scheduledAt,
      status,
      body.autoPost === undefined ? current.auto_post : body.autoPost ? 1 : 0,
      body.caption === undefined ? current.caption : String(body.caption).slice(0, 5000),
      body.connectedAccountId === undefined ? current.connected_account_id : (body.connectedAccountId ? String(body.connectedAccountId) : null),
      id
    );
  return NextResponse.json({ post: rowToPost(db.prepare("SELECT * FROM scheduled_posts WHERE id=?").get(id)) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = db.prepare("DELETE FROM scheduled_posts WHERE id=?").run(id);
  if (!result.changes) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

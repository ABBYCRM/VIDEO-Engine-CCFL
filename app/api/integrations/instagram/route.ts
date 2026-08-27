import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  clearInstagramCredentials,
  instagramHealthcheck,
  saveInstagramCredentials,
  setInstagramDmEnabled
} from "@/lib/instagram-graph";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const health = await instagramHealthcheck();
  return NextResponse.json({
    connector: "instagram-mcp",
    source: "https://github.com/adelaidasofia/instagram-mcp",
    ...health
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.dmEnabled !== undefined) setInstagramDmEnabled(Boolean(body.dmEnabled));
    if (body.accessToken || body.igUserId || body.appSecret || body.baseHost) {
      saveInstagramCredentials({
        accessToken: body.accessToken ? String(body.accessToken) : undefined,
        igUserId: body.igUserId ? String(body.igUserId) : undefined,
        appSecret: body.appSecret ? String(body.appSecret) : undefined,
        baseHost: body.baseHost ? String(body.baseHost) : undefined
      });
    }
    const health = await instagramHealthcheck();
    return NextResponse.json({ ok: true, connector: "instagram-mcp", ...health });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  clearInstagramCredentials();
  return NextResponse.json({ ok: true, configured: false });
}

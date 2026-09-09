import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getNvidiaApiKeys, setNvidiaApiKeys } from "@/lib/nvidia/client";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const keys = getNvidiaApiKeys();
    return NextResponse.json({ count: keys.length, sample: keys[0]?.slice(0, 12) + "…" });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const keys = body?.keys;
  if (!Array.isArray(keys) || !keys.every((k) => typeof k === "string" && k.trim().length >= 8))
    return NextResponse.json({ error: "keys must be an array of Bitdeer API key strings" }, { status: 400 });
  try {
    setNvidiaApiKeys((keys as string[]).map((k) => k.trim()));
    return NextResponse.json({ ok: true, count: keys.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

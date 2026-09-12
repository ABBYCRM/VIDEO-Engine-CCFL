import { NextResponse } from "next/server";
import { requireAdmin, unauthorized } from "@/lib/auth";
import { addNvidiaApiKey, nvidiaKeyCount, setNvidiaApiKeys } from "@/lib/nvidia/client";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const count = nvidiaKeyCount();
  return NextResponse.json({ count, configured: count > 0 });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = await req.json().catch(() => null);
  try {
    if (typeof body?.add === "string") {
      const count = addNvidiaApiKey(body.add);
      return NextResponse.json({ ok: true, count });
    }
    const keys = body?.keys;
    if (!Array.isArray(keys) || !keys.every((k: unknown) => typeof k === "string" && k.trim().length >= 8)) {
      return NextResponse.json({ error: "keys must be an array of Bitdeer API key strings, or pass add" }, { status: 400 });
    }
    setNvidiaApiKeys((keys as string[]).map((k) => k.trim()));
    return NextResponse.json({ ok: true, count: keys.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

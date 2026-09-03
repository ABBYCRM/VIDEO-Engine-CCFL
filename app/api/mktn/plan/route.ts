import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runFastMarketingPlan } from "@/lib/mktn/providers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  try {
    return NextResponse.json(await runFastMarketingPlan(body));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build marketing plan." }, { status: 400 });
  }
}

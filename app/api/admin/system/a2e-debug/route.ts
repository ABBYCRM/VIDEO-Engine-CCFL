// Admin: test what payload the autopilot would send to A2E for a given
// campaign slot. Use to debug "rejected task" errors without spamming
// real generation jobs.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { compileVeoPrompt } from "@/lib/prompt-compiler";
import { normalizeCategory } from "@/lib/campaign-autopilot";
import { getA2eModel } from "@/lib/a2e-model-catalog";
import * as a2e from "@/lib/a2e";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const slotId = body.slotId;
    if (!slotId) return NextResponse.json({ error: "slotId required" }, { status: 400 });
    const row = db.prepare(`
      SELECT sp.id, sp.title, sp.content_type, sp.caption, c.name as campaign_name, c.category, c.mission, c.avatar_id, c.video_provider
      FROM scheduled_posts sp JOIN campaigns c ON c.id = sp.campaign_id
      WHERE sp.id = ?
    `).get(slotId) as any;
    if (!row) return NextResponse.json({ error: "slot not found" }, { status: 404 });
    const chosen = String(row.video_provider || "veo");
    const model = chosen === "a2e" ? "seedance2.5" : undefined;
    const variation = `${row.mission}\nCalendar variation: ${row.title}. Produce a distinct execution for this scheduled post while preserving the campaign message.`;
    const prompt = compileVeoPrompt({ category: normalizeCategory(row.category), mission: variation });
    return NextResponse.json({
      ok: true,
      slot: { id: row.id, title: row.title, videoProvider: chosen, contentType: row.content_type, avatarId: row.avatar_id },
      payload: {
        provider: chosen,
        model,
        promptLength: prompt.length,
        promptStart: prompt.slice(0, 300),
        aspectRatio: "9:16",
        durationSeconds: 8
      },
      modelInfo: model ? getA2eModel(model) : null
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

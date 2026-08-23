import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAllVoices, sendTts, trainVoiceClone } from "@/lib/a2e-tts";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const voices = await listAllVoices();
    return NextResponse.json({ ok: true, voices });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "tts");
    if (action === "tts") {
      const text = String(body.text || "").trim();
      if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
      const result = await sendTts({
        text,
        ttsId: body.ttsId ? String(body.ttsId) : undefined,
        userVoiceId: body.userVoiceId ? String(body.userVoiceId) : undefined,
        country: body.country ? String(body.country) : undefined,
        region: body.region ? String(body.region) : undefined,
        speechRate: typeof body.speechRate === "number" ? body.speechRate : undefined
      });
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "train") {
      const name = String(body.name || "").trim();
      const voiceUrls = Array.isArray(body.voiceUrls) ? body.voiceUrls.map((v: unknown) => String(v)) : [];
      const gender: "female" | "male" = body.gender === "male" ? "male" : "female";
      if (!name || !voiceUrls.length) return NextResponse.json({ error: "name and voiceUrls are required" }, { status: 400 });
      const result = await trainVoiceClone({ name, voiceUrls, gender, language: body.language ? String(body.language) : undefined });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

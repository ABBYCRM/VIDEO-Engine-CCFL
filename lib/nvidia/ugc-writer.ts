import { chatCompletion, getNvidiaModel, isNvidiaEnabled } from "./client";

export type UgcWritingResult = {
  script: string;
  hook: string;
  captions: string[];
  postCaption: string;
};

export async function writeUgcPackage(input: { mission: string; tone?: string; contextMode?: string }): Promise<UgcWritingResult> {
  if (!isNvidiaEnabled()) throw new Error("NVIDIA content intelligence is not configured");
  const model = getNvidiaModel();
  if (model === "disabled") throw new Error("NVIDIA content intelligence is disabled");
  const mission = input.mission.trim().slice(0, 4000);
  if (!mission) throw new Error("Mission is required");

  const response = await chatCompletion({
    model,
    temperature: 0.65,
    maxTokens: 900,
    jsonMode: true,
    messages: [
      {
        role: "system",
        content: `You write short-form UGC/podcast social content for an internal video production tool. Return ONLY JSON with keys script, hook, captions, postCaption. The final spoken video is exactly 8 seconds, so script must be naturally speakable in 8 seconds (roughly 16-24 words). hook must be 3-8 words. captions must be an array of 2-5 phrase chunks that cover the spoken script. postCaption should be concise, truthful, and platform-neutral. Never invent testimonials, settlements, outcomes, diagnoses, statistics, or facts not in the mission.`
      },
      {
        role: "user",
        content: `Mission: ${mission}\nTone: ${(input.tone || "natural, direct, conversational").slice(0,300)}\nTop/bottom context relationship: ${(input.contextMode || "mixed").slice(0,50)}`
      }
    ]
  });

  let raw = response.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const parsed = JSON.parse(raw) as Partial<UgcWritingResult>;
  const script = String(parsed.script || "").trim().slice(0, 500);
  const hook = String(parsed.hook || "").trim().slice(0, 100);
  const postCaption = String(parsed.postCaption || "").trim().slice(0, 2200);
  const captions = Array.isArray(parsed.captions) ? parsed.captions.map(v => String(v).trim().slice(0, 80)).filter(Boolean).slice(0, 8) : [];
  if (!script || !hook) throw new Error("NVIDIA returned an incomplete UGC writing package");
  return { script, hook, captions, postCaption };
}

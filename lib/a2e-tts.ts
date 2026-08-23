// A2E text-to-speech + voice clone helpers.
// Used to generate narration audio for campaign slots when the operator
// wants lip-synced avatar video (Hedra, A2E Video Twin) without recording
// a human voice every time.
//
// Endpoints used:
//   POST /api/v1/video/send_tts
//     { msg: string, tts_id?: string, user_voice_id?: string,
//       country?: string, region?: string, speechRate?: number }
//     → returns { data: { audio_url?: string, _id?: string, ... } }
//
//   POST /api/v1/userVoice/trainTtsModel
//     { name, voice_urls: [string], gender, language }
//     → returns { data: { _id, current_status } } — async; poll
//       /api/v1/userVoice/detail/{_id} until current_status === "completed"
//
//   GET  /api/v1/anchor/tts_list
//     → returns array of system voices ({ _id, name, gender, language })
//
//   GET  /api/v1/userVoice/voice_list
//     → returns array of the authenticated user's cloned voices

import { a2eHeaders, A2E_BASE } from "@/lib/a2e-shared";

const POLL_MS = 3000;
const TRAIN_TIMEOUT_MS = 240_000; // 4 min — voice clones usually finish in <2 min

export type A2eTtsVoice = {
  _id: string;
  name: string;
  gender?: "female" | "male" | string;
  language?: string;
  source: "system" | "cloned";
};

export type A2eTtsResult = {
  audioUrl: string;
  durationSeconds?: number;
  voiceId: string;
};

export async function listSystemVoices(): Promise<A2eTtsVoice[]> {
  const res = await fetch(`${A2E_BASE}/anchor/tts_list`, { method: "POST", headers: a2eHeaders(), body: JSON.stringify({}) });
  if (!res.ok) throw new Error(`A2E tts_list HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return (json.data ?? []).map((v) => ({
    _id: String(v._id ?? ""),
    name: String(v.name ?? v.voice_name ?? "A2E voice"),
    gender: (v.gender as string | undefined) ?? undefined,
    language: (v.language as string | undefined) ?? (v.lang as string | undefined) ?? undefined,
    source: "system" as const
  })).filter((v) => v._id);
}

export async function listClonedVoices(): Promise<A2eTtsVoice[]> {
  const res = await fetch(`${A2E_BASE}/userVoice/voice_list`, { method: "GET", headers: a2eHeaders() });
  if (!res.ok) throw new Error(`A2E userVoice/voice_list HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return (json.data ?? []).map((v) => ({
    _id: String(v._id ?? ""),
    name: String(v.name ?? "Cloned voice"),
    gender: (v.gender as string | undefined) ?? undefined,
    language: (v.language as string | undefined) ?? undefined,
    source: "cloned" as const
  })).filter((v) => v._id);
}

export async function listAllVoices(): Promise<A2eTtsVoice[]> {
  const [system, cloned] = await Promise.all([listSystemVoices().catch(() => []), listClonedVoices().catch(() => [])]);
  return [...cloned, ...system];
}

export async function sendTts(input: {
  text: string;
  ttsId?: string;
  userVoiceId?: string;
  country?: string;
  region?: string;
  speechRate?: number;
}): Promise<A2eTtsResult> {
  if (!input.ttsId && !input.userVoiceId) throw new Error("A2E TTS requires either ttsId or userVoiceId");
  const body: Record<string, unknown> = { msg: input.text.slice(0, 3000) };
  if (input.ttsId) body.tts_id = input.ttsId;
  if (input.userVoiceId) body.user_voice_id = input.userVoiceId;
  if (input.country) body.country = input.country;
  if (input.region) body.region = input.region;
  if (typeof input.speechRate === "number") body.speechRate = input.speechRate;
  const res = await fetch(`${A2E_BASE}/video/send_tts`, { method: "POST", headers: a2eHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`A2E send_tts HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { code?: number; data?: { audio_url?: string; audioUrl?: string; url?: string; _id?: string }; error?: string };
  const url = json.data?.audio_url ?? json.data?.audioUrl ?? json.data?.url;
  if (!url) throw new Error(`A2E send_tts did not return an audio URL (code=${json.code}, error=${json.error ?? "?"})`);
  return { audioUrl: url, voiceId: input.ttsId ?? input.userVoiceId ?? "" };
}

export async function trainVoiceClone(input: {
  name: string;
  voiceUrls: string[];
  gender: "female" | "male";
  language?: string;
  model?: "a2e" | "cartesia" | "minimax" | "elevenlabs";
  denoise?: boolean;
  enhanceVoiceSimilarity?: boolean;
}): Promise<{ voiceId: string }> {
  if (!input.voiceUrls.length) throw new Error("trainVoiceClone requires at least one voiceUrls entry");
  const body: Record<string, unknown> = {
    name: input.name,
    voice_urls: input.voiceUrls,
    gender: input.gender,
    model: input.model ?? "a2e",
    denoise: input.denoise ?? true,
    enhance_voice_similarity: input.enhanceVoiceSimilarity ?? true
  };
  if (input.language) body.language = input.language;
  const res = await fetch(`${A2E_BASE}/userVoice/trainTtsModel`, { method: "POST", headers: a2eHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`A2E trainTtsModel HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: { _id?: string }; error?: string };
  const id = json.data?._id;
  if (!id) throw new Error(`A2E trainTtsModel did not return a voice id (error=${json.error ?? "?"})`);
  // Poll for completion
  const deadline = Date.now() + TRAIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const detail = await fetch(`${A2E_BASE}/userVoice/detail/${encodeURIComponent(id)}`, { method: "GET", headers: a2eHeaders() });
    if (!detail.ok) continue;
    const dJson = (await detail.json()) as { data?: { current_status?: string; speaker_id?: string } };
    const status = (dJson.data?.current_status ?? "").toLowerCase();
    if (status === "completed") return { voiceId: id };
    if (status === "failed") throw new Error(`A2E voice clone training failed (id=${id})`);
  }
  throw new Error(`A2E voice clone training did not complete within ${TRAIN_TIMEOUT_MS}ms (id=${id})`);
}

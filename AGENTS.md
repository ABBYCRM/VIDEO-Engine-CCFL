# AI Engineering Contract — VIDEO-Engine

## Product contract

VIDEO-Engine is a **single-shot generation service**. A generation request must trigger exactly one provider video operation for one 8-second output. Never silently convert a request into multiple shots, extension calls, or stitched clips.

## Required flow

1. Authenticate admin session or `ve_live_*` API token.
2. Validate category, request fields, and `provider` (`veo` | `grok` | `a2e`).
3. Select exactly one category template: `car_accident`, `rideshare`, `trucking`, `slip_fall`, or `ugc`.
4. Compile the user mission into a compact provider prompt. Keep the directive `ONE CONTINUOUS SHOT ONLY` and stay under the provider prompt limit.
5. Resolve provider credentials only on the server, per-provider slot:
   - `veo` → `gemini_api_key` (Google Gemini API)
   - `grok` → `xai_api_key` (xAI Grok Imagine, `https://api.x.ai/v1/videos/generations`)
   - `a2e` → `a2e_api_key` (A2E AI multi-model router, `https://video.a2e.ai/api/v1/veoVideo/start`)
6. Start exactly ONE provider operation:
   - `veo`: `durationSeconds: 8`, `numberOfVideos: 1`
   - `grok`: `duration: 8`, single shot
   - `a2e`: aspect-locked, model chosen from router enum
7. Persist the provider operation name + provider id.
8. Poll through the status endpoint; never fake progress or completion.
9. On provider success, download the MP4 and only then mark the job `succeeded`.
10. Return or stream the authenticated MP4.

## Providers

| ID | Upstream | Start endpoint | Auth | One-shot contract |
|---|---|---|---|---|
| `veo` | Google Veo 3.1 (direct) | `https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning` | `x-goog-api-key` | `durationSeconds: 8`, `numberOfVideos: 1` |
| `grok` | xAI Grok Imagine | `https://api.x.ai/v1/videos/generations` | `Authorization: Bearer $XAI_API_KEY` | `duration: 8` |
| `a2e` | A2E AI multi-model router | `https://video.a2e.ai/api/v1/veoVideo/start` | `Authorization: Bearer $A2E_API_KEY` | single-shot operation, model-locked |

## Secret handling

- Never commit `.env`.
- Never write a raw provider key (Gemini / xAI / A2E) to logs, API responses, client state, or source control.
- Settings-store all provider keys with AES-256-GCM.
- Never store raw VIDEO-Engine API tokens; SHA-256 hash only.
- A generated raw API token is shown once.

## PI marketing constraints

Do not create guarantees, fabricated settlements, fake testimonials, fake clients, unsupported diagnoses, fake police/news evidence, or imply generated reenactments are authentic documented incidents. Keep accident content non-graphic by default. Preserve trademark neutrality for rideshare brands.

## UI

Maintain a shadcn-compatible structure with TypeScript and Tailwind. The primary generator must keep one visible button/card per supported campaign category and clearly state the one-shot 8-second contract.

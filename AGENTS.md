# AI Engineering Contract — VIDEO-Engine

## Product contract

VIDEO-Engine is a **single-shot generation service**. A generation request must trigger exactly one Gemini/Veo video operation for one 8-second output. Never silently convert a request into multiple shots, extension calls, or stitched clips.

## Required flow

1. Authenticate admin session or `ve_live_*` API token.
2. Validate category and request fields.
3. Select exactly one category template: `car_accident`, `rideshare`, `trucking`, `slip_fall`, or `ugc`.
4. Compile the user mission into a compact provider prompt. Keep the directive `ONE CONTINUOUS SHOT ONLY` and stay under the provider prompt limit.
5. Resolve Gemini credentials only on the server.
6. Start exactly one Veo operation with `durationSeconds: 8` and `numberOfVideos: 1`.
7. Persist the provider operation name.
8. Poll through the status endpoint; never fake progress or completion.
9. On provider success, download the MP4 and only then mark the job `succeeded`.
10. Return or stream the authenticated MP4.

## Secret handling

- Never commit `.env`.
- Never write a raw Gemini key to logs, API responses, client state, or source control.
- Settings-store Gemini keys with AES-256-GCM.
- Never store raw VIDEO-Engine API tokens; SHA-256 hash only.
- A generated raw API token is shown once.

## PI marketing constraints

Do not create guarantees, fabricated settlements, fake testimonials, fake clients, unsupported diagnoses, fake police/news evidence, or imply generated reenactments are authentic documented incidents. Keep accident content non-graphic by default. Preserve trademark neutrality for rideshare brands.

## UI

Maintain a shadcn-compatible structure with TypeScript and Tailwind. The primary generator must keep one visible button/card per supported campaign category and clearly state the one-shot 8-second contract.

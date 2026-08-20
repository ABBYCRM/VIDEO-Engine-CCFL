# VIDEO-Engine

Single-shot AI video generation service for personal-injury marketing and general UGC production. The engine compiles a campaign mission into one compact Veo prompt and makes exactly **one 8-second generation request**. It never creates an automatic montage, never extends a clip, and never stitches multiple model generations.

## Campaign buttons

- Car Accident
- Rideshare / Uber / Lyft
- Trucking / 18-Wheeler
- Slip & Fall
- UGC Video

Each mode carries its own prompt policy. The prompt compiler adds shared photorealism, human anatomy, physics, audio, temporal-consistency, and legal-ad constraints while keeping the final provider prompt under a conservative size cap.

## Architecture

```text
Browser / external software
        |
        +--> Admin session or ve_live_* API token
        |
        +--> VIDEO-Engine prompt compiler
        |      - category template
        |      - user mission / subject / dialogue
        |      - realism + physics constraints
        |      - legal marketing guardrails
        |      - ONE CONTINUOUS SHOT directive
        |
        +--> Gemini API / Veo 3.1 (one operation, exactly 8 seconds)
        |
        +--> operation polling
        |
        +--> protected MP4 download / on-screen player
```

## Security model

- Never commit `GEMINI_API_KEY`, GitHub tokens, admin passwords, or session secrets.
- Gemini API keys saved in the Settings page are encrypted at rest with AES-256-GCM using `APP_ENCRYPTION_KEY`.
- The Gemini key is never returned back to the browser after storage.
- VIDEO-Engine API tokens use the format `ve_live_*`; the raw token is displayed once and only a SHA-256 hash is stored.
- Revoke exposed credentials immediately.

## Local setup

```bash
cp .env.example .env
npm install
npm run token:key
# paste the generated base64 value into APP_ENCRYPTION_KEY
# set ADMIN_PASSWORD and SESSION_SECRET
npm run dev
```

Open `http://localhost:3000`, sign in, then go to **Settings** and save a fresh Gemini API key.

## External API

### Create a video

`POST /api/v1/video`

Header:

```text
Authorization: Bearer ve_live_...
Content-Type: application/json
```

Body:

```json
{
  "category": "car_accident",
  "mission": "Create a realistic PI-awareness shot after a rear-end collision",
  "subject": "Adult woman safely standing beside a damaged sedan",
  "script": "I didn't know what I needed to document after the crash.",
  "aspectRatio": "9:16",
  "resolution": "1080p"
}
```

Response (`202`):

```json
{
  "id": "uuid",
  "status": "running",
  "statusUrl": "/api/v1/video/uuid",
  "durationSeconds": 8,
  "oneShot": true
}
```

### Poll a video

`GET /api/v1/video/:id` with the same Bearer token. When status is `succeeded`, the response contains `fileUrl`.

### Download / stream

`GET /api/v1/video/:id/file` with the same Bearer token.

### Reference image

External clients may include a single image as base64:

```json
{
  "imageBase64": "...",
  "imageMimeType": "image/png"
}
```

The service caps reference images at 10MB. For image-to-video, Veo's adult-person restrictions apply.

## One-shot protocol

The server, not the browser, enforces this:

- `durationSeconds = 8`
- `numberOfVideos = 1`
- prompt starts with `ONE CONTINUOUS SHOT ONLY`
- no extension endpoint exists
- no multi-shot endpoint exists
- no stitch/merge endpoint exists

This is intentional. If a longer campaign is needed later, orchestration should happen in a separate product layer rather than silently changing VIDEO-Engine's one-shot contract.

## Legal marketing note

The included PI templates are deliberately conservative. They reject/prompts against guaranteed recoveries, invented settlements, fake clients/testimonials, unsupported medical diagnoses, and synthetic footage presented as real evidence. Attorney-advertising rules vary by jurisdiction; production campaigns should still be reviewed for the target state/country.

## DigitalOcean deployment

The repo includes a Dockerfile and persistent `/app/data` directory. For DigitalOcean:

1. Create an App or Droplet from this GitHub repository.
2. Build from the Dockerfile and expose port `3000`.
3. Configure secrets: `ADMIN_PASSWORD`, `SESSION_SECRET`, `APP_ENCRYPTION_KEY`.
4. Attach persistent storage mounted at `/app/data` if using SQLite and local MP4 storage.
5. Set `PUBLIC_BASE_URL` to the final HTTPS hostname.
6. After first login, add the Gemini API key through Settings, or configure `GEMINI_API_KEY` as a DigitalOcean secret.
7. For horizontal scaling, replace SQLite/local MP4 storage with managed PostgreSQL + Spaces object storage before adding multiple replicas.

## AI maintainer instructions

Any AI modifying this repository must preserve these invariants unless the owner explicitly changes the product contract:

1. Never hard-code, print, commit, or return secrets.
2. One user generation request = one Veo provider operation = one 8-second video.
3. Do not add multi-shot generation, video extension, or automatic stitching to the generation path.
4. Keep prompt compilation server-side and below the provider prompt limit.
5. Preserve the five campaign categories and their safety/legal constraints.
6. API tokens are hash-only at rest and raw values are displayed once.
7. Generated-video endpoints remain authenticated.
8. Maintain TypeScript strict mode and shadcn-compatible `/components/ui` structure.
9. Validate all user-controlled enum values, image size, and prompt field lengths.
10. Do not claim a video succeeded until Veo reports completion and the MP4 has been downloaded successfully.

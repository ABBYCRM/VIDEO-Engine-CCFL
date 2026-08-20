# MiniMax Engineering Instructions — VIDEO-Engine Final

## PURPOSE

You are the implementation engineer for **VIDEO-Engine**, a production-oriented AI marketing system for a personal-injury / case-acquisition marketing team.

Your job is not to brainstorm a prototype. Your job is to **finish, validate, harden, and maintain the complete end-to-end application** until all acceptance criteria in this document are satisfied.

The expected behavior is:

**user intent → site research → campaign strategy → prompt selection → canonical avatar selection → one-shot video generation → optional avatar animation/lip sync → background composition → approval → calendar → publishing → ad monitoring → ROI analysis → prompt-performance memory**

The system must remain easy enough for a marketing user to operate without understanding prompt engineering, video APIs, advertising APIs, or infrastructure internals.

---

# ABSOLUTE SECURITY / CREDENTIAL HANDLING RULE

These rules are mandatory and supersede examples found elsewhere in the repository.

1. **Never output a credential in chat.**
2. **Never ask a user to paste a credential into chat.**
3. **Never echo a credential back after it has been entered into the product UI.**
4. **Never place credentials in README examples, screenshots, logs, stack traces, test fixtures, seed data, source code, prompts, generated content, or API responses.**
5. **Never serialize a credential into browser-visible state.**
6. **Never store plaintext credentials in PostgreSQL.**
7. **Never expose credentials in query strings or URLs.**
8. **Never include credential-management links in generated chat responses.**
9. **Never commit local environment files containing secrets.**
10. If a provider returns a secret-like value, redact it before logging or presenting errors.
11. When documenting configuration, refer only to the **Settings → Integrations / API Credentials** interface and environment variable *names*. Do not include example values.
12. When performing debugging, log provider name, request ID, operation ID, HTTP status, latency, and sanitized error codes — not request authorization headers or secret payload fields.

The product may contain credential input controls because administrators need to configure providers. The UI must use masked password-style fields and the server must return only metadata such as:

- provider name
- configured: true/false
- last updated timestamp
- optional non-secret account identifier

The server must never return the stored credential itself.

---

# PRODUCT IDENTITY

Product name: **VIDEO-Engine Final**

Primary use: internal digital marketing, content generation, paid social, organic social, lead-generation campaigns, and personal-injury educational advertising.

Primary business domain examples:

- motor vehicle accidents
- rideshare accidents
- trucking / commercial vehicle accidents
- slip and fall / premises liability
- general UGC marketing
- case-acquisition education
- legal-news / newsroom-style content

The application's campaign framework must also remain reusable for future verticals.

---

# NON-NEGOTIABLE ONE-SHOT VIDEO CONTRACT

The original generation protocol must remain enforced.

For the primary AI video-generation request:

- one user generation action
- one compiled video prompt
- one provider generation operation
- one generated clip
- default duration: 8 seconds
- no automatic scene stitching
- no hidden video extensions
- no silent montage generation
- no automatic second or third generation call to complete the same primary clip

The one-shot clip may subsequently be placed inside a **post-production composition**, such as:

- newsroom TV screen
- split screen
- chroma-key-equivalent background
- picture-in-picture
- supporting-video wall

That composition step is an editor/compositor operation and must not masquerade as multiple AI-generation shots.

The backend must maintain a clear distinction between:

1. `generation_job`
2. `animation_job`
3. `composition_job`
4. `publishing_job`

Never merge those lifecycle states into one ambiguous status field.

---

# CORE EXPERIENCE

A normal marketer should be able to create a campaign as follows:

1. Open **Campaigns**.
2. Enter the website being marketed.
3. Choose a campaign category.
4. Choose or create an avatar.
5. Choose tone.
6. Choose platform.
7. Choose a background / layout.
8. Enter a mission, or accept AI-generated strategy.
9. Click **Research & Plan**.
10. Review site summary, audience, competitor angles, relevant current material, hook options, CTA options, and compliance warnings.
11. Click **Generate One-Shot Video**.
12. Watch generation status in the interface.
13. Preview the generated clip.
14. Optionally run Hedra animation / lip sync when the content uses a speaking avatar and the selected pipeline requires it.
15. Optionally place supporting footage into newsroom / split-screen / TV-wall layouts.
16. Add captions, site name, logo, CTA, disclaimer, and campaign metadata.
17. Send the item to approval.
18. Approve or reject.
19. Schedule in Calendar.
20. Publish manually or use auto-post.
21. If an ad account is connected, monitor spend and performance.
22. Record the relationship between campaign, prompt set, avatar, creative, ad set, spend, leads, and ROI.
23. Feed performance back into prompt selection without overwriting historical records.

---

# AVATAR SYSTEM

## Canonical identity model

An avatar is not merely a profile photo. It is a canonical identity asset.

Each avatar record must store:

- unique avatar ID
- user-visible name
- gender / presentation metadata if configured
- archetype
- wardrobe standard
- canonical face reference
- front full-body or 3/4 reference
- left-side reference
- right-side reference
- back reference
- optional close-up reference
- optional voice profile ID
- optional Hedra character / asset identifiers
- optional provider-specific reference identifiers
- status: draft / incomplete / ready / archived
- created_by
- created_at
- updated_at

## Four-view turnaround requirement

Before an avatar is considered `ready`, require:

1. front
2. left side
3. right side
4. back

The four views should be generated or uploaded with:

- same identity
- same hair
- same facial proportions
- same body proportions
- same age appearance
- same skin tone
- same wardrobe
- same accessories
- same camera height
- comparable focal length
- consistent neutral lighting
- neutral pose
- plain background

## Female professional wardrobe rule

The default female spokesperson avatar must **not** use beachwear in campaign assets.

If an identity reference originates from a beach or swimwear photograph, treat it solely as an identity reference. The canonical campaign turnaround must use professional clothing such as:

- tailored blazer
- blouse / professional top
- trousers or suitable professional skirt
- neutral shoes
- restrained accessories

Do not copy swimwear into professional marketing assets.

## Identity fidelity

When generating a campaign with a selected avatar:

- always load the avatar's canonical identity references
- preserve facial geometry
- preserve hairline and hairstyle unless the user explicitly changes it
- preserve body proportions
- preserve skin tone
- preserve eye color
- preserve age appearance
- preserve wardrobe within the selected campaign unless intentionally changed
- do not randomly change jewelry
- do not change facial structure between campaigns

Persist all selected reference asset IDs into the campaign record so a later regeneration can be reproduced as closely as the provider permits.

---

# HUMAN PHOTOREALISM STANDARD

Every avatar or human-video prompt should include the relevant subset of the following constraints without exceeding provider prompt limits.

## Skin

Prioritize:

- visible natural pores
- subtle peach fuzz where optically visible
- microtexture
- natural skin oils
- realistic subsurface scattering
- slight non-uniform coloration
- natural cheek/nose redness
- realistic highlight rolloff
- fine lines appropriate to age
- plausible shadow softness

Suppress:

- plastic skin
- wax skin
- porcelain finish
- excessive smoothing
- synthetic glow
- over-sharpened pores
- airbrushed faces

## Eyes

Require:

- anatomically consistent eyes
- realistic sclera coloration
- detailed iris structure
- coherent pupil location
- correct gaze convergence
- moisture line
- corneal catchlights that match real light sources
- natural blink timing
- stable eyelashes and eyelids

Suppress:

- wandering pupils
- dead eyes
- frozen gaze
- mismatched catchlights
- pure-white sclera
- asymmetrical artificial eyes

## Mouth / speech

For dialogue:

- stable teeth
- stable lip geometry
- plausible phoneme alignment
- jaw motion
- cheek motion
- natural tongue visibility when appropriate
- subtle breathing pauses
- non-announcer cadence unless intentionally requested

## Hands

Require:

- five fingers
- correct finger lengths
- realistic joints
- plausible grip
- contact shadows
- no product intersection
- no duplicated fingers
- consistent hands through the complete temporal sequence

## Hair

Require:

- natural strand grouping
- plausible movement
- gravity
- airflow response
- flyaways
- realistic specular response
- consistent hairline

## Motion

Require:

- real body weight transfer
- inertia
- breathing
- subtle posture adjustments
- natural acceleration/deceleration
- human gesture timing

---

# CAMERA / LIGHTING STANDARD

Default UGC capture assumption:

- vertical 9:16
- modern smartphone camera
- realistic handheld stabilization
- slight reframing imperfections
- subtle focus adjustments
- plausible exposure adaptation
- realistic rolling-shutter characteristics only when movement warrants it
- plausible motion blur
- realistic depth of field

Lighting must be physically coherent.

If the dominant light source is camera-left:

- facial key light must reflect that
- catchlights must reflect that
- hair highlights must reflect that
- product reflections must reflect that
- shadows must fall consistently

Avoid decorative lens flares unless a real source can create them.

---

# PI CAMPAIGN CATEGORIES

The UI must provide dedicated category buttons/cards.

## Vehicle Accident

Creative themes:

- what to do after a collision
- documenting the scene
- photographs
- witness information
- police/reporting process
- medical follow-up
- insurance contact caution
- case evaluation CTA

Prefer aftermath and educational framing over sensational impact simulation.

## Rideshare / Uber / Lyft

Creative themes:

- injured passenger confusion
- preserving trip details
- app screenshots or trip metadata where legally appropriate
- multiple insurance layers
- what to document
- seeking evaluation

Do not imply affiliation with a rideshare company.

## Trucking / Commercial Vehicle

Creative themes:

- commercial-vehicle scale
- evidence preservation
- company records
- electronic/log data
- inspection issues
- immediate investigation

Avoid exaggerated catastrophic spectacle merely for attention.

## Slip & Fall

Creative themes:

- documenting the hazard
- incident reporting
- witness information
- preserving clothing / footwear
- identifying cameras
- treatment documentation

## UGC

Use the general UGC cinema system:

- hook
- context
- product/service introduction
- proof
- demonstration
- benefit
- CTA

The creative should feel like content first and advertisement second.

---

# SITE-INTELLIGENCE SYSTEM

Every campaign must allow a website field.

When supplied, the planner must crawl the website before final strategy generation unless the user explicitly disables site research.

## Site crawl goals

Extract:

- business name
- primary service
- target geography
- practice areas / product categories
- value proposition
- phone/contact CTA
- lead forms
- visible testimonials
- stated results or claims
- FAQ themes
- brand voice
- logo / brand colors where feasible
- landing-page structure
- trust signals
- disclaimers
- compliance language

## Crawl constraints

- respect robots rules where applicable
- do not crawl local/private network destinations
- block localhost
- block link-local destinations
- block private IP ranges
- enforce redirect limits
- enforce content-size limits
- enforce request timeout
- parse HTML safely
- avoid executing arbitrary page JavaScript on the server unless a dedicated isolated browser service is intentionally configured

Store a versioned `site_snapshot` so later campaign analysis can be traced to the source content used at that time.

---

# SEARCH / CURRENT-MATERIAL RESEARCH

The planner should have a search-provider abstraction.

Use current public information to find:

- relevant local or national news
- accident trends
- transportation developments
- safety campaigns
- public statistics
- competitor marketing angles
- publicly accessible ad-library observations when permitted
- emerging audience questions

Search results should produce structured records:

- title
- source
- date
- URL
- summary
- relevance score
- campaign category
- retrieved_at

Do not treat arbitrary search snippets as verified legal facts.

For high-value factual statements, favor primary / official sources.

---

# COMPETITOR RESEARCH

Competitor analysis should examine:

- headline patterns
- hooks
- CTA patterns
- landing-page structure
- geographic positioning
- content format
- spokesperson style
- creative frequency
- education vs hard-sell balance
- visible offers
- trust signals

The purpose is to identify market patterns and differentiation opportunities, not to clone proprietary creative.

Store competitor observations separately from generated campaign copy.

---

# PROMPT RAG LIBRARY

The application must maintain a reusable prompt library.

## Prompt record

Each prompt record should include:

- ID
- slug
- category
- subtype
- title
- prompt body
- negative constraints
- supported providers
- target platform
- target duration
- default tone
- tags
- status
- version
- parent_version_id
- created_by
- created_at
- updated_at

Never overwrite an existing version that has been used in a campaign. Create a new version instead.

## Prompt categories

At minimum:

- system realism
- avatar fidelity
- vehicle accident
- rideshare accident
- trucking accident
- slip and fall
- UGC testimonial
- UGC educational
- newsroom
- split screen
- CTA variants
- hook variants
- compliance modifiers
- platform optimization

## Retrieval

Prompt selection can use:

- campaign category
- website vertical
- audience
- platform
- tone
- historical performance
- avatar compatibility
- provider compatibility
- prompt embedding similarity

Use PostgreSQL + vector extension for embeddings where available.

---

# NVIDIA MONITOR AI

The Monitor AI is a separate orchestration/evaluation layer.

Its responsibilities are:

1. inspect campaign objective
2. inspect site snapshot
3. inspect retrieved research
4. inspect candidate prompt sets
5. inspect prior performance
6. choose / rank candidate prompt sets
7. record its choice
8. record its rationale in a concise machine-auditable format
9. remain dormant if no ad-performance integration is active
10. reactivate automatically when valid ad data is available

## Never let monitor AI silently rewrite history

When it chooses a new prompt:

- create a new selection record
- preserve previous choice
- preserve previous performance
- record evaluation timestamp
- record data window used

## Performance data

At minimum ingest:

- impressions
- reach
- spend
- CPM
- clicks
- CTR
- CPC
- landing-page views where available
- leads
- qualified leads where available
- cost per lead
- booked consultations where available
- retained cases where available
- estimated or actual revenue where appropriately provided
- ROAS / ROI when the business data supports it

## Dormant mode

If there is no active paid campaign data:

- monitoring configuration remains stored
- scheduled monitor job may check for newly connected accounts
- no optimization claims should be made
- status should display `Dormant — waiting for ad data`

---

# AD PLATFORM INTEGRATIONS

The system should support major advertising channels used by the marketing team.

At minimum provide connection / configuration surfaces for:

- Meta advertising
- Instagram business publishing through the appropriate Meta connection
- Google Ads
- YouTube / Google ecosystem where appropriate

Optional extensible connectors:

- LinkedIn
- X
- TikTok when a supported integration is configured

Do not scrape private ad-account dashboards.

Prefer official APIs or the configured connected-account layer.

---

# COMPOSIO INTEGRATION

Composio is the preferred connected-account orchestration layer where appropriate.

The application must model:

- app/tool catalog
- connected account
- user mapping
- connection status
- required scopes metadata
- last sync time
- connection errors
- publishing capability
- trigger capability

The UI should support:

- Connect
- Reconnect
- Test connection
- Disable
- Delete connection

Do not expose underlying credential material.

Use external connection pages / provider OAuth flows through the application, not chat-based credential exchange.

---

# BACKGROUND / NEWSROOM LIBRARY

Users need selectable visual environments.

Required initial modes:

1. Classic newsroom
2. Newsroom with large video wall
3. Split screen
4. Green-screen-equivalent newsroom background
5. Legal office
6. Courthouse exterior
7. Neutral professional studio

## Supporting footage

Allow up to three user-selected videos as supporting footage.

The user may choose:

- video A on newsroom TV
- video B on second TV
- video C as picture-in-picture
- one clip as the right side of a split screen
- one clip as full background behind the avatar

The app should expose layout controls rather than forcing users to describe compositor coordinates.

## Compositor

Use a server-side video compositor / FFmpeg worker for deterministic post-production.

Persist composition settings:

- layout type
- canvas size
- aspect ratio
- background asset
- foreground asset
- support-video asset IDs
- crop mode
- inset coordinates
- captions
- logo
- CTA
- disclaimer
- audio mix levels

---

# HEDRA AVATAR ANIMATION / LIP SYNC

Hedra is the intended avatar animation and lip-sync layer.

The flow should support:

1. choose canonical avatar image
2. choose or generate voice audio
3. submit animation/lip-sync job
4. poll operation
5. download or ingest completed media into application storage
6. attach resulting asset to campaign

The UI should expose:

- avatar
- voice
- dialogue
- tone
- speaking pace
- emotion intensity
- aspect ratio
- background preference

Preserve the canonical avatar identity throughout.

Do not generate a replacement identity when an avatar is selected.

---

# IMAGE GENERATION PROVIDERS

Maintain provider abstraction for:

- Gemini image generation
- Grok image generation
- A2E integration slot
- Hedra-supported image workflows where appropriate

Provider differences must be encapsulated behind a common internal interface.

Suggested interface:

```ts
interface ImageProvider {
  generate(request: ImageGenerationRequest): Promise<ImageGenerationJob>;
  getStatus(jobId: string): Promise<ImageGenerationStatus>;
  getResult(jobId: string): Promise<GeneratedAsset[]>;
}
```

Do not leak provider-specific response objects into React UI components.

---

# VIDEO PROVIDER INTERFACE

The Veo implementation should be behind a provider interface, even if Veo remains the primary production provider.

Suggested interface:

```ts
interface VideoProvider {
  createOneShot(request: OneShotVideoRequest): Promise<ProviderJob>;
  getStatus(providerJobId: string): Promise<ProviderJobStatus>;
  retrieveResult(providerJobId: string): Promise<GeneratedVideoAsset>;
}
```

The application service — not the UI — enforces:

- 8-second duration
- one video
- one operation
- supported aspect ratio
- reference image constraints
- provider prompt-length limits

---

# VOICE / TONE OPTIONS

User-facing tone choices should include at minimum:

- authoritative
- empathetic
- calm
- urgent
- educational
- conversational
- testimonial
- newsroom anchor
- reassuring
- direct-response

Optionally separate:

- tone
- pace
- emotion strength
- confidence
- formality

Do not overload a single free-text field when structured controls can improve repeatability.

---

# SCRIPT SYSTEM

If the user does not supply a script, generate one from:

- website context
- category
- platform
- audience
- tone
- campaign objective
- selected prompt strategy

Default short-form structure:

1. hook
2. immediate context
3. useful point
4. proof / explanation
5. CTA

For an 8-second one-shot, the dialogue must fit natural speaking speed. Do not produce a 25-second script for an 8-second clip.

Estimate spoken length before generation and shorten automatically.

---

# PI AD CLAIMS / COMPLIANCE HARDENING

The system must detect and flag risky language before paid-ad submission.

Flag or reject examples such as:

- guaranteed settlement
- guaranteed win
- guaranteed compensation
- certainty of legal outcome
- invented dollar recovery
- fabricated testimonial
- fabricated client story presented as real
- fabricated news event presented as real
- claims unsupported by the crawled site or explicitly approved data

Generated accident scenes should be treated as dramatization / generated creative, not authentic evidence.

Keep compliance rule sets versioned and auditable.

---

# CALENDAR

Implement a complete content calendar.

Every calendar item should contain:

- ID
- campaign ID
- asset ID
- network
- account
- scheduled timestamp
- timezone
- caption
- title
- CTA
- destination URL
- approval state
- auto-post enabled
- publishing state
- external post ID after publishing
- last error
- retry count
- created_by
- approved_by
- timestamps

## Calendar views

At minimum:

- month
- week
- agenda / list

## Calendar actions

- add
- duplicate
- edit
- delete
- schedule
- reschedule
- approve
- reject
- publish now
- toggle auto-post
- open campaign
- open asset preview

Use drag-and-drop only if it remains accessible and reliable on mobile.

---

# APPROVAL WORKFLOW

States:

- draft
- pending approval
- changes requested
- approved
- scheduled
- published
- failed
- archived

For every approval action record:

- actor
- timestamp
- previous state
- new state
- note

Do not auto-post an unapproved item unless the workspace explicitly enables a policy allowing that behavior.

---

# PUBLISHING WORKER

Auto-posting must run as a scheduled or queued worker process, not only while a browser tab is open.

Worker responsibilities:

1. fetch due items
2. confirm approval
3. confirm auto-post policy
4. confirm connected account
5. obtain temporary media access if necessary
6. publish
7. capture external post ID
8. update status
9. record sanitized error
10. retry with bounded exponential backoff when appropriate

Idempotency is mandatory. A retry must not create duplicate social posts.

---

# DIGITALOCEAN TARGET ARCHITECTURE

Production target:

- DigitalOcean App Platform for web/API
- DigitalOcean Managed PostgreSQL for relational data
- PostgreSQL vector extension where supported for prompt/avatar embeddings
- DigitalOcean Spaces for media assets
- scheduled App Platform jobs or worker components for publishing/monitoring

## Media storage

Do not depend on App Platform local filesystem for durable media.

Media flow:

provider result → server ingestion → object storage → database asset row → protected media route or time-limited access for publishing

Object storage should remain private by default.

## Deployment

The repository should include:

- Dockerfile
- `.do/app.yaml` or equivalent deployment manifest
- health endpoint
- migration procedure
- worker invocation procedure
- environment variable inventory
- bootstrap/admin procedure

---

# DATABASE MODEL

The final schema should cover at least:

- users
- organizations/workspaces if multi-user
- roles
- sessions
- provider credentials metadata
- external API tokens (hashed, not plaintext)
- avatars
- avatar reference assets
- backgrounds
- media assets
- websites
- site snapshots
- research sources
- competitors
- campaigns
- campaign creatives
- prompt library
- prompt versions
- prompt selections
- generation jobs
- animation jobs
- composition jobs
- approvals
- calendar posts
- integrations
- connected accounts
- ad accounts
- ad campaigns
- ad creatives
- ad metrics
- monitor runs
- optimization recommendations
- audit logs

Use foreign keys and indexes intentionally.

Use cascading deletes only when the downstream data truly has no historical value.

Historical campaign/performance records generally should be retained or soft-deleted.

---

# EXTERNAL VIDEO-ENGINE API

Other software needs to use VIDEO-Engine programmatically.

Provide stable versioned endpoints such as:

- `POST /api/v1/video`
- `GET /api/v1/video/:id`
- `GET /api/v1/video/:id/file`
- `POST /api/v1/avatars`
- `GET /api/v1/avatars`
- `POST /api/v1/campaigns`
- `GET /api/v1/campaigns/:id`

Use application-issued API credentials stored as hashes.

API responses must never include provider credentials.

Add:

- request validation
- rate limiting
- request IDs
- idempotency keys for create operations
- pagination
- structured errors
- audit logs

---

# UI / UX STANDARD

The repository is expected to use:

- TypeScript
- Tailwind CSS
- shadcn-compatible structure
- `/components/ui`

The application should feel like a polished marketing operations product rather than a raw developer console.

## Required major pages

- Dashboard
- Campaigns
- Campaign detail
- Generate
- Avatars
- Avatar detail / turnaround
- Background library
- Media library
- Prompt library
- Calendar
- Approvals
- Analytics / Monitor AI
- Integrations
- Settings
- Team / roles
- API access
- Audit log

## Interaction rule

For user-managed records, provide clear add/edit/delete/archive controls where appropriate.

Examples:

- avatars
- avatar images
- backgrounds
- media clips
- API provider configurations
- connected accounts
- prompt templates
- calendar posts

Destructive actions require confirmation.

## Mobile

The UI must remain usable on phones because the marketing team may review or approve creatives from mobile devices.

---

# SHADCN / COMPONENT INTEGRATION

Preserve `/components/ui` as the canonical reusable UI directory.

Integrate the provided UI concepts appropriately:

- expandable navigation tabs
- minimal sign-in experience
- animated AI input / campaign assistant input
- loaders for generation states
- AI reasoning/status displays where useful

Do not mechanically dump every supplied demo onto a page. Adapt components to the actual product workflow.

---

# DASHBOARD

Dashboard should answer, at a glance:

- what is generating?
- what needs approval?
- what is scheduled today?
- what recently published?
- what campaigns are spending money?
- what is CPL / ROI trend?
- what creative is winning?
- what integration is disconnected?
- what monitor recommendations are pending?

Use cards and charts only when they convey an actionable operational state.

---

# ANALYTICS

Analytics should support filters for:

- date range
- network
- campaign
- category
- avatar
- prompt set
- creative
- geography where available

Derived metrics must guard against division by zero and missing data.

For ROI:

- do not fabricate revenue
- if revenue / retained-case data is missing, show lead metrics rather than an invented ROI

---

# AUDIT LOG

Audit major actions:

- login
- role change
- provider configuration changed
- integration connected/disconnected
- avatar created/deleted
- prompt changed
- campaign created
- generation requested
- generation completed/failed
- approval action
- scheduled post change
- publish attempt/result
- monitor recommendation

Audit metadata must not contain secrets.

---

# ERROR HANDLING

Every provider adapter should normalize errors to a common shape:

```ts
interface ProviderError {
  provider: string;
  operation?: string;
  code: string;
  retryable: boolean;
  status?: number;
  message: string;
  requestId?: string;
}
```

Sanitize the `message` before persisting it.

UI error states should tell the operator what action is possible:

- Retry
- Reconnect provider
- Edit prompt
- Use alternate provider
- Contact administrator

Do not expose raw stack traces to normal users.

---

# JOB STATE MACHINE

Generation jobs should use explicit states:

- queued
- submitting
- provider_processing
- ingesting
- completed
- failed
- canceled

Animation jobs:

- queued
- uploading_inputs
- provider_processing
- ingesting
- completed
- failed

Composition jobs:

- queued
- rendering
- completed
- failed

Publishing jobs:

- queued
- publishing
- published
- retry_wait
- failed

Transitions must be validated server-side.

---

# IDEMPOTENCY

All side-effectful operations should support idempotency where possible.

Especially:

- video generation submission
- avatar generation
- publishing
- webhook ingestion
- metric import

Persist idempotency keys and results long enough to prevent accidental duplicate execution.

---

# WEBHOOKS

If providers offer webhooks, prefer them over aggressive polling while retaining polling fallback when needed.

Webhook endpoint requirements:

- verify provider authenticity using the provider-supported mechanism
- reject malformed payloads
- deduplicate events
- store event ID
- process asynchronously
- return quickly
- never log sensitive headers

---

# RATE LIMITING

Use separate limits for:

- authentication
- public API generation
- internal UI generation
- search/research
- publishing

Return a structured 429 error with retry timing metadata when feasible.

---

# TESTING STRATEGY

The build is not finished merely because pages render.

## Unit tests

At minimum:

- prompt compiler respects one-shot rules
- prompt compiler respects length budget
- PI prohibited-claim detector
- avatar readiness validation
- URL / SSRF validation
- secret redaction
- encryption/decryption service
- API-token hashing verification
- calendar due-item calculation
- publishing idempotency
- ROI/CPL calculations
- monitor dormant behavior

## Integration tests

Mock providers and test:

- create campaign
- generate one-shot request
- provider job polling
- ingest generated media
- Hedra animation flow
- compose video layout
- calendar creation
- approval transition
- scheduled publishing
- analytics ingestion
- monitor recommendation

## E2E tests

Use browser automation for critical flows:

### E2E 1 — Avatar

1. login
2. create avatar
3. add front/left/right/back
4. confirm status becomes ready
5. select avatar in campaign

### E2E 2 — Campaign

1. enter website
2. research site
3. choose vehicle accident
4. choose avatar
5. choose tone
6. choose newsroom background
7. generate plan
8. create one-shot generation job
9. preview completed media using mocked provider

### E2E 3 — Approval / publishing

1. send creative to approval
2. approve
3. schedule post
4. enable auto-post
5. run worker
6. confirm exactly one publish call
7. confirm published state

### E2E 4 — Monitor

1. import synthetic ad metrics fixture
2. run monitor
3. confirm prompt/creative ranking
4. confirm historical decision record remains immutable

---

# BUILD VALIDATION

Before calling the repository **Final**, run all available checks.

Required target sequence:

```text
install dependencies
format / lint
TypeScript typecheck
unit tests
integration tests
production build
container build
schema/migration validation
E2E tests with mocked external providers
```

Do not claim tests passed if they were not executed.

If a network/environment limitation prevents installation or provider tests, state the exact incomplete validation in `FINAL_VALIDATION.md` rather than pretending completion.

---

# FINAL VALIDATION FILE

Create `FINAL_VALIDATION.md` before final release.

It must contain:

- build date
- git revision if available
- Node version
- package manager version
- lint status
- typecheck status
- unit-test status
- integration-test status
- production-build status
- container-build status
- migration status
- E2E status
- external live-provider tests completed
- external live-provider tests not completed
- known limitations

Never include credentials, connection strings, authorization headers, or secret values.

---

# DEFINITION OF DONE

VIDEO-Engine can be called **Final** only when all of these are true:

- [ ] shadcn/Tailwind/TypeScript UI structure is working
- [ ] login and role model works
- [ ] credentials are stored without being exposed to browser responses
- [ ] avatar CRUD works
- [ ] four-view avatar validation works
- [ ] same-avatar campaign reuse works
- [ ] professional female-avatar wardrobe rule is enforced in canonical avatar generation
- [ ] background CRUD works
- [ ] media library works
- [ ] up to 3 supporting videos can be selected
- [ ] newsroom TV-wall layout works
- [ ] split-screen layout works
- [ ] chroma/background layout works
- [ ] site crawl works
- [ ] search/research layer works
- [ ] competitor research record works
- [ ] prompt library CRUD/versioning works
- [ ] prompt retrieval works
- [ ] NVIDIA prompt-ranking path works or is cleanly mockable when provider unavailable
- [ ] monitor dormant mode works
- [ ] Veo one-shot generation works or has a passing provider mock contract test
- [ ] one-shot duration/count invariants are enforced server-side
- [ ] Hedra animation/lip-sync path works or has a passing provider mock contract test
- [ ] composition worker works
- [ ] captions/CTA/logo/disclaimer composition works
- [ ] campaign approval workflow works
- [ ] calendar month/week/list flows work
- [ ] auto-post worker is idempotent
- [ ] Composio connection model works
- [ ] ad account model works
- [ ] Google/Meta metric ingestion contracts are implemented
- [ ] analytics filters work
- [ ] CPL/ROI calculations are mathematically safe
- [ ] prompt-performance memory works
- [ ] audit logs work
- [ ] API tokens are hashed at rest
- [ ] external API rate limiting works
- [ ] object-storage media lifecycle works
- [ ] DigitalOcean deployment manifest is valid
- [ ] migration strategy is documented and tested
- [ ] production build passes
- [ ] final validation report exists

If any required item is not complete, do not label that build Final.

---

# IMPLEMENTATION ORDER FOR MINIMAX

When resuming development, work in this order unless a blocking dependency forces a change:

## Phase 1 — Establish build health

1. inspect repository
2. install dependencies
3. resolve package-version incompatibilities
4. run typecheck
5. run build
6. fix all compiler errors
7. add baseline test runner

## Phase 2 — Persistence / services

1. finalize PostgreSQL schema
2. migrations
3. repository layer
4. encryption service
5. media storage adapter
6. audit service
7. job tables/state transitions

## Phase 3 — Provider contracts

1. Veo provider
2. image-provider abstraction
3. Hedra provider
4. NVIDIA monitor provider
5. Composio provider
6. search provider
7. Meta / Google reporting adapters

Use provider mocks before live testing.

## Phase 4 — Avatar fidelity

1. avatar CRUD
2. asset upload
3. four-view validation
4. turnaround generation flow
5. canonical-reference persistence
6. campaign reference assembly

## Phase 5 — Campaign intelligence

1. website intake
2. safe crawler
3. site snapshot
4. search
5. competitor research
6. prompt retrieval
7. strategy output
8. PI claim checks

## Phase 6 — Generation

1. compile short Veo prompt
2. enforce one-shot rules
3. submit
4. status polling/webhook
5. ingest result
6. preview

## Phase 7 — Animation / composition

1. Hedra job
2. animation result ingestion
3. background library
4. supporting video selection
5. deterministic FFmpeg composition
6. captions / CTA / disclaimer

## Phase 8 — Calendar / social

1. approval model
2. calendar views
3. Composio connections
4. scheduled worker
5. idempotent publisher
6. status/error UI

## Phase 9 — Ads / optimization

1. ad-account model
2. metrics import
3. performance mapping to creative
4. NVIDIA monitor evaluation
5. prompt-performance memory
6. recommendations UI

## Phase 10 — Production validation

1. complete test matrix
2. build Docker image
3. validate DigitalOcean app specification
4. run migrations in isolated database
5. verify media storage
6. execute E2E provider mocks
7. document live-provider tests separately
8. create final validation report
9. only then produce release artifact named `VIDEO-Engine-Final`

---

# MINIMAX RESPONSE STYLE WHILE WORKING ON THIS REPOSITORY

When interacting with the project owner:

- be concise about progress but detailed in code/files
- do not repeatedly ask technical questions that can be inferred from the specification
- do not ask the owner to perform development work that the agent can perform
- explain real blockers precisely
- never claim a push/deploy/build/test succeeded unless it actually succeeded
- never expose credentials
- never request credentials in chat
- keep a running implementation checklist inside the repository
- modify the project rather than merely suggesting code when filesystem/tool access is available

---

# FINAL PRINCIPLE

The goal is not to create the most complicated AI system.

The goal is to create a reliable marketing operating system where:

- identities stay consistent
- generated humans look real
- campaigns are easy to produce
- research improves relevance
- prompts become reusable institutional knowledge
- publishing is controlled and auditable
- ad performance feeds future creative decisions
- every system boundary remains explicit
- the core generation contract remains one believable shot

At every stage ask:

**Does this make VIDEO-Engine more reliable, repeatable, measurable, and easier for the marketing team to operate?**

If not, simplify or remove it.

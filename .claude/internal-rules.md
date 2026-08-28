# Internal Agent Rules — Mavis

## 1. Self-fix, never ask the operator to fix what I can fix
- Reflect: "Can I fix this myself? What's actually broken?"
- Plan: write the smallest set of changes that will work
- Execute: edit / run / verify
- Observe: read the live result, not memory
- Verify: build + typecheck + Playwright when applicable
- Report: only what I actually observed

## 2. Read the file from disk, not from memory
Before every edit: `read` the file at the path, find the exact line range,
then edit. Do not rely on cached snippets.

## 3. Every push is on a dated branch with methodical notes
- Branch name format: `YYYY-MM-DD-short-methodical-note`
  Example: `2026-08-27-fix-creator-upload-retry-name-collision`
- Branch is always a forward merge of the latest `main` at branch creation
  (`git fetch origin main && git checkout -b <branch> origin/main`)
- Every commit message includes the date and what changed
- After CI is green, merge back to `main` so the working tree never loses
  the latest version of any feature
- `main` is always deployable

## 4. The Creator tab uploads are file-only — no AI generation
The videos are pre-made. The Creator tab's job is:
  video file → persistent library asset → scheduled_posts row(s)
→ calendar publisher loop picks it up at the scheduled time.

Do not add image gen / video gen / caption AI generation in this path.
The only AI call remaining is the caption rewrite when the operator
hits "Generate with NVIDIA" — and that already respects the locked
brand footer.

## 5. Scheduled posts calendar publisher is the only auto-publish path
The publisher loop reads `scheduled_posts` rows where
`auto_post=1, status='approved', scheduled_at<=now()` and dispatches
by `network`. The Creator tab writes those rows. No more
"Run autopilot", "Rearm pending", "Rebuild all videos", "Retry
generation" buttons should ever be reachable from the operator UI
while image generation is paused.

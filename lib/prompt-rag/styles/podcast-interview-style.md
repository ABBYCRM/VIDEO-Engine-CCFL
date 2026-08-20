# Podcast Interview Style — VIRAL_VERTICAL_COMMENTARY_COLLAGE

Mobile-first 9:16 social commentary collage.

## Composition
- Upper contextual/video layer: target 33%, allowed 25–45%.
- Lower AI talking-head/podcast layer: target 67%, allowed 55–75%.
- User may upload the upper video. Relationship mode may be `related`, `unrelated`, `ironic`, or `mixed`.
- Never letterbox. Crop/reframe to fill the upper region while protecting faces and salient gestures.
- Large editorial hook text bridges the split boundary.

## Primary speaker
- Medium close-up or chest-up framing.
- Preserve microphone/boom arm/podcast environment.
- Natural asymmetry; no over-polished commercial staging.
- Realistic skin texture, eyes, mouth/teeth, hair, hands, gestures, clothing, lighting, optics and temporal consistency.

## Hook
- 3–8 words preferred, max 2 lines.
- Heavy display serif or bold high-contrast sans.
- White fill with thick dark outline/shadow.
- Approximately 29–40% from top of canvas, bridging both layers.

## Captions
- Separate from hook.
- Phrase-level chunks of 2–7 words.
- Mobile-safe positioning away from platform UI risk zones.

## Default intensity controls
HOOK_TEXT_INTENSITY=85
CAPTION_DENSITY=65
EDIT_FREQUENCY=55
PUNCH_IN_FREQUENCY=40
BROLL_FREQUENCY=75
MEME_INTENSITY=55
VISUAL_CONTEXT_RELEVANCE=90
SOCIAL_COMPRESSION=20
CAMERA_MOTION=20
MUSIC_INTENSITY=15
SFX_INTENSITY=10
SOURCE_AUTHENTICITY=90
CONTEXT_MODE=mixed

## One-shot rule
The bottom AI speaker is generated as one continuous 8-second provider operation. The uploaded top video and editorial layers are post-composited deterministically; they do not trigger hidden additional AI video generations.

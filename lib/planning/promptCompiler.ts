import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CampaignPlan, VideoRequest } from '@/lib/types';

const root = process.cwd();

function readPrompt(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

const categoryMap = {
  vehicle_accident: 'lib/prompt-rag/pi/vehicle-accident.md',
  rideshare_accident: 'lib/prompt-rag/pi/rideshare-accident.md',
  trucking_accident: 'lib/prompt-rag/pi/trucking-accident.md',
  slip_fall: 'lib/prompt-rag/pi/slip-fall.md',
  ugc: 'lib/prompt-rag/system/ugc-cinema-engine.md'
} as const;

export function compileCampaignPlan(input: VideoRequest): CampaignPlan {
  const base = readPrompt('lib/prompt-rag/system/ugc-cinema-engine.md');
  const category = readPrompt(categoryMap[input.category]);

  const objective = input.website
    ? `Market the law firm or business at ${input.website} with a one-shot campaign video.`
    : `Create a one-shot campaign video for the selected category.`;

  const strategy = [
    'Use a single canonical avatar identity across all campaigns.',
    'If no script is provided, generate a short direct-response hook + context + CTA.',
    'Prefer believable creator/newsroom footage over overproduced cinematic imagery.',
    'If a newsroom background is selected, allow supporting video on in-set displays.'
  ];

  const hooks = [
    'Attention-grabbing first sentence in 1-2 seconds.',
    'Plain-language explanation of what the viewer should do next.',
    'CTA tied to the firm website or consultation flow.'
  ];

  const competitorAngles = [
    'Emphasize clarity, responsiveness, and evidence preservation.',
    'Avoid generic legal platitudes in favor of concrete action steps.',
    'Use platform-native pacing and a credible spokesperson.'
  ];

  const outputPrompt = [
    'ONE CONTINUOUS SHOT ONLY.',
    `Category: ${input.category}.`,
    `Mission: ${input.mission}`,
    input.website ? `Website: ${input.website}` : null,
    input.targetAudience ? `Target audience: ${input.targetAudience}` : null,
    input.tone ? `Tone: ${input.tone}` : null,
    input.platform ? `Platform: ${input.platform}` : null,
    input.avatarId ? `Use canonical avatar: ${input.avatarId}.` : 'Use the selected default avatar.',
    input.backgroundId ? `Background: ${input.backgroundId}.` : null,
    input.script ? `Script: ${input.script}` : 'Generate a compact hook-context-CTA script.',
    input.dialogue ? `Dialogue emphasis: ${input.dialogue}` : null,
    input.siteContext ? `Site context: ${input.siteContext}` : null,
    '8 seconds only. One video only. Natural audio and direct-to-camera delivery unless the category suggests otherwise.',
    'Maintain photorealistic skin, eyes, hands, hair, lighting, physics, and temporal consistency.',
    'Preserve brand safety and PI legal constraints. No fabricated results or fake testimonials.',
    'Keep it believable enough that an ordinary viewer thinks it was truly filmed.',
    '',
    'SYSTEM LIBRARY:',
    base,
    '',
    'CATEGORY LIBRARY:',
    category
  ].filter(Boolean).join('\n');

  return { objective, strategy, hooks, competitorAngles, outputPrompt };
}

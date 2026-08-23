export type A2eModelFamily =
  | "video-twin"
  | "a2e-i2v"
  | "wan25"
  | "wan26-r2v"
  | "wan-spicy"
  | "wan30"
  | "happyhorse"
  | "veo"
  | "kling"
  | "kling-omni"
  | "grok"
  | "hailuo"
  | "minimax-h3"
  | "sora"
  | "seedance15"
  | "seedance2";

export type A2eVideoModel = {
  id: string;
  label: string;
  family: A2eModelFamily;
  durations: number[];
  supportsText: boolean;
  supportsImage: boolean;
  requiresImage?: boolean;
  requiresTwin?: boolean;
  requiresAudio?: boolean;
  description: string;
};

const range = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

/**
 * Canonical A2E model picker used by every Create surface.
 * Keep this list aligned with the documented A2E OpenAPI generation endpoints.
 */
export const A2E_VIDEO_MODELS: A2eVideoModel[] = [
  {
    id: "video-twin",
    label: "A2E · Video Twin (trained avatar)",
    family: "video-twin",
    durations: [15, 30],
    supportsText: false,
    supportsImage: false,
    requiresTwin: true,
    requiresAudio: true,
    description: "Reusable trained digital double. Uses the selected canonical avatar's A2E twin plus driving audio."
  },
  {
    id: "a2e-i2v",
    label: "A2E · Image-to-Video",
    family: "a2e-i2v",
    durations: [5, 10, 15, 20],
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "A2E native image-to-video model."
  },
  {
    id: "a2e-v2-i2v",
    label: "A2E · Image-to-Video V2",
    family: "a2e-i2v",
    durations: [5, 10, 15, 20],
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "A2E V2 image-to-video with native audio generation."
  },
  {
    id: "a2e-v2-flash-i2v",
    label: "A2E · Image-to-Video V2 Flash",
    family: "a2e-i2v",
    durations: [5, 10, 15, 20],
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "Fast A2E V2 image-to-video tier."
  },
  {
    id: "wan2.5-i2v-preview",
    label: "A2E · Wan 2.5 I2V Preview",
    family: "wan25",
    durations: [5, 10],
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "Wan 2.5 image-to-video preview."
  },
  {
    id: "wan2.6-i2v",
    label: "A2E · Wan 2.6 I2V",
    family: "wan25",
    durations: [5, 10, 15],
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "Wan 2.6 image-to-video."
  },
  {
    id: "wan2.6-i2v-flash",
    label: "A2E · Wan 2.6 I2V Flash",
    family: "wan25",
    durations: [5, 10, 15],
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "Fast Wan 2.6 image-to-video tier."
  },
  {
    id: "wan2.6-r2v",
    label: "A2E · Wan 2.6 R2V",
    family: "wan26-r2v",
    durations: [5, 10],
    supportsText: true,
    supportsImage: true,
    requiresImage: true,
    description: "Wan 2.6 reference-to-video."
  },
  {
    id: "wan2.6-r2v-flash",
    label: "A2E · Wan 2.6 R2V Flash",
    family: "wan26-r2v",
    durations: [5, 10],
    supportsText: true,
    supportsImage: true,
    requiresImage: true,
    description: "Fast Wan 2.6 reference-to-video."
  },
  {
    id: "wan2.7-i2v",
    label: "A2E · Wan 2.7",
    family: "wan25",
    durations: range(2, 15),
    supportsText: true,
    supportsImage: true,
    description: "Wan 2.7 supports text-to-video and reference/image workflows."
  },
  {
    id: "wan2.7-i2v-spicy",
    label: "A2E · Wan 2.7 I2V Spicy",
    family: "wan-spicy",
    durations: range(2, 15),
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "Wan 2.7 image-to-video variant with audio support."
  },
  {
    id: "wan2.2-i2v-spicy",
    label: "A2E · Wan 2.2 I2V Spicy",
    family: "wan-spicy",
    durations: [5, 8],
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "Wan 2.2 image-to-video variant."
  },
  {
    id: "wan3.0-video",
    label: "A2E · Wan 3.0",
    family: "wan30",
    durations: range(3, 30),
    supportsText: true,
    supportsImage: true,
    description: "Wan 3.0 all-in-one video generation."
  },
  {
    id: "wan3.0-video-prime",
    label: "A2E · Wan 3.0 Prime",
    family: "wan30",
    durations: range(3, 30),
    supportsText: true,
    supportsImage: true,
    description: "Same Wan 3.0 quality with faster inference."
  },
  {
    id: "happyhorse-1.0",
    label: "A2E · HappyHorse 1.0",
    family: "happyhorse",
    durations: [5, 10, 15],
    supportsText: true,
    supportsImage: true,
    description: "HappyHorse 1.0 text/image/reference video generation."
  },
  {
    id: "happyhorse-1.1",
    label: "A2E · HappyHorse 1.1",
    family: "happyhorse",
    durations: range(3, 15),
    supportsText: true,
    supportsImage: true,
    description: "HappyHorse 1.1 with 3–15 second output and expanded ratios."
  },
  {
    id: "veo3_fast",
    label: "A2E · Veo 3 Fast",
    family: "veo",
    durations: [8],
    supportsText: true,
    supportsImage: true,
    description: "A2E-routed Veo 3 fast tier."
  },
  {
    id: "veo3",
    label: "A2E · Veo 3",
    family: "veo",
    durations: [8],
    supportsText: true,
    supportsImage: true,
    description: "A2E-routed Veo 3 quality tier."
  },
  {
    id: "kling2.6",
    label: "A2E · Kling 2.6",
    family: "kling",
    durations: [5, 10],
    supportsText: true,
    supportsImage: true,
    description: "Kling 2.6 text/image video."
  },
  {
    id: "kling3",
    label: "A2E · Kling 3.0",
    family: "kling",
    durations: range(3, 15),
    supportsText: true,
    supportsImage: true,
    description: "Kling 3.0 standard."
  },
  {
    id: "kling3-fast",
    label: "A2E · Kling 3.0 Fast",
    family: "kling",
    durations: range(3, 15),
    supportsText: true,
    supportsImage: true,
    description: "Kling 3.0 fast tier."
  },
  {
    id: "kling-omni-std",
    label: "A2E · Kling Omni Standard",
    family: "kling-omni",
    durations: range(3, 15),
    supportsText: true,
    supportsImage: true,
    description: "Kling Omni standard 720p generation."
  },
  {
    id: "kling-omni-pro",
    label: "A2E · Kling Omni Pro",
    family: "kling-omni",
    durations: range(3, 15),
    supportsText: true,
    supportsImage: true,
    description: "Kling Omni professional 1080p generation."
  },
  {
    id: "grok-video-legacy",
    label: "A2E · Grok Imagine Video",
    family: "grok",
    durations: [6, 10, 15],
    supportsText: true,
    supportsImage: true,
    description: "A2E Grok Imagine legacy video route."
  },
  {
    id: "grok-video-1.5",
    label: "A2E · Grok Imagine Video 1.5",
    family: "grok",
    durations: [6, 10, 15],
    supportsText: false,
    supportsImage: true,
    requiresImage: true,
    description: "Grok Imagine Video 1.5 image-to-video."
  },
  {
    id: "hailuo-video",
    label: "A2E · Hailuo Video",
    family: "hailuo",
    durations: [6, 10],
    supportsText: true,
    supportsImage: true,
    requiresImage: true,
    description: "Hailuo generation requires at least one reference image."
  },
  {
    id: "minimax-h3",
    label: "A2E · MiniMax H3",
    family: "minimax-h3",
    durations: range(4, 15),
    supportsText: true,
    supportsImage: true,
    description: "MiniMax H3 text/image/reference video."
  },
  {
    id: "sora2",
    label: "A2E · Sora 2 Pro",
    family: "sora",
    durations: [5, 10, 15],
    supportsText: true,
    supportsImage: true,
    description: "A2E Sora 2 Pro route."
  },
  {
    id: "seedance1.5-pro",
    label: "A2E · Seedance 1.5 Pro",
    family: "seedance15",
    durations: [5, 10],
    supportsText: true,
    supportsImage: true,
    description: "Seedance 1.5 Pro text/image video."
  },
  {
    id: "seedance2-standard",
    label: "A2E · Seedance 2.0 Standard",
    family: "seedance2",
    durations: range(2, 15),
    supportsText: true,
    supportsImage: true,
    description: "Seedance 2.0 standard tier."
  },
  {
    id: "seedance2-mini",
    label: "A2E · Seedance 2.0 Mini",
    family: "seedance2",
    durations: range(2, 15),
    supportsText: true,
    supportsImage: true,
    description: "Seedance 2.0 mini tier."
  },
  {
    id: "seedance2-fast",
    label: "A2E · Seedance 2.0 Fast",
    family: "seedance2",
    durations: range(2, 15),
    supportsText: true,
    supportsImage: true,
    description: "Seedance 2.0 fast tier."
  },
  {
    id: "seedance2.5",
    label: "A2E · Seedance 2.5",
    family: "seedance2",
    durations: range(2, 30),
    supportsText: true,
    supportsImage: true,
    description: "Seedance 2.5 up to 30 seconds, 1080p, native audio."
  }
];

export const A2E_VIDEO_MODEL_IDS = A2E_VIDEO_MODELS.map((model) => model.id);

export function getA2eModel(id: string | undefined | null) {
  return A2E_VIDEO_MODELS.find((model) => model.id === id) || null;
}

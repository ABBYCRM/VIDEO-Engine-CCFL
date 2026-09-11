export type StealthMode = "off" | "coherence" | "lab";

export type ForgeStatus = "READY" | "RUNNING" | "HANDOFF" | "CLOSED";

export type ForgeHandoffReason =
  | "password"
  | "mfa"
  | "captcha"
  | "passkey"
  | "payment"
  | "consent"
  | "manual";

export type ForgeCreateInput = {
  width?: number;
  height?: number;
  stealth?: StealthMode;
  persist?: boolean;
  blockAds?: boolean;
};

export type ForgeEvent = {
  actor: "system" | "agent" | "human";
  eventType: string;
  note: string;
  at: string;
};

export type WebGlInfo = {
  vendor: string;
  renderer: string;
  unmaskedVendor: string | null;
  unmaskedRenderer: string | null;
  maxTextureSize: number | null;
  extensions: string[];
};

export type BrowserFingerprint = {
  userAgent: string;
  webdriver: boolean | undefined;
  platform: string;
  vendor: string;
  languages: string[];
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  maxTouchPoints: number;
  cookieEnabled: boolean;
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
  };
  window: {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
    devicePixelRatio: number;
  };
  capabilities: {
    webRTC: boolean;
    worker: boolean;
    serviceWorker: boolean;
    touchEvent: boolean;
  };
  fonts: {
    arial: boolean | null;
    times: boolean | null;
    courier: boolean | null;
  };
  webgl: WebGlInfo | null;
  canvasSha256: string | null;
  audio: { available: boolean; sampleRate?: number };
  timezone: string;
};

export type DetectorFinding = {
  signal: string;
  weight: number;
  explanation: string;
};

export type DetectorResult = {
  score: number;
  findings: DetectorFinding[];
  note: string;
};

export type ProbeResult = {
  ok: boolean;
  fingerprint: BrowserFingerprint | null;
  digest: string | null;
  detector: DetectorResult;
  error?: string;
};

export type ScrapeLink = { text: string; url: string };

export type ScrapeResult = {
  ok: boolean;
  via: "claw-forge";
  url: string;
  statusCode: number | null;
  title: string | null;
  markdown: string;
  truncated: boolean;
  links: ScrapeLink[];
  screenshotJpeg?: string | null;
  humanRequired?: boolean;
  handoffReason?: ForgeHandoffReason;
  error?: string;
};

export type PublicForgeSession = {
  id: string;
  status: ForgeStatus;
  createdAt: string;
  url: string;
  title: string;
  stealth: StealthMode;
  width: number;
  height: number;
  blockAds: boolean;
  persist: boolean;
  cdpHttp: string | null;
  cdpWs: string | null;
  cookieCount: number;
  screenshotJpeg: string | null;
  lastAction: string | null;
  handoffReason: ForgeHandoffReason | null;
  events: ForgeEvent[];
  probe: ProbeResult | null;
  scrape: ScrapeResult | null;
};

export type ForgeContract = {
  name: "Claw Forge";
  role: "Self-hosted managed Chromium control plane";
  does: string[];
  doesNot: string[];
  captcha: string;
  stealth: string;
};

export const FORGE_CONTRACT: ForgeContract = {
  name: "Claw Forge",
  role: "Self-hosted managed Chromium control plane",
  does: [
    "Provision real Chromium sessions with Playwright",
    "Persist cookies and localStorage on disk",
    "Expose loopback CDP for the same browser",
    "Scrape public pages to markdown",
    "Measure the live fingerprint and score defender-visible signals",
    "Strip leftover ChromeDriver cdc_ globals",
    "Optional lab profile pins CPU/RAM and copies them into Workers",
  ],
  doesNot: [
    "Farm CAPTCHAs or inject solver tokens",
    "Rotate residential proxies to evade blocks",
    "Claim an undetectable browser",
    "Rewrite navigator.webdriver",
    "Spoof canvas, audio, fonts, or WebRTC",
    "Click third-party puzzle tiles",
  ],
  captcha: "Third-party puzzles pause for a human on the same session. Steel Cloud remains an optional separate solver.",
  stealth:
    "Coherence removes ChromeDriver artifacts. Lab pins hardwareConcurrency=8 and deviceMemory=8 with Worker consistency. Neither is invisibility.",
};

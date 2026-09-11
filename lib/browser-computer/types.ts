export type ControlOwner = "AGENT" | "HUMAN" | "NONE";

export type SessionStatus =
  | "READY"
  | "AGENT_RUNNING"
  | "HANDOFF_REQUESTED"
  | "HUMAN_ACTIVE"
  | "COMPLETED";

export type HandoffReason =
  | "password"
  | "mfa"
  | "captcha"
  | "passkey"
  | "payment"
  | "consent"
  | "manual";

export type PolicyDecision = "ALLOW" | "DENY" | "HUMAN_REQUIRED";

export type ComputerActionType =
  | "screenshot"
  | "click"
  | "double_click"
  | "scroll"
  | "type"
  | "keypress"
  | "move"
  | "drag"
  | "wait"
  | "navigate"
  | "search"
  | "fill"
  | "upload"
  | "download"
  | "handoff"
  | "resume";

export type InteractiveNode = {
  tag: string;
  text: string;
  href?: string;
  type?: string;
  name?: string;
  placeholder?: string;
  autocomplete?: string;
  inputMode?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type PageSnapshot = {
  url: string;
  title: string;
  text: string;
  elements: InteractiveNode[];
  suspicious: HandoffReason[];
};

export type SessionArtifact = {
  name: string;
  kind: "download" | "upload";
  bytes: number;
};

export type ComputerAction = {
  type: ComputerActionType;
  x?: number;
  y?: number;
  button?: "left" | "right" | "middle";
  scroll_x?: number;
  scroll_y?: number;
  text?: string;
  keys?: string[];
  url?: string;
  path?: Array<{ x: number; y: number }>;
  reason?: HandoffReason;
  selector?: string;
  field?: string;
  filename?: string;
};

export type ActionResult = {
  ok: boolean;
  decision: PolicyDecision;
  error?: string;
  handoffReason?: HandoffReason;
  snapshot?: PageSnapshot;
  screenshotJpeg?: string;
  note?: string;
  artifacts?: SessionArtifact[];
};

export type PublicSession = {
  id: string;
  status: SessionStatus;
  controlOwner: ControlOwner;
  url: string;
  title: string;
  lastAction: string | null;
  pointer: { x: number; y: number } | null;
  handoffReason: HandoffReason | null;
  screenshotJpeg: string | null;
  snapshot: PageSnapshot | null;
  artifacts: SessionArtifact[];
  events: Array<{ actor: string; eventType: string; note: string; at: string }>;
  lastSearchQuery: string | null;
};

export type ChatTurn = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  running?: boolean;
};

import type { InteractiveNode, PageSnapshot } from "./types";

export type CredentialKind = "email" | "phone" | "password" | "otp" | "text";

export function classifyValue(raw: string): CredentialKind {
  const t = String(raw ?? "").trim();
  if (!t) return "text";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return "email";
  if (/^\d{4,8}$/.test(t)) return "otp";
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 15 && /^[+()\d\s.-]+$/.test(t)) return "phone";
  return "text";
}

export function isGoogleEmail(raw: string): boolean {
  return /@(gmail|googlemail)\.com$/i.test(String(raw ?? "").trim());
}

function blob(el: Pick<InteractiveNode, "text" | "name" | "placeholder" | "type"> & { autocomplete?: string }): string {
  return `${el.text || ""} ${el.name || ""} ${el.placeholder || ""} ${el.type || ""} ${el.autocomplete || ""}`.toLowerCase();
}

export function fieldLooksLikePhone(el: InteractiveNode & { autocomplete?: string }): boolean {
  const type = (el.type || "").toLowerCase();
  const b = blob(el);
  return type === "tel" || /\b(phone|mobile|cell)\b/.test(b);
}

export function fieldLooksLikeEmail(el: InteractiveNode & { autocomplete?: string }): boolean {
  const type = (el.type || "").toLowerCase();
  const b = blob(el);
  if (fieldLooksLikePhone(el)) return false;
  if (type === "password") return false;
  return type === "email" || /\b(email|e-mail|username|user name)\b/.test(b);
}

export function fieldLooksLikePassword(el: InteractiveNode): boolean {
  return (el.type || "").toLowerCase() === "password" || /\bpassword\b/i.test(blob(el));
}

export function fieldAccepts(el: InteractiveNode, kind: CredentialKind): boolean {
  if (kind === "email") return fieldLooksLikeEmail(el) || (!fieldLooksLikePhone(el) && !fieldLooksLikePassword(el) && (el.type === "text" || !el.type));
  if (kind === "phone") return fieldLooksLikePhone(el);
  if (kind === "password") return fieldLooksLikePassword(el);
  if (kind === "otp") return /\b(code|otp|verification)\b/i.test(blob(el));
  return !fieldLooksLikePhone(el);
}

export function findGoogleSso(elements: InteractiveNode[]): InteractiveNode | undefined {
  return elements.find((el) =>
    /continue with google|sign in with google|log in with google|sign in google/i.test(el.text),
  );
}

export function findEmailLoginSwitch(elements: InteractiveNode[]): InteractiveNode | undefined {
  return elements.find((el) =>
    /log in with email|sign in with email|use email|email \/ username|email or username|username \/ email/i.test(
      el.text,
    ),
  );
}

export function findPasswordLoginSwitch(elements: InteractiveNode[]): InteractiveNode | undefined {
  return elements.find((el) => /log in with password|use password|sign in with password/i.test(el.text));
}

export function loginHints(snap: Pick<PageSnapshot, "title" | "text" | "elements">, value?: string): string[] {
  const hints: string[] = [];
  const kind = value ? classifyValue(value) : "text";
  const google = findGoogleSso(snap.elements);
  const emailSwitch = findEmailLoginSwitch(snap.elements);
  const passwordSwitch = findPasswordLoginSwitch(snap.elements);
  const phoneOnScreen = snap.elements.some(fieldLooksLikePhone);
  const googleRejected = /couldn'?t sign you in|browser or app may not be secure|try using a different browser/i.test(
    `${snap.title}\n${snap.text}`,
  );

  if (googleRejected) {
    hints.push(
      "Google rejected this Chrome (browser not secure). Do not click Try again in a loop. Use the site's email/username + password instead, or hand off.",
    );
  }
  if (kind === "email" && value && isGoogleEmail(value) && google && !googleRejected) {
    hints.push(`Gmail address. Click "${google.text}" before filling any phone field.`);
  }
  if (kind === "email" && phoneOnScreen) {
    hints.push("Do not type an email into a Phone field.");
    if (emailSwitch) hints.push(`Click "${emailSwitch.text}" first, then fill the email field.`);
  }
  if (passwordSwitch) {
    hints.push(`Operator gave a password. Click "${passwordSwitch.text}" instead of SMS / 6-digit code.`);
  }
  return hints;
}

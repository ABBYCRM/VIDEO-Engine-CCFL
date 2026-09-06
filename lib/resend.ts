export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendResendEmail(input: { from?: unknown; to?: unknown; subject?: unknown; text?: unknown; html?: unknown }) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("Resend is not configured. Set RESEND_API_KEY on the server.");
  const from = String(input.from || "").trim();
  const to = String(input.to || "").trim();
  const subject = String(input.subject || "").trim();
  const text = typeof input.text === "string" ? input.text : undefined;
  const html = typeof input.html === "string" ? input.html : undefined;
  if (!from || !to || !subject || (!text && !html)) {
    throw new Error("from, to, subject, and text or html are required.");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
    cache: "no-store"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: String((data as { message?: string }).message || JSON.stringify(data)).slice(0, 300) };
  return { ok: true, via: "resend", data };
}

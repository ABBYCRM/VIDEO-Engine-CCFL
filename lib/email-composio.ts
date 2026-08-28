// Email sending via Composio's Resend toolkit. Tool slug verified against
// Composio's Resend toolkit documentation: RESEND_SEND_EMAIL, required
// params to/from/subject, at least one of html/text.

import { executeComposioTool, getActiveConnectedAccountId, isComposioConfigured } from "@/lib/composio/client";

const TOOLKIT = "resend";

export function isResendComposioConnected(): boolean {
  return isComposioConfigured() && Boolean(getActiveConnectedAccountId(TOOLKIT));
}

export async function composioSendEmail(input: { to: string; from: string; subject: string; text?: string; html?: string; replyTo?: string }) {
  if (!input.text && !input.html) throw new Error("At least one of text or html is required");
  const args: Record<string, unknown> = { to: input.to, from: input.from, subject: input.subject.slice(0, 200) };
  if (input.text) args.text = input.text;
  if (input.html) args.html = input.html;
  if (input.replyTo) args.reply_to = input.replyTo;
  return executeComposioTool(TOOLKIT, "RESEND_SEND_EMAIL", args);
}

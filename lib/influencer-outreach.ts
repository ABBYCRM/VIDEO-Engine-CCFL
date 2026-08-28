// Influencer Agent outreach orchestration. Drafting is always real
// (lib/nvidia/outreach-writer.ts). Sending is real for email (Composio
// Resend, verified action). Sending is NOT wired for cold Instagram DM:
// Instagram's Graph API messaging permissions only allow replying within an
// existing 24h conversation window (the same constraint this app's own
// sendDirectMessage already operates under for Calendar/Claw) — there is no
// API path to cold-message a stranger who has never messaged this business
// first. Rather than claim a send that Instagram's platform doesn't support,
// Instagram-channel outreach is draft-only unless the operator supplies a
// real IGSID from an already-open conversation.

import { writeOutreachMessage } from "@/lib/nvidia/outreach-writer";
import { composioSendEmail, isResendComposioConnected } from "@/lib/email-composio";
import { sendDirectMessage } from "@/lib/instagram-graph";
import { getInfluencer, recordOutreach, type Influencer } from "@/lib/influencers";

export type OutreachChannel = "email" | "instagram_dm";

export async function draftOutreachFor(influencer: Influencer, opts: { channel: OutreachChannel; brandContext?: string | null; proposal?: string | null }) {
  return writeOutreachMessage({
    handle: influencer.handle,
    platform: influencer.platform,
    niche: influencer.niche,
    channel: opts.channel,
    brandContext: opts.brandContext,
    proposal: opts.proposal
  });
}

export async function sendOutreach(input: {
  influencerId: string;
  channel: OutreachChannel;
  brandContext?: string | null;
  proposal?: string | null;
  emailFrom?: string;
  instagramIgsid?: string | null;
}) {
  const influencer = getInfluencer(input.influencerId);
  if (!influencer) throw new Error("Influencer not found");
  const draft = await draftOutreachFor(influencer, { channel: input.channel, brandContext: input.brandContext, proposal: input.proposal });

  if (input.channel === "email") {
    if (!influencer.contactEmail) throw new Error("This influencer has no contact email on file");
    if (!isResendComposioConnected()) throw new Error("Resend is not connected. Connect it in Integrations to send outreach emails.");
    if (!input.emailFrom) throw new Error("emailFrom is required (a verified Resend sender address)");
    const result = await composioSendEmail({ to: influencer.contactEmail, from: input.emailFrom, subject: draft.subject, text: draft.message });
    return { draft, sent: true, record: recordOutreach({ influencerId: influencer.id, channel: "email", message: draft.message, sentAt: new Date().toISOString(), response: result }) };
  }

  // instagram_dm
  if (!input.instagramIgsid) {
    return {
      draft,
      sent: false,
      note: "Instagram's Graph API can only message within an existing 24h conversation window — it cannot cold-message a stranger. This message was drafted, not sent. Send it manually, or pass instagramIgsid if this creator already has an open conversation with this account.",
      record: recordOutreach({ influencerId: influencer.id, channel: "instagram_dm", message: draft.message })
    };
  }
  const result = await sendDirectMessage(input.instagramIgsid, draft.message);
  return { draft, sent: true, record: recordOutreach({ influencerId: influencer.id, channel: "instagram_dm", message: draft.message, sentAt: new Date().toISOString(), response: result }) };
}

// Static catalog of the connected-app surfaces we expect to wire through
// Composio. This file is the single source of truth for the Integrations
// page; new connectors get added here once and appear automatically.

export const composioConnectors: string[] = [
  "Meta Ads",
  "Instagram",
  "Facebook Pages",
  "Google Ads",
  "YouTube",
  "Google Business Profile",
  "LinkedIn Pages",
  "X / Twitter",
  "TikTok Ads",
  "Slack",
  "Notion",
  "Discord",
  "HubSpot",
  "Mailchimp",
  "Resend",
  "S3 / Spaces"
];

// Surface for the live connection status. Currently the app does not
// maintain runtime OAuth state for Composio (it lives in the operator's
// connected-account dashboard); the page consumes `composioConnectors`
// and shows a static "configured via Composio dashboard" state.
export type ComposioConnectionStatus = {
  connector: string;
  configured: boolean;
  lastSyncAt: string | null;
  scopes: string[];
};

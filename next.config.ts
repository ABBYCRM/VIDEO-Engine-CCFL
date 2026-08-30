import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "80mb" }
  },
  // 2026-08-27 operator directive simplified the live UI down to Creator,
  // Calendar, Library, Claw, Settings. Avatars, Campaigns, Pipeline, Sites,
  // Integrations, Podcast-Interview, Components-Demo, and Docs are removed
  // from the live nav but their code is kept on disk; visiting one via a
  // deep link redirects back to Calendar with a banner. This surface
  // simplification is independent of IMAGE_GEN_ENABLED (re-enabled
  // 2026-08-28) — restoring image generation didn't restore these pages.
  //
  // 2026-08-28: Create ("/") joined this list too, for a different reason —
  // Claw's generate_video/generate_still/ugc_batch_generate tools already
  // call the same server functions Create's own POST route called, so the
  // page was a redundant front end rather than a distinct capability.
  // app/page.tsx and unified-create-console.tsx are left on disk, unlinked.
  //
  // 2026-08-28 (later): "/creator" joined too, by explicit operator request
  // (code-level only, for Claw to run). Claw's creator_upload_video tool
  // calls the same lib/creator-upload.ts function /api/creator/upload does
  // — that API route itself is untouched by this redirect (only the page
  // is), so Claw's tool keeps working. app/creator/page.tsx and
  // components/creator-console.tsx are left on disk, unlinked.
  async redirects() {
    // Each removed feature page redirects to Calendar with a banner that
    // matches the reason it was removed. Pages that were removed for
    // "feature is gone, not just disabled" (Creator, Avatars, Campaigns,
    // Pipeline, Sites, Integrations, Podcast-Interview, Components-Demo,
    // Docs) point to the same "That page has moved" banner calendar/page.tsx
    // already renders for the image_generation case — the query string is
    // overloaded to carry any reason. "/" was removed because Claw's chat
    // turn + the create/creator tools are the real entry point; it points
    // to Claw, not the misleading image-generation banner that was here
    // before this fix.
    const removed = "/calendar?feature_disabled=page_removed";
    return [
      { source: "/", destination: "/claw", permanent: false },
      { source: "/creator", destination: removed, permanent: false },
      { source: "/avatars", destination: removed, permanent: false },
      { source: "/campaigns", destination: removed, permanent: false },
      { source: "/pipeline", destination: removed, permanent: false },
      { source: "/sites", destination: removed, permanent: false },
      { source: "/integrations", destination: removed, permanent: false },
      { source: "/podcast-interview", destination: removed, permanent: false },
      { source: "/components-demo", destination: removed, permanent: false },
      { source: "/docs", destination: removed, permanent: false }
    ];
  }
};

export default nextConfig;

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
  async redirects() {
    const back = "/calendar?feature_disabled=image_generation";
    return [
      { source: "/", destination: back, permanent: false },
      { source: "/avatars", destination: back, permanent: false },
      { source: "/campaigns", destination: back, permanent: false },
      { source: "/pipeline", destination: back, permanent: false },
      { source: "/sites", destination: back, permanent: false },
      { source: "/integrations", destination: back, permanent: false },
      { source: "/podcast-interview", destination: back, permanent: false },
      { source: "/components-demo", destination: back, permanent: false },
      { source: "/docs", destination: back, permanent: false }
    ];
  }
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "80mb" }
  },
  // 2026-08-27 operator directive: image generation is disabled. Pages that
  // depend on it (Avatars, Campaigns, Pipeline, Sites, Integrations,
  // Podcast-Interview, Components-Demo, Docs) are removed from the live UI but
  // their code is kept on disk. Visiting them via a deep link now redirects
  // back to the Calendar with a banner explaining the change.
  async redirects() {
    const back = "/calendar?feature_disabled=image_generation";
    return [
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

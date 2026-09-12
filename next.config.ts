import type { NextConfig } from "next";

// Claw-only console. Root sends visitors to /claw; AuthGuard
// redirects unauthenticated browsers to /login.
const nextConfig: NextConfig = {
  output: "standalone",
  images: { formats: ["image/webp"] },
  serverExternalPackages: ["better-sqlite3", "sharp", "playwright", "playwright-core"],
  experimental: {
    serverActions: { bodySizeLimit: "80mb" }
  },
  async redirects() {
    return [
      { source: "/", destination: "/claw", permanent: false }
    ];
  }
};

export default nextConfig;

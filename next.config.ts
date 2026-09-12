import type { NextConfig } from "next";

// Root stays on Claw for the operator console. One-shot video lives at /create
// and POST /api/v1/video. Login is required for every control surface.
const nextConfig: NextConfig = {
  output: "standalone",
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

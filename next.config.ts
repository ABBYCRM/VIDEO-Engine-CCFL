import type { NextConfig } from "next";

// Claw-only console. Root redirects to /claw. No /login gate.
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

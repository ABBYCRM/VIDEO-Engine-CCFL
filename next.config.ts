import type { NextConfig } from "next";

// 2026-08-30 "Claw only" repo strip. Everything outside of
// /claw, /integrations, /login, /api/claw, /api/integrations,
// /api/health, and /api/ready has been deleted. The root path
// sends visitors straight to the Claw chat console (the only
// entry point that matters now), and the rest of the app-shell
// nav is the Claw page's own session/files sidebar.
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp"],
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" }
  }
};

export default nextConfig;

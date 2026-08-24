import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sharp"],
  experimental: {
    serverActions: { bodySizeLimit: "80mb" }
  }
};

export default nextConfig;

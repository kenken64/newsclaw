import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/newsclaw",
  devIndicators: false,
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // argon2 is a native Node addon; load it at runtime instead of bundling it.
  serverExternalPackages: ["argon2"],
};

export default nextConfig;
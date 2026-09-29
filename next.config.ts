import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: "standalone",
  // Native module — keep it as a runtime require so its prebuilt bindings are
  // copied into the standalone output instead of being bundled. All bundled
  // prebuilds are force-included so one image definition covers every arch.
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/better-sqlite3/prebuilds/**"],
  },
};

export default nextConfig;

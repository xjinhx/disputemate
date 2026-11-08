import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evidence uploads go through server actions. Vercel functions accept
  // request bodies up to 4.5 MB, so we cap uploads at 4 MB (see lib/evidence.ts).
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

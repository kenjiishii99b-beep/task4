import type { NextConfig } from "next";

// Azure Static Web Apps（Free）に置くため静的エクスポート固定。
// SSR / Server Actions / Route Handlers(API Routes) は使わず、データは Functions(FastAPI) から取得する。
const nextConfig: NextConfig = {
  output: "export",
  // /map → /map/index.html として出力し、SWA でそのまま配信できるようにする
  trailingSlash: true,
  images: { unoptimized: true },
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

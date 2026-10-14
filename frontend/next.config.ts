import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Azure Static Web Apps: the game runs entirely in the
  // browser, so the build is plain files in out/ with no server behind them.
  output: "export",
  // Each route exports as its own <route>/index.html, which a static host
  // serves at /<route> without a rewrite.
  trailingSlash: true,
};

export default nextConfig;

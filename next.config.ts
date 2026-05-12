import type { NextConfig } from "next";
import { siteConfig } from "./src/lib/site";

const siteHostname = new URL(siteConfig.domain).hostname;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: siteHostname,
        pathname: "/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;

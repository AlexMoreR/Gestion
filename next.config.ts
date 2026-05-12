import type { NextConfig } from "next";

const CANONICAL_SITE_URL = "https://magilus.com";
const siteHostname = new URL(process.env.NEXT_PUBLIC_SITE_URL || CANONICAL_SITE_URL).hostname;

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

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
  // Next sirve /public con "max-age=0"; las imagenes subidas tienen nombres
  // unicos (nunca cambian), asi que el navegador puede guardarlas un ano.
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;

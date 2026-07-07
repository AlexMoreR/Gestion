import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { Geist_Mono, Poppins } from "next/font/google";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import { getSiteUrl, siteConfig } from "@/lib/site";
import {
  getSystemBrandName,
  getSystemPrimaryColor,
  getSystemPrimaryStrongColor,
  getSystemStorefrontHeroDescription,
} from "@/lib/system-settings";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const [brandName, heroDescription] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontHeroDescription(),
  ]);
  const description = heroDescription;
  const title = `${brandName} | Mobiliario profesional para peluquería, barbería y salón de belleza`;
  const socialImageUrl = getSiteUrl("/opengraph-image");

  return {
    metadataBase: new URL(siteConfig.domain),
    title: {
      default: title,
      template: `%s | ${brandName}`,
    },
    description,
    keywords: [brandName.toLowerCase(), ...siteConfig.coreKeywords.filter((keyword) => keyword !== "magilus")],
    applicationName: brandName,
    category: "shopping",
    verification: {
      google: "2EMj69XiBfiLqnhIVRUaEhFbiNZ3t7V5piUczJabv3c",
    },
    icons: {
      icon: [
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon.ico", sizes: "96x96", type: "image/x-icon" },
      ],
      shortcut: [{ url: "/favicon.ico", sizes: "96x96", type: "image/x-icon" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      other: [
        {
          rel: "apple-touch-icon-precomposed",
          url: "/apple-icon-precomposed.png",
          sizes: "180x180",
        },
      ],
    },
    manifest: "/manifest.json",
    alternates: {
      canonical: getSiteUrl("/"),
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: siteConfig.locale,
      url: getSiteUrl("/"),
      siteName: brandName,
      title,
      description,
      images: [
        {
          url: socialImageUrl,
          alt: `${brandName} catálogo online`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImageUrl],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const [primaryColor, primaryStrongColor] = await Promise.all([
    getSystemPrimaryColor(),
    getSystemPrimaryStrongColor(),
  ]);

  return (
    <html lang="es-CO" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${poppins.variable} ${geistMono.variable} antialiased`}
        style={
          {
            "--primary": primaryColor,
            "--primary-strong": primaryStrongColor,
          } as CSSProperties
        }
      >
        {/* El tema (claro/oscuro) solo aplica dentro del sistema (workspace).
            El sitio publico siempre se ve en claro. */}
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}

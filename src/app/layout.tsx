import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist_Mono, Poppins } from "next/font/google";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { getSiteUrl, siteConfig } from "@/lib/site";
import { getSystemPrimaryColor, getSystemPrimaryStrongColor } from "@/lib/system-settings";
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

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.domain),
  title: {
    default: `${siteConfig.name} | Mobiliario profesional premium para salon y barberia`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.coreKeywords],
  applicationName: siteConfig.name,
  category: "shopping",
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
    siteName: siteConfig.name,
    title: `${siteConfig.name} | Sillas, estaciones y mobiliario profesional premium`,
    description: siteConfig.description,
    images: [
      {
        url: getSiteUrl(siteConfig.ogImagePath),
        alt: `${siteConfig.name} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} | Sillas, estaciones y mobiliario profesional premium`,
    description: siteConfig.description,
    images: [getSiteUrl(siteConfig.ogImagePath)],
  },
};

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
    <html lang="es-CO">
      <body
        className={`${poppins.variable} ${geistMono.variable} antialiased`}
        style={
          {
            "--primary": primaryColor,
            "--primary-strong": primaryStrongColor,
          } as CSSProperties
        }
      >
        <Providers session={session}>
          <AppShell initialUser={session?.user ?? null}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

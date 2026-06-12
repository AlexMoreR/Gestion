import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist_Mono, Poppins } from "next/font/google";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import { getPublicAssetUrl, getSiteUrl, siteConfig } from "@/lib/site";
import {
  getSystemBrandName,
  getSystemPrimaryColor,
  getSystemPrimaryStrongColor,
  getSystemStorefrontHeroDescription,
  getSystemStorefrontLogoPath,
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

export async function generateMetadata(): Promise<Metadata> {
  const [brandName, storefrontLogoPath, heroDescription] = await Promise.all([
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    getSystemStorefrontHeroDescription(),
  ]);
  const description = heroDescription;
  const socialImageUrl = getSiteUrl("/opengraph-image");

  return {
    metadataBase: new URL(siteConfig.domain),
    title: {
      default: `${brandName} | Mobiliario profesional para peluqueria, barberia y salon de belleza`,
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
        { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
        { url: getPublicAssetUrl(storefrontLogoPath) },
      ],
      shortcut: ["/favicon.ico"],
      apple: [getPublicAssetUrl(storefrontLogoPath)],
    },
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
      title: `${brandName} | Mobiliario profesional para peluqueria, barberia y salon de belleza`,
      description,
      images: [
        {
          url: socialImageUrl,
          alt: `${brandName} catalogo online`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${brandName} | Mobiliario profesional para peluqueria, barberia y salon de belleza`,
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
        <script
          // Aplica el tema guardado antes de pintar para evitar el parpadeo de color
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}

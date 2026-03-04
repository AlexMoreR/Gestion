import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Geist_Mono, Poppins } from "next/font/google";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
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
  title: "Administrador",
  description: "Auth con Next.js App Router, Prisma y Auth.js",
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
    <html lang="es">
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

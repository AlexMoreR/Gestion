import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

// Link corto de la orden de fabricacion (/of/OF-00035): lleva a la pagina
// publica /fabricacion/<token>. El codigo se puede adivinar; el dueno lo acepto.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function ShortManufacturingOrderPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = rawCode.replace(/\s+/g, "").toUpperCase();
  if (!code) notFound();

  const order = await prisma.manufacturingOrder.findUnique({
    where: { code },
    select: { shareToken: true },
  });
  if (!order) notFound();

  redirect(`/fabricacion/${order.shareToken}`);
}

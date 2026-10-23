import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { getNetmagiStats } from "@/lib/netmagi-stats.server";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";
import type { SaleProfit } from "@/modules/balances/domain/entities";
import { createPrismaBalancesRepository } from "@/modules/balances/infrastructure/prisma-balances-repository";
import { bogotaRange, type ChannelSale, marketplaceSales, resolveRangeDays } from "@/modules/marketplace/domain/marketplace-stats";
import { MarketplaceDashboard } from "@/modules/marketplace/presentation/marketplace-dashboard";

// Estadisticas de NETMAGI (CRM de Facebook Marketplace) sin entrar a la extension. Solo dueno/admin.
// NETMAGI manda solo agregados (ver src/lib/netmagi-stats.server.ts). La fila "Ventas del canal" sale de
// Gestion: ventas pagadas por completo (criterio de Balances) con origen MARKETPLACE (linea Ventas 2).

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function listRecognizedSales(period: { from: Date; to: Date }): Promise<SaleProfit[]> {
  const balances = createPrismaBalancesRepository();
  const rows: SaleProfit[] = [];
  for (let page = 1; ; page += 1) {
    const result = await balances.listProfitReport({ page, pageSize: 500, period });
    rows.push(...result.items);
    if (page >= result.pageCount) break;
  }
  return rows;
}

async function listChannelSales(period: { from: Date; to: Date }): Promise<ChannelSale[]> {
  const recognized = await listRecognizedSales(period);
  if (recognized.length === 0) return [];
  const origins = await prisma.sale.findMany({
    where: { id: { in: recognized.map((row) => row.saleId) } },
    select: { id: true, origin: true },
  });
  const originById = new Map(origins.map((row) => [row.id, row.origin]));
  return recognized.map((row) => ({
    recognizedAt: row.createdAt,
    amount: row.saleAmount,
    profit: row.netProfit,
    origin: originById.get(row.saleId) ?? null,
  }));
}

export default async function AdminMarketplacePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    redirect("/unauthorized");
  }
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "marketplace");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const days = resolveRangeDays(params.dias);
  const range = bogotaRange(days);

  // NETMAGI va primero y en serie (ver netmagi-stats.server.ts); las ventas de Gestion, en paralelo.
  const [stats, sales, currency] = await Promise.all([
    getNetmagiStats(range),
    listChannelSales({ from: range.from, to: range.to }).catch(() => null),
    getSystemCurrency(),
  ]);
  const channel = sales ? marketplaceSales(sales, range, stats.resumen?.totales.clientes_nuevos ?? 0) : null;

  return (
    <MarketplaceDashboard
      days={days}
      desde={range.desde}
      hasta={range.hasta}
      stats={stats}
      channel={channel}
      currency={currency}
    />
  );
}

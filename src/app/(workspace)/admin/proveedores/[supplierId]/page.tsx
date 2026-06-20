import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Factory, Truck } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ supplierId: string }>;
};

export default async function AdminSupplierBalancePage({ params }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" || !session.user.id) {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "suppliers");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const { supplierId } = await params;

  const [supplier, items, currency] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, type: true, email: true, phone: true },
    }),
    prisma.orderItem.findMany({
      where: { confirmedSupplierId: supplierId },
      orderBy: { confirmedAt: "desc" },
      select: {
        id: true,
        quantity: true,
        purchaseCost: true,
        supplierPaymentStatus: true,
        confirmedAt: true,
        createdAt: true,
        product: { select: { name: true } },
        order: { select: { id: true, code: true } },
        photos: { select: { id: true } },
      },
    }),
    getSystemCurrency(),
  ]);

  if (!supplier) {
    notFound();
  }

  const rows = items.map((item) => {
    const amount = Number(item.purchaseCost ?? 0) * item.quantity;
    const isPaid = item.supplierPaymentStatus === "PAID";
    // "Terminado" sigue la misma logica de la orden: recogido = tiene fotos y estado de pago definido.
    const isFinished = item.photos.length > 0 && item.supplierPaymentStatus !== null;
    return {
      id: item.id,
      orderId: item.order.id,
      orderCode: item.order.code,
      productName: item.product.name,
      quantity: item.quantity,
      amount,
      isPaid,
      isFinished,
      date: (item.confirmedAt ?? item.createdAt).toLocaleDateString("es-CO"),
    };
  });

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const pagados = rows.filter((row) => row.isPaid).reduce((sum, row) => sum + row.amount, 0);
  const terminados = rows.filter((row) => row.isFinished).reduce((sum, row) => sum + row.amount, 0);
  const enFabricacion = rows.filter((row) => !row.isFinished).reduce((sum, row) => sum + row.amount, 0);
  const saldoPendiente = total - pagados;

  const cards: { label: string; value: number; accent?: string; sub?: string }[] = [
    { label: "Total", value: total, sub: `${rows.length} productos` },
    { label: "En fabricacion", value: enFabricacion, accent: "text-amber-600" },
    { label: "Terminados", value: terminados, accent: "text-emerald-600" },
    { label: "Pagados", value: pagados, accent: "text-emerald-600" },
    { label: "Saldo pendiente", value: saldoPendiente, accent: "text-red-600" },
  ];

  return (
    <section className="w-full space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line)] bg-slate-50 text-slate-700">
          {supplier.type === "SHIPPING" ? <Truck className="h-4 w-4" /> : <Factory className="h-4 w-4" />}
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{supplier.name}</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} className="border-border bg-card/95 py-2">
            <CardContent className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
              <p className={`text-lg font-semibold ${card.accent ?? "text-foreground"}`}>
                {formatMoney(card.value, currency)}
              </p>
              {card.sub ? <p className="text-xs text-muted-foreground">{card.sub}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Fecha</TableHead>
              <TableHead>Cant</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pago</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-9 text-center text-muted-foreground">
                  Este proveedor no tiene productos asignados en ordenes.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs text-muted-foreground">{row.date}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.quantity}</TableCell>
                  <TableCell>
                    <Link href={`/admin/ordenes/${row.orderId}`} className="text-sm font-semibold text-foreground hover:underline">
                      {row.orderCode}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-foreground">{row.productName}</TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">{formatMoney(row.amount, currency)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.isFinished
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
                          : "border-amber-500/30 bg-amber-500/15 text-amber-600"
                      }
                    >
                      {row.isFinished ? "Terminado" : "En fabricacion"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.isPaid
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
                          : "border-border bg-muted text-muted-foreground"
                      }
                    >
                      {row.isPaid ? "Pagado" : "Pendiente"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

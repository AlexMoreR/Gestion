import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SupplierBalanceMonthSelect } from "@/components/admin/supplier-balance-month-select";
import { SupplierBalanceItems, type SupplierBalanceRow } from "@/components/admin/supplier-balance-items";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getPublicAssetUrl } from "@/lib/site";
import { getSystemCurrency } from "@/lib/system-settings";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelOf(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString("es-CO", {
    month: "long",
    year: "2-digit",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function SupplierBalancePublicPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;

  const supplier = await prisma.supplier.findUnique({
    where: { shareToken: token },
    select: { id: true, name: true, displayName: true, type: true },
  });

  if (!supplier) {
    notFound();
  }

  const [items, payments, charges, shippingCharges, currency] = await Promise.all([
    prisma.orderItem.findMany({
      where: { confirmedSupplierId: supplier.id },
      orderBy: { confirmedAt: "desc" },
      select: {
        id: true,
        quantity: true,
        purchaseCost: true,
        supplierPaymentStatus: true,
        supplierReceiptUrl: true,
        confirmedAt: true,
        createdAt: true,
        product: { select: { name: true, code: true, thumbnailUrl: true } },
        order: { select: { id: true, code: true } },
        photos: { select: { id: true } },
      },
    }),
    prisma.supplierLedgerEntry.findMany({
      where: { supplierId: supplier.id, type: "PAYMENT" },
      select: { orderItemId: true, orderId: true, dispatchId: true, settlesEntryId: true, amount: true, paymentDate: true, createdAt: true, receiptUrl: true },
    }),
    // Cargos que NO provienen de una orden: compras de inventario y cargos manuales.
    prisma.supplierLedgerEntry.findMany({
      where: { supplierId: supplier.id, type: "CHARGE", orderId: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        amount: true,
        note: true,
        receiptUrl: true,
        paymentDate: true,
        createdAt: true,
        inventoryMovement: {
          select: {
            change: true,
            product: { select: { name: true, code: true, thumbnailUrl: true } },
          },
        },
      },
    }),
    // Cargos de envio (atados a un despacho): se le pagan a la transportadora.
    // Se trae el detalle de productos del despacho para repartir el costo por item.
    prisma.supplierLedgerEntry.findMany({
      where: { supplierId: supplier.id, type: "CHARGE", dispatchId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        createdAt: true,
        orderId: true,
        dispatchId: true,
        order: { select: { code: true } },
        dispatch: {
          select: {
            code: true,
            items: {
              select: {
                id: true,
                quantity: true,
                shippingCost: true,
                orderItem: {
                  select: { product: { select: { name: true, code: true, thumbnailUrl: true } } },
                },
              },
            },
          },
        },
      },
    }),
    getSystemCurrency(),
  ]);

  const paidDateByItem = new Map<string, Date>();
  const paidDateByOrder = new Map<string, Date>();
  const receiptByItem = new Map<string, string>();
  const receiptByOrder = new Map<string, string>();
  for (const payment of payments) {
    const date = payment.paymentDate ?? payment.createdAt;
    if (payment.orderItemId) {
      const current = paidDateByItem.get(payment.orderItemId);
      if (!current || date > current) {
        paidDateByItem.set(payment.orderItemId, date);
        if (payment.receiptUrl) receiptByItem.set(payment.orderItemId, payment.receiptUrl);
      }
    }
    if (payment.orderId) {
      const current = paidDateByOrder.get(payment.orderId);
      if (!current || date > current) {
        paidDateByOrder.set(payment.orderId, date);
        if (payment.receiptUrl) receiptByOrder.set(payment.orderId, payment.receiptUrl);
      }
    }
  }

  const now = new Date();
  const currentMonthKey = monthKeyOf(now);
  const selectedMonth = typeof query.month === "string" && /^\d{4}-\d{2}$/.test(query.month)
    ? query.month
    : currentMonthKey;

  type BalanceRow = SupplierBalanceRow & { bucketMonth: string; sortDate: Date };

  // Abono "al pedido" (con orderId, sin item ni cargo puntual): paga a los
  // proveedores de esa orden. Se reparte entre los items de la orden que aun no
  // esten pagados, cubriendo cada uno si el abono alcanza. Asi un pago hecho como
  // abono al pedido tambien marca los items como pagados (no solo en la cuenta).
  const abonoByOrder = new Map<string, number>();
  for (const payment of payments) {
    if (payment.orderId && !payment.orderItemId && !payment.settlesEntryId) {
      abonoByOrder.set(payment.orderId, (abonoByOrder.get(payment.orderId) ?? 0) + Number(payment.amount));
    }
  }
  const paidByOrderAbono = new Set<string>();
  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.order.id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order.id, list);
  }
  for (const [orderId, orderItems] of itemsByOrder) {
    let remaining = abonoByOrder.get(orderId) ?? 0;
    if (remaining <= 0) continue;
    for (const item of orderItems) {
      if (item.supplierPaymentStatus === "PAID") continue;
      const itemAmount = Number(item.purchaseCost ?? 0) * item.quantity;
      if (itemAmount > 0 && remaining >= itemAmount - 0.5) {
        paidByOrderAbono.add(item.id);
        remaining -= itemAmount;
      }
    }
  }

  const orderRows: BalanceRow[] = items.map((item) => {
    const amount = Number(item.purchaseCost ?? 0) * item.quantity;
    const isPaid = item.supplierPaymentStatus === "PAID" || paidByOrderAbono.has(item.id);
    const isFinished = item.photos.length > 0 && item.supplierPaymentStatus !== null;
    const paidDate = isPaid
      ? paidDateByItem.get(item.id) ?? paidDateByOrder.get(item.order.id) ?? item.createdAt
      : null;
    // Pagado: queda fijo en el mes del pago. Pendiente: se arrastra al mes actual
    // (y sigue avanzando cada mes) hasta que se pague, sin importar su mes de origen.
    const bucketMonth = paidDate ? monthKeyOf(paidDate) : currentMonthKey;
    // El comprobante del item es la fuente principal (igual que la vista admin de la
    // orden); si no lo tiene, se recurre al pago a nivel item u orden del ledger.
    const receiptRaw = isPaid
      ? item.supplierReceiptUrl ?? receiptByItem.get(item.id) ?? receiptByOrder.get(item.order.id) ?? null
      : null;
    return {
      id: item.id,
      orderCode: item.order.code,
      productName: item.product.name,
      // Debajo del nombre: código + cantidad, ej. "SHV15 · x1".
      productCode: item.product.code ? `${item.product.code} · x${item.quantity}` : null,
      productImage: getPublicAssetUrl(item.product.thumbnailUrl),
      quantity: item.quantity,
      amount,
      isPaid,
      isFinished,
      bucketMonth,
      receiptUrl: receiptRaw ? getPublicAssetUrl(receiptRaw) : null,
      sortDate: paidDate ?? item.confirmedAt ?? item.createdAt,
      date: (paidDate ?? item.confirmedAt ?? item.createdAt).toLocaleDateString("es-CO"),
    };
  });

  // Abonos que saldan un cargo específico (inventario/manual): monto y fecha por cargo.
  const settledByCharge = new Map<string, number>();
  const settleDateByCharge = new Map<string, Date>();
  const settleReceiptByCharge = new Map<string, string>();
  for (const payment of payments) {
    if (!payment.settlesEntryId) continue;
    settledByCharge.set(payment.settlesEntryId, (settledByCharge.get(payment.settlesEntryId) ?? 0) + Number(payment.amount));
    const date = payment.paymentDate ?? payment.createdAt;
    const current = settleDateByCharge.get(payment.settlesEntryId);
    if (!current || date > current) {
      settleDateByCharge.set(payment.settlesEntryId, date);
      if (payment.receiptUrl) settleReceiptByCharge.set(payment.settlesEntryId, payment.receiptUrl);
    }
  }

  // Compras de inventario y cargos manuales: se muestran como filas.
  // Pendiente -> se arrastra al mes actual. Pagado (saldado con un abono al cargo)
  // -> queda fijo en el mes del pago, igual que las órdenes.
  const chargeRows: BalanceRow[] = charges.map((charge) => {
    const chargeDate = charge.paymentDate ?? charge.createdAt;
    const product = charge.inventoryMovement?.product ?? null;
    // "Inventario" ya aparece en la columna ORDEN; quitamos el prefijo redundante
    // "Compra inventario - " del nombre.
    const cleanNote = charge.note?.replace(/^Compra inventario\s*-\s*/i, "").trim() || null;
    const qty = charge.inventoryMovement ? Math.abs(charge.inventoryMovement.change) : 1;
    // Código persistido: INV-0000X (inventario) o MAN-0000X (manual). Respaldo por
    // si algún cargo antiguo aún no tiene código asignado.
    const isInventory = Boolean(charge.inventoryMovement) || /^Compra inventario/i.test(charge.note ?? "");
    const fallbackCode = isInventory ? "INVENTARIO" : "MANUAL";
    const amount = Number(charge.amount);
    const settled = settledByCharge.get(charge.id) ?? 0;
    const isPaid = settled >= amount - 0.0001;
    const settleDate = settleDateByCharge.get(charge.id) ?? null;
    const settleReceipt = settleReceiptByCharge.get(charge.id) ?? null;
    // Comprobante: si está pagado usa el del abono que lo saldó; si no, el del cargo.
    const rawReceipt = (isPaid ? settleReceipt : null) ?? charge.receiptUrl ?? null;
    return {
      id: charge.id,
      orderCode: charge.code ?? fallbackCode,
      productName: product?.name ?? cleanNote ?? "Cargo",
      // Debajo del nombre: código + cantidad, ej. "BMV15 · x1". Los cargos manuales
      // no tienen producto asociado, así que se muestran como "VARIOS · x1".
      productCode: product?.code ? `${product.code} · x${qty}` : `VARIOS · x${qty}`,
      productImage: product?.thumbnailUrl ? getPublicAssetUrl(product.thumbnailUrl) : null,
      quantity: qty,
      amount,
      isPaid,
      isFinished: true,
      // Pagado: mes del pago. Pendiente: se arrastra al mes actual (conserva su fecha
      // original). El saldo de los pendientes también se reduce con abonos generales.
      bucketMonth: isPaid && settleDate ? monthKeyOf(settleDate) : currentMonthKey,
      receiptUrl: rawReceipt ? getPublicAssetUrl(rawReceipt) : null,
      sortDate: isPaid && settleDate ? settleDate : chargeDate,
      date: (isPaid && settleDate ? settleDate : chargeDate).toLocaleDateString("es-CO"),
    };
  });

  // Abonos generales (sin orden ni cargo específico): reducen el saldo de los
  // cargos de inventario/manuales pendientes. Se excluyen los abonos que ya saldan
  // un cargo puntual (esos ya marcaron su cargo como pagado, evitando doble conteo).
  const totalAbonos = payments
    .filter((payment) => !payment.orderId && !payment.orderItemId && !payment.settlesEntryId)
    .reduce((sum, payment) => sum + Number(payment.amount), 0);

  // Cargos de envio (despacho) al proveedor. Pagado si lo cubren: el pago directo
  // del despacho (dispatchId), un abono que lo salde (settlesEntryId), o abonos
  // generales a la misma orden (sin item/despacho/cargo puntual).
  const shippingChargeRows: BalanceRow[] = shippingCharges.flatMap((charge): BalanceRow[] => {
    const amount = Number(charge.amount);
    const matched = payments.filter(
      (payment) =>
        payment.settlesEntryId === charge.id ||
        (payment.dispatchId != null && payment.dispatchId === charge.dispatchId) ||
        (charge.orderId != null &&
          payment.orderId === charge.orderId &&
          payment.orderItemId == null &&
          payment.dispatchId == null &&
          payment.settlesEntryId == null),
    );
    const settled = matched.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const isPaid = settled >= amount - 0.0001;
    const payDate = matched.reduce<Date | null>((latest, payment) => {
      const date = payment.paymentDate ?? payment.createdAt;
      return !latest || date > latest ? date : latest;
    }, null);
    const chargeDate = charge.paymentDate ?? charge.createdAt;
    const bucketMonth = isPaid && payDate ? monthKeyOf(payDate) : currentMonthKey;
    const sortDate = isPaid && payDate ? payDate : chargeDate;
    const dateStr = sortDate.toLocaleDateString("es-CO");
    // Comprobante del envio: el del pago mas reciente (entre los que lo saldaron)
    // que tenga adjunto. Solo se muestra si el cargo esta pagado.
    const receiptPayment = matched.reduce<{ date: Date; url: string } | null>((latest, payment) => {
      if (!payment.receiptUrl) return latest;
      const date = payment.paymentDate ?? payment.createdAt;
      return !latest || date > latest.date ? { date, url: payment.receiptUrl } : latest;
    }, null);
    const shippingReceipt = isPaid && receiptPayment ? getPublicAssetUrl(receiptPayment.url) : null;
    // Cada producto enviado va bajo la misma orden.
    const orderCode = charge.order?.code ?? charge.dispatch?.code ?? "Envío";

    const items = charge.dispatch?.items ?? [];
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    // Si ya se editó el reparto por producto, se usan esos valores; si no, se
    // reparte proporcional a la cantidad como punto de partida.
    const storedSum = items.reduce((sum, item) => sum + Number(item.shippingCost), 0);
    const useStored = storedSum > 0;

    // Sin items: una sola fila de envío.
    if (items.length === 0 || totalQty === 0) {
      return [
        {
          id: charge.id,
          orderCode,
          productName: "Envío",
          productCode: charge.dispatch?.code ?? null,
          productImage: null,
          quantity: 1,
          amount,
          isPaid,
          isFinished: true,
          bucketMonth,
          receiptUrl: shippingReceipt,
          sortDate,
          date: dateStr,
        },
      ];
    }

    // Reparte el costo del envío entre los productos (proporcional a la cantidad).
    // El residuo de redondeo se asigna al último para que la suma cuadre con el total.
    let assigned = 0;
    return items.map((item, index) => {
      const share = useStored
        ? Number(item.shippingCost)
        : index === items.length - 1
          ? amount - assigned
          : Math.round((amount * item.quantity) / totalQty);
      assigned += share;
      const product = item.orderItem.product;
      return {
        id: `${charge.id}-${item.id}`,
        orderCode,
        productName: product.name,
        productCode: product.code ? `${product.code} · x${item.quantity}` : `x${item.quantity}`,
        productImage: product.thumbnailUrl ? getPublicAssetUrl(product.thumbnailUrl) : null,
        quantity: item.quantity,
        amount: share,
        isPaid,
        isFinished: true,
        bucketMonth,
        receiptUrl: shippingReceipt,
        sortDate,
        date: dateStr,
      };
    });
  });

  const allRows = [...orderRows, ...chargeRows, ...shippingChargeRows];

  const monthSet = new Set<string>([currentMonthKey]);
  for (const row of allRows) monthSet.add(row.bucketMonth);
  if (!monthSet.has(selectedMonth)) monthSet.add(selectedMonth);
  const months = Array.from(monthSet)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({ value: key, label: monthLabelOf(key) }));

  const rows = allRows
    .filter((row) => row.bucketMonth === selectedMonth)
    .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
  // Los abonos generales se aplican solo en la vista del mes actual (donde viven
  // los cargos arrastrados).
  const abonosAplicados = selectedMonth === currentMonthKey ? totalAbonos : 0;

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  // Pagados = items de orden pagados + abonos generales (que saldan los cargos de inventario).
  const pagados =
    rows.filter((row) => row.isPaid).reduce((sum, row) => sum + row.amount, 0) + abonosAplicados;
  const terminados = rows.filter((row) => row.isFinished).reduce((sum, row) => sum + row.amount, 0);
  const saldoPendiente = total - pagados;

  const cards: { label: string; value: number; accent?: string; sub?: string }[] = [
    { label: "Total", value: total, sub: `${rows.length} productos` },
    { label: "Terminados", value: terminados, accent: "text-emerald-600" },
    { label: "Pagados", value: pagados, accent: "text-emerald-600" },
    { label: "Saldo pendiente", value: saldoPendiente, accent: "text-red-600" },
  ];

  const companyInfo = {
    name: "Magilus",
    nit: "100.61.80.650",
    cityOrigin: "Cali - Bogotá",
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6">
      <div className="flex flex-col gap-3 overflow-hidden rounded-xl border border-slate-200/60 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-3 sm:justify-start">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-black text-white sm:h-12 sm:w-12 sm:text-2xl">
              M
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{companyInfo.name}</p>
              <p className="text-xs text-slate-500">NIT {companyInfo.nit}</p>
            </div>
          </div>
          {/* En movil el selector de mes va junto al logo, con la ciudad debajo; en desktop se muestra en el bloque derecho. */}
          <div className="flex flex-col items-end gap-1 sm:hidden">
            <div className="w-32 shrink-0">
              <SupplierBalanceMonthSelect months={months} value={selectedMonth} />
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <Building2 className="h-4 w-4" /> {companyInfo.cityOrigin}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <div className="flex items-baseline gap-2 sm:justify-end">
            <p className="text-lg font-bold uppercase tracking-tight text-slate-900 sm:text-2xl">Balance</p>
            <h1 className="max-w-full break-words text-lg font-extrabold tracking-tight text-slate-400 sm:text-2xl">
              {supplier.displayName || supplier.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden items-center gap-1 text-xs font-medium text-slate-500 sm:inline-flex">
              <Building2 className="h-4 w-4" /> {companyInfo.cityOrigin}
            </span>
            <div className="hidden w-40 shrink-0 sm:block">
              <SupplierBalanceMonthSelect months={months} value={selectedMonth} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="border-border bg-card/95 py-2">
            <CardContent className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
              <p className={`text-base font-semibold sm:text-lg ${card.accent ?? "text-foreground"}`}>
                {formatMoney(card.value, currency)}
              </p>
              {card.sub ? <p className="text-xs text-muted-foreground">{card.sub}</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <SupplierBalanceItems
        rows={rows}
        currency={currency}
        emptyLabel={`Sin productos para ${monthLabelOf(selectedMonth)}.`}
        header={{
          fecha: "Fecha",
          orden: "Orden",
          producto: "Producto",
          precio: "Precio",
          estado: "Estado",
          pago: "Pago",
        }}
      />
    </main>
  );
}

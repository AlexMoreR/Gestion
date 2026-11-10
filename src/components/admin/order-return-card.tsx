import { AlertTriangle, CheckCircle2, FileText, MessageCircle, PackageX } from "lucide-react";
import { adminCloseOrderReturnAction, adminMarkReturnSellerNotifiedAction } from "@/app/actions/order-return-actions";
import {
  OrderReturnAnnulDialog,
  OrderReturnEditDialog,
  ReturnFormButton,
  type ReturnEditValues,
} from "@/components/admin/order-return-dialog";
import { Card, CardContent } from "@/components/ui/card";

export type OrderReturnView = {
  id: string;
  // Abierta = sin cerrar ni anular: la única con botones.
  open: boolean;
  // "Abierta", "Cerrada · fecha" o "Anulada: motivo".
  state: string;
  edit: ReturnEditValues;
  // Qué pasa al anular (despacho a En camino, productos a Entregado), o null si solo se anula.
  annulEffect: string | null;
  // "Persona · fecha" de quien avisó a la asesora, o null.
  sellerNotified: string | null;
  // Aviso pendiente a la asesora (abierta y sin avisar). whatsApp vacío = sin celular.
  seller: { name: string; whatsApp: string; message: string } | null;
  // Bitácora de esta devolución (más vieja primero).
  history: { id: string; text: string; by: string; date: string }[];
  date: string;
  dispatchCode: string | null;
  motive: string;
  products: string[];
  carrier: string | null;
  location: string;
  nextStep: string;
  comment: string | null;
  files: { id: string; url: string; name: string; pdf: boolean }[];
  // Pérdida logística informativa (perdidaDevolucion), ya formateada.
  lossIda: string;
  lossIdaNote: string | null;
  lossVuelta: string;
  lossTotal: string;
  by: string;
  createdAt: string;
};

// Devoluciones de la orden (más nueva primero). Las abiertas se editan, cierran o anulan; nada toca dinero ni inventario.
export function OrderReturnCard({ orderId, returns }: { orderId: string; returns: OrderReturnView[] }) {
  if (returns.length === 0) return null;
  return (
    <Card className="border-border bg-card/95">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <PackageX className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Devoluciones</h2>
        </div>
        <ul className="space-y-2">
          {returns.map((item) => (
            <li key={item.id} className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {item.date}
                  {item.dispatchCode ? ` · ${item.dispatchCode}` : " · Sin despacho"}
                </p>
                <span className="break-words text-xs text-muted-foreground">{item.state}</span>
              </div>
              <p className="break-words text-sm text-foreground">{item.motive}</p>
              <ul className="list-disc pl-4 text-sm text-foreground">
                {item.products.map((product) => (
                  <li key={product} className="break-words">{product}</li>
                ))}
              </ul>
              <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">Transportadora</dt>
                <dd className="break-words text-foreground">{item.carrier ?? "Sin dato"}</dd>
                <dt className="text-muted-foreground">Dónde está</dt>
                <dd className="text-foreground">{item.location}</dd>
                <dt className="text-muted-foreground">Qué sigue</dt>
                <dd className="text-foreground">{item.nextStep}</dd>
              </dl>
              {item.comment ? (
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.comment}</p>
              ) : null}
              {item.files.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {item.files.map((file) => (
                    <a
                      key={file.id}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-md border border-border hover:border-primary/40"
                      title={file.name}
                    >
                      {file.pdf ? (
                        <span className="flex h-16 w-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                          <FileText className="h-5 w-5" />
                          PDF
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={file.url} alt={file.name} className="h-16 w-16 object-cover" />
                      )}
                    </a>
                  ))}
                </div>
              ) : null}
              <div className="rounded-md bg-muted/50 p-2 text-xs">
                <p className="font-medium text-foreground">Pérdida logística (informativa)</p>
                <p className="text-muted-foreground">
                  Flete de ida: {item.lossIda}
                  {item.lossIdaNote ? ` (${item.lossIdaNote})` : ""} · Flete de vuelta: {item.lossVuelta} · Total: {item.lossTotal}
                </p>
                <p className="mt-1 text-muted-foreground">
                  El flete de vuelta no descuenta nada. Si se paga, se registra aparte.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {item.by} · {item.createdAt}
              </p>

              {item.seller ? (
                <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 dark:border-amber-700 dark:bg-amber-950/40">
                  <p className="flex items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Falta avisar a la asesora: {item.seller.name}
                      {item.seller.whatsApp ? "" : " (sin celular)"}
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {item.seller.whatsApp ? (
                      <a
                        href={`https://wa.me/${item.seller.whatsApp}?text=${encodeURIComponent(item.seller.message)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> Avisar a {item.seller.name} por WhatsApp
                      </a>
                    ) : null}
                    <form action={adminMarkReturnSellerNotifiedAction}>
                      <input type="hidden" name="orderId" value={orderId} />
                      <input type="hidden" name="returnId" value={item.id} />
                      <ReturnFormButton>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Ya avisé
                      </ReturnFormButton>
                    </form>
                  </div>
                </div>
              ) : null}
              {item.sellerNotified ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Asesora avisada: {item.sellerNotified}</p>
              ) : null}

              {item.open ? (
                <div className="flex flex-wrap gap-2">
                  <OrderReturnEditDialog orderId={orderId} returnId={item.id} values={item.edit} />
                  <form action={adminCloseOrderReturnAction}>
                    <input type="hidden" name="orderId" value={orderId} />
                    <input type="hidden" name="returnId" value={item.id} />
                    <ReturnFormButton confirmText="¿Cerrar esta devolución? Ya no se podrá editar ni anular.">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Cerrar devolución
                    </ReturnFormButton>
                  </form>
                  <OrderReturnAnnulDialog orderId={orderId} returnId={item.id} effect={item.annulEffect} />
                </div>
              ) : null}

              {item.history.length > 0 ? (
                <div className="space-y-0.5 border-t border-border pt-1.5">
                  <p className="text-xs font-medium text-foreground">Historial</p>
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {item.history.map((entry) => (
                      <li key={entry.id} className="break-words">
                        {entry.date} · {entry.by}: {entry.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

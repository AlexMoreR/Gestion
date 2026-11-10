import { FileText, PackageX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type OrderReturnView = {
  id: string;
  // "Abierta", "Cerrada" o "Anulada".
  state: string;
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

// Devoluciones de la orden (más nueva primero). Solo lectura: no toca dinero, inventario ni estados.
export function OrderReturnCard({ returns }: { returns: OrderReturnView[] }) {
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
                <span className="text-xs text-muted-foreground">{item.state}</span>
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
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

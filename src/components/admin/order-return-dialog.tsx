"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Loader2, PackageX } from "lucide-react";
import { adminRegisterOrderReturnAction } from "@/app/actions/order-return-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import {
  efectoDeRegistrar,
  RETURN_COMMENT_MAX,
  RETURN_LOCATIONS,
  RETURN_NEXT_STEPS,
  RETURN_OTHER_MAX,
  RETURN_QTY_PREFIX,
  RETURN_REASONS,
  type DispatchStatusKey,
  type ReturnLine,
} from "@/lib/order-return";

const FIELD_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const LABEL_CLASS = "text-xs uppercase tracking-[0.2em] text-muted-foreground";
const MAX_FILES = 6;
const MAX_FILE_BYTES = 12 * 1024 * 1024;
// El servidor acepta 16 MB por envío en total: se deja margen para el resto del formulario.
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export type ReturnDispatchOption = {
  // id del despacho o "SIN_DESPACHO".
  id: string;
  label: string;
  status: DispatchStatusKey | null;
  carrierSupplierId: string | null;
  carrierName: string | null;
  salieron: ReturnLine[];
  devueltasAntes: ReturnLine[];
  // Productos que aún se pueden devolver, con su máximo.
  lines: { orderItemId: string; name: string; max: number }[];
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Guardando..." : "Guardar devolución"}
    </Button>
  );
}

// «Registrar devolución» del detalle de la orden. Solo registra: no toca dinero ni inventario.
export function OrderReturnDialog({
  orderId,
  options,
  carriers,
  today,
}: {
  orderId: string;
  options: ReturnDispatchOption[];
  carriers: { id: string; name: string }[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [dispatchId, setDispatchId] = useState(options.length === 1 ? options[0].id : "");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [carrierId, setCarrierId] = useState(options.length === 1 ? options[0].carrierSupplierId ?? "" : "");
  const [freight, setFreight] = useState("");
  const [fileError, setFileError] = useState("");

  const option = options.find((o) => o.id === dispatchId) ?? null;
  const nuevas = useMemo(
    () =>
      (option?.lines ?? [])
        .map((line) => ({ orderItemId: line.orderItemId, quantity: Number(qty[line.orderItemId] || 0) }))
        .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0),
    [option, qty],
  );
  const efecto = option
    ? efectoDeRegistrar({ dispatchStatus: option.status, salieron: option.salieron, devueltasAntes: option.devueltasAntes, nuevas })
    : null;

  const chooseDispatch = (id: string) => {
    setDispatchId(id);
    setQty({});
    setCarrierId(options.find((o) => o.id === id)?.carrierSupplierId ?? "");
  };
  const returnAll = () => {
    if (!option) return;
    setQty(Object.fromEntries(option.lines.map((line) => [line.orderItemId, String(line.max)])));
  };
  const checkFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > MAX_FILES) setFileError(`Máximo ${MAX_FILES} archivos.`);
    else if (files.some((file) => file.size > MAX_FILE_BYTES)) setFileError("Cada archivo debe pesar menos de 12 MB.");
    else if (total > MAX_TOTAL_BYTES) setFileError("Entre todos pasan de 15 MB: quita alguno o usa fotos más livianas.");
    else setFileError("");
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PackageX className="h-3.5 w-3.5" />
        Registrar devolución
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar devolución</DialogTitle>
            <DialogDescription>
              Qué volvió, por qué, dónde está y qué sigue. No cambia ventas, Balances, comisiones ni inventario.
            </DialogDescription>
          </DialogHeader>
          <form action={adminRegisterOrderReturnAction} className="space-y-3">
            <input type="hidden" name="orderId" value={orderId} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor="returnDispatchId">Despacho</label>
                <select
                  id="returnDispatchId"
                  name="returnDispatchId"
                  required
                  value={dispatchId}
                  onChange={(event) => chooseDispatch(event.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value="" disabled>Seleccionar</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor="returnDate">Fecha</label>
                <Input id="returnDate" name="returnDate" type="date" required max={today} defaultValue={today} className="h-8 text-sm" />
              </div>
            </div>

            {option ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={LABEL_CLASS}>Productos devueltos</span>
                  <button type="button" onClick={returnAll} className="text-xs font-medium text-primary hover:underline">
                    Volvió todo
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {option.lines.map((line) => (
                    <li key={line.orderItemId} className="flex items-center justify-between gap-3 rounded-lg border border-border px-2.5 py-1.5">
                      <span className="min-w-0 break-words text-sm text-foreground">{line.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={line.max}
                          step={1}
                          name={`${RETURN_QTY_PREFIX}${line.orderItemId}`}
                          value={qty[line.orderItemId] ?? ""}
                          onChange={(event) => setQty((prev) => ({ ...prev, [line.orderItemId]: event.target.value }))}
                          placeholder="0"
                          aria-label={`Unidades devueltas de ${line.name}`}
                          className="h-8 w-16 text-sm"
                        />
                        de {line.max}
                      </span>
                    </li>
                  ))}
                </ul>
                {efecto && !efecto.ok && nuevas.length > 0 ? (
                  <p className="text-xs text-rose-600">{efecto.error}</p>
                ) : null}
                {efecto?.ok && efecto.efecto.tipo === "PASAR_A_DEVUELTO" ? (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Volvió todo: el despacho pasa a Devuelto y la guía también. La orden no cambia.
                  </p>
                ) : null}
                {efecto?.ok && efecto.efecto.tipo === "MARCAR_NO_ENTREGADAS" ? (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Ya estaba entregado: los productos que volvieron completos quedan como no entregados. El dinero no cambia.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Elige el despacho para ver sus productos.</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor="returnReason">Motivo</label>
                <select id="returnReason" name="returnReason" required value={reason} onChange={(event) => setReason(event.target.value)} className={FIELD_CLASS}>
                  <option value="" disabled>Seleccionar</option>
                  {RETURN_REASONS.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
              {reason === "OTRO" ? (
                <div className="space-y-1">
                  <label className={LABEL_CLASS} htmlFor="returnReasonText">¿Cuál?</label>
                  <Input id="returnReasonText" name="returnReasonText" required minLength={3} maxLength={RETURN_OTHER_MAX} className="h-8 text-sm" />
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor="returnLocation">Dónde está</label>
                <select id="returnLocation" name="returnLocation" required defaultValue="" className={FIELD_CLASS}>
                  <option value="" disabled>Seleccionar</option>
                  {RETURN_LOCATIONS.map((l) => (
                    <option key={l.key} value={l.key}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor="returnNextStep">Qué sigue</label>
                <select id="returnNextStep" name="returnNextStep" required defaultValue="POR_DEFINIR" className={FIELD_CLASS}>
                  {RETURN_NEXT_STEPS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor="returnCarrierSupplierId">Transportadora</label>
                <select
                  id="returnCarrierSupplierId"
                  name="returnCarrierSupplierId"
                  value={carrierId}
                  onChange={(event) => setCarrierId(event.target.value)}
                  className={FIELD_CLASS}
                >
                  <option value="">Sin elegir</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor="returnCarrierName">Otra / guía (opcional)</label>
                <Input id="returnCarrierName" name="returnCarrierName" maxLength={120} placeholder="Ej. guía de vuelta" className="h-8 text-sm" />
              </div>
            </div>

            <div className="space-y-1">
              <label className={LABEL_CLASS}>Flete de vuelta (informativo)</label>
              <MoneyInput name="returnFreight" value={freight} onValueChange={setFreight} />
              <p className="text-xs text-muted-foreground">No descuenta nada. Si se paga, regístralo aparte.</p>
            </div>

            <div className="space-y-1">
              <label className={LABEL_CLASS} htmlFor="returnComment">Comentario</label>
              <Textarea id="returnComment" name="returnComment" maxLength={RETURN_COMMENT_MAX} rows={2} />
            </div>

            <div className="space-y-1">
              <label className={LABEL_CLASS} htmlFor="returnFiles">Fotos o PDF (opcional)</label>
              <Input
                id="returnFiles"
                name="returnFiles"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => checkFiles(event.target.files)}
                className="text-sm"
              />
              <p className={fileError ? "text-xs text-rose-600" : "text-xs text-muted-foreground"}>
                {fileError || `JPG, PNG, WEBP o PDF. Hasta ${MAX_FILES} archivos de 12 MB.`}
              </p>
            </div>

            <SubmitButton disabled={!option || nuevas.length === 0 || !efecto?.ok || Boolean(fileError)} />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Ban, Loader2, PackageX, Pencil } from "lucide-react";
import {
  adminAnnulOrderReturnAction,
  adminEditOrderReturnAction,
  adminRegisterOrderReturnAction,
} from "@/app/actions/order-return-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Textarea } from "@/components/ui/textarea";
import {
  ANNUL_REASON_MAX,
  ANNUL_REASON_MIN,
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

function SubmitButton({
  disabled,
  label = "Guardar devolución",
  variant = "default",
}: {
  disabled: boolean;
  label?: string;
  variant?: "default" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className="w-full" disabled={pending || disabled}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {pending ? "Guardando..." : label}
    </Button>
  );
}

function checkFileList(list: FileList | null): string {
  const files = Array.from(list ?? []);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (files.length > MAX_FILES) return `Máximo ${MAX_FILES} archivos.`;
  if (files.some((file) => file.size > MAX_FILE_BYTES)) return "Cada archivo debe pesar menos de 12 MB.";
  if (total > MAX_TOTAL_BYTES) return "Entre todos pasan de 15 MB: quita alguno o usa fotos más livianas.";
  return "";
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
  const checkFiles = (list: FileList | null) => setFileError(checkFileList(list));

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

// Botón de los formularios de un clic de la tarjeta («Cerrar devolución», «Ya avisé»): se apaga mientras guarda
// y, con `confirmText`, pide confirmación antes de enviar.
export function ReturnFormButton({ children, confirmText }: { children: ReactNode; confirmText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {pending ? "Guardando..." : children}
    </Button>
  );
}

export type ReturnEditValues = {
  reason: string;
  reasonText: string;
  location: string;
  nextStep: string;
  comment: string;
  freight: string;
};

// «Editar» de una devolución abierta: motivo, dónde está, qué sigue, comentario, flete y agregar evidencias.
export function OrderReturnEditDialog({ orderId, returnId, values }: { orderId: string; returnId: string; values: ReturnEditValues }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(values.reason);
  const [freight, setFreight] = useState(values.freight);
  const [fileError, setFileError] = useState("");
  const id = (name: string) => `${name}-${returnId}`;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Editar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar devolución</DialogTitle>
            <DialogDescription>
              La fecha, los productos y el despacho no se editan: para eso se anula y se registra de nuevo.
            </DialogDescription>
          </DialogHeader>
          <form action={adminEditOrderReturnAction} className="space-y-3">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="returnId" value={returnId} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor={id("returnLocation")}>Dónde está</label>
                <select id={id("returnLocation")} name="returnLocation" required defaultValue={values.location} className={FIELD_CLASS}>
                  {RETURN_LOCATIONS.map((l) => (
                    <option key={l.key} value={l.key}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor={id("returnNextStep")}>Qué sigue</label>
                <select id={id("returnNextStep")} name="returnNextStep" required defaultValue={values.nextStep} className={FIELD_CLASS}>
                  {RETURN_NEXT_STEPS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={LABEL_CLASS} htmlFor={id("returnReason")}>Motivo</label>
                <select
                  id={id("returnReason")}
                  name="returnReason"
                  required
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={FIELD_CLASS}
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>
              {reason === "OTRO" ? (
                <div className="space-y-1">
                  <label className={LABEL_CLASS} htmlFor={id("returnReasonText")}>¿Cuál?</label>
                  <Input
                    id={id("returnReasonText")}
                    name="returnReasonText"
                    required
                    minLength={3}
                    maxLength={RETURN_OTHER_MAX}
                    defaultValue={values.reasonText}
                    className="h-8 text-sm"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className={LABEL_CLASS}>Flete de vuelta (informativo)</label>
              <MoneyInput name="returnFreight" value={freight} onValueChange={setFreight} />
              <p className="text-xs text-muted-foreground">No descuenta nada. Si se paga, regístralo aparte.</p>
            </div>

            <div className="space-y-1">
              <label className={LABEL_CLASS} htmlFor={id("returnComment")}>Comentario</label>
              <Textarea id={id("returnComment")} name="returnComment" maxLength={RETURN_COMMENT_MAX} rows={2} defaultValue={values.comment} />
            </div>

            <div className="space-y-1">
              <label className={LABEL_CLASS} htmlFor={id("returnFiles")}>Agregar fotos o PDF</label>
              <Input
                id={id("returnFiles")}
                name="returnFiles"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => setFileError(checkFileList(event.target.files))}
                className="text-sm"
              />
              <p className={fileError ? "text-xs text-rose-600" : "text-xs text-muted-foreground"}>
                {fileError || `Se suman a los que ya tiene. JPG, PNG, WEBP o PDF, hasta ${MAX_FILES} de 12 MB.`}
              </p>
            </div>

            <SubmitButton disabled={Boolean(fileError)} label="Guardar cambios" />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// «Anular» con motivo obligatorio. La devolución no se borra; `effect` dice qué pasa con el despacho o la entrega.
export function OrderReturnAnnulDialog({ orderId, returnId, effect }: { orderId: string; returnId: string; effect: string | null }) {
  const [open, setOpen] = useState(false);
  const [motive, setMotive] = useState("");
  const id = `annulReason-${returnId}`;
  return (
    <>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Ban className="h-3.5 w-3.5" />
        Anular
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anular devolución</DialogTitle>
            <DialogDescription>Queda guardada como anulada, con su motivo. No cambia dinero, inventario ni la orden.</DialogDescription>
          </DialogHeader>
          <form action={adminAnnulOrderReturnAction} className="space-y-3">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="returnId" value={returnId} />
            {effect ? (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {effect}
              </p>
            ) : null}
            <div className="space-y-1">
              <label className={LABEL_CLASS} htmlFor={id}>Motivo de la anulación</label>
              <Textarea
                id={id}
                name="annulReason"
                required
                minLength={ANNUL_REASON_MIN}
                maxLength={ANNUL_REASON_MAX}
                rows={2}
                value={motive}
                onChange={(event) => setMotive(event.target.value)}
                placeholder="Ej. Se registró en la orden equivocada"
              />
            </div>
            <SubmitButton disabled={motive.trim().length < ANNUL_REASON_MIN} label="Anular devolución" variant="destructive" />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

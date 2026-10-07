import {
  ELEICID_DEFAULT_WARNING,
  isEleicidCarrierName,
  MAX_DISPATCH_WARNING_LENGTH,
} from "../domain/carrier-warning";

// Campo "Aviso al despachar" de la ficha del proveedor. Vacio = sin aviso (para Eleicid se usa
// el aviso por defecto aunque este vacio).
export function DispatchWarningField({
  supplier,
}: {
  supplier: { name: string; displayName?: string | null; dispatchWarning?: string | null };
}) {
  const isEleicid = isEleicidCarrierName(supplier.name) || isEleicidCarrierName(supplier.displayName);
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">Aviso al despachar (opcional)</span>
      <textarea
        name="dispatchWarning"
        rows={4}
        maxLength={MAX_DISPATCH_WARNING_LENGTH}
        defaultValue={supplier.dispatchWarning ?? ""}
        placeholder={isEleicid ? ELEICID_DEFAULT_WARNING.join("\n") : "Una idea por línea. Se muestra al elegirlo como transportador."}
        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <span className="block text-xs text-muted-foreground">
        Una idea por línea. Se muestra en ámbar al elegir este proveedor en un despacho; no bloquea.
        {isEleicid ? " Si lo dejas vacío se usa el aviso de Eleicid por defecto." : ""}
      </span>
    </label>
  );
}

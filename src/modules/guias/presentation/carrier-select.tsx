"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { resolveDispatchWarning } from "../domain/carrier-warning";

export type CarrierSelectOption = {
  id: string;
  name: string;
  displayName?: string | null;
  dispatchWarning?: string | null;
};

// Recuadro ambar con los puntos de la advertencia del transportador. Solo avisa.
export function CarrierDispatchWarning({ lines }: { lines: string[] }) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <ul className="list-disc space-y-0.5 pl-4">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

// Selector de transportadora de los modales de despacho, con la advertencia del proveedor elegido.
export function CarrierSelect({
  carriers,
  placeholder = "Seleccionar",
  className,
}: {
  carriers: CarrierSelectOption[];
  placeholder?: string;
  className?: string;
}) {
  const [carrierId, setCarrierId] = useState("");
  const lines = resolveDispatchWarning(carriers.find((carrier) => carrier.id === carrierId));

  return (
    <>
      <select
        name="carrierSupplierId"
        required
        value={carrierId}
        onChange={(event) => setCarrierId(event.target.value)}
        className={className}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {carriers.map((carrier) => (
          <option key={carrier.id} value={carrier.id}>
            {carrier.name}
          </option>
        ))}
      </select>
      <CarrierDispatchWarning lines={lines} />
    </>
  );
}

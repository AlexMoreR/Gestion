"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { adminSearchShipmentCitiesAction } from "@/app/actions/shipment-actions";
import type { CityOption } from "../domain/types";
import { CityPicker } from "./city-picker";

export type ShipmentDefaults = {
  destination: CityOption | null; // sugerida desde la ciudad del cliente
  saleBalance: number; // saldo pendiente de la venta (lineas - pagos)
  hasPhone: boolean; // sin celular no hay consulta publica
};

function formatCop(value: number): string {
  return value.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// Campos "Crear guia Magilus" dentro del modal de despacho con transportadora.
export function ShipmentDispatchFields({ defaults }: { defaults: ShipmentDefaults }) {
  const [enabled, setEnabled] = useState(true);
  const [amount, setAmount] = useState(String(Math.round(defaults.saleBalance)));

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          name="createShipment"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-4 w-4"
        />
        Crear guía Magilus (MG) para el cliente
      </label>

      {defaults.saleBalance > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs font-medium text-rose-700 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Esta venta tiene saldo pendiente de {formatCop(defaults.saleBalance)}. Si es 50/50 el saldo debía estar en
            $0 antes de despachar. Puedes seguir.
          </span>
        </div>
      ) : null}

      {enabled ? (
        <>
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Ciudad destino</span>
            <CityPicker
              name="destinationCityId"
              search={adminSearchShipmentCitiesAction}
              defaultValue={defaults.destination}
              placeholder="Ciudad del cliente"
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Cobro al recibir (COP, 0 = nada)
            </span>
            <input
              type="number"
              name="amountToCollect"
              min={0}
              step={1000}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Fecha estimada automática (Bogotá 3, capitales 5, municipios 7 días hábiles); se edita en la guía.
          </p>
          {!defaults.hasPhone ? (
            <p className="text-xs text-amber-600">
              El cliente no tiene celular: la guía se crea pero no podrá consultarla en magilus.com/guia.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

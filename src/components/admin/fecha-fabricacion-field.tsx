"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayInColombia } from "@/lib/colombia-time";
import { fechaFabricacionDeDia, sumarDias } from "@/lib/delivery-tracking";

const ATAJOS = [7, 10, 15];

// Mismo chequeo que el servidor: vacío, inválido o pasado no deja confirmar.
export function fechaFabricacionValida(dia: string): boolean {
  return fechaFabricacionDeDia(dia, new Date()) !== null;
}

// "Fecha de entrega de fabricación" del cuadro de confirmar compra: obligatoria, sin días pasados y con atajos.
// Se envía como `fechaFabricacion` (AAAA-MM-DD); se guarda en la OF a las 5:00 p. m. Colombia.
export function FechaFabricacionField({
  value,
  onChange,
  aviso,
}: {
  value: string;
  onChange: (dia: string) => void;
  /** Texto bajo el campo (p. ej. a qué OF se aplica la fecha). */
  aviso?: string | null;
}) {
  const hoy = todayInColombia();
  const valida = fechaFabricacionValida(value);
  return (
    <div className="space-y-1.5">
      <label htmlFor="fechaFabricacion" className="text-sm font-medium text-foreground">
        Fecha de entrega de fabricación
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="fechaFabricacion"
          type="date"
          name="fechaFabricacion"
          required
          min={hoy}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={!valida}
          aria-describedby="fechaFabricacion-ayuda"
          className="h-9 w-auto min-w-[10rem]"
        />
        {ATAJOS.map((dias) => (
          <Button key={dias} type="button" variant="outline" size="sm" onClick={() => onChange(sumarDias(hoy, dias))}>
            +{dias} días
          </Button>
        ))}
      </div>
      <p
        id="fechaFabricacion-ayuda"
        className={valida ? "text-xs text-muted-foreground" : "text-xs font-medium text-destructive"}
      >
        {valida
          ? "La proveedora la ve en su enlace de la OF. Se puede cambiar en la pestaña Fabricación."
          : value
            ? "La fecha no puede ser anterior a hoy"
            : "Elige la fecha de entrega de fabricación"}
      </p>
      {aviso ? <p className="text-xs text-amber-600 dark:text-amber-400">{aviso}</p> : null}
    </div>
  );
}

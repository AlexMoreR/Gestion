"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MOTIVO_FIELD, MOTIVO_MAX, MOTIVO_MIN, esRetroactivo } from "@/modules/retroactivos/domain/retroactivo";

type MotivoRetroactivoFieldProps = {
  // Dia puesto (AAAA-MM-DD). El campo solo aparece si es anterior a hoy (hora Colombia).
  fecha: string | null | undefined;
  // En una edicion: dia que ya tenia el registro. Si no cambia, no se pide motivo.
  fechaOriginal?: string | null;
  name?: string;
  className?: string;
};

// Campo "Motivo" para registros con fecha atrasada. El servidor valida igual.
export function MotivoRetroactivoField({
  fecha,
  fechaOriginal,
  name = MOTIVO_FIELD,
  className,
}: MotivoRetroactivoFieldProps) {
  const dia = (fecha ?? "").slice(0, 10);
  if (!esRetroactivo(dia || null) || (fechaOriginal && fechaOriginal.slice(0, 10) === dia)) {
    return null;
  }

  return (
    <div className={cn("block space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-500/40 dark:bg-amber-500/10", className)}>
      <span className="block text-xs font-medium text-amber-900 dark:text-amber-200">
        Fecha anterior a hoy: ¿por qué se registra tarde? *
      </span>
      <textarea
        name={name}
        aria-label="Motivo del registro atrasado"
        required
        minLength={MOTIVO_MIN}
        maxLength={MOTIVO_MAX}
        rows={2}
        placeholder="Ej.: el cliente pagó el sábado y no tenía acceso al sistema"
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
      />
    </div>
  );
}

type FechaConMotivoProps = {
  name: string;
  defaultValue: string;
  required?: boolean;
  className?: string;
};

// Input de fecha + motivo, para formularios de servidor (sin estado propio).
export function FechaConMotivo({ name, defaultValue, required, className }: FechaConMotivoProps) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input
        type="date"
        name={name}
        required={required}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={className}
      />
      <MotivoRetroactivoField fecha={value} className="mt-2" />
    </>
  );
}

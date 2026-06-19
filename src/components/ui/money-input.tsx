"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

function toRawDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function formatThousands(raw: string): string {
  if (!raw) return "";
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric.toLocaleString("es-CO") : "";
}

type MoneyInputProps = {
  /** Valor crudo (numero o string de digitos). */
  value: string | number;
  /** Devuelve el valor crudo en digitos (sin puntos). */
  onValueChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Si se pasa, agrega un input oculto con el valor crudo para envios nativos de formulario. */
  name?: string;
  disabled?: boolean;
};

/**
 * Campo de dinero que muestra separadores de miles (es-CO) mientras se
 * escribe, pero guarda/entrega el numero crudo. Pensado para montos en pesos
 * (enteros). Funciona controlado: pasa `value` + `onValueChange`.
 */
export function MoneyInput({
  value,
  onValueChange,
  placeholder = "0",
  className,
  id,
  name,
  disabled,
}: MoneyInputProps) {
  const raw =
    typeof value === "number"
      ? Number.isFinite(value) && value !== 0
        ? String(Math.trunc(value))
        : value === 0
          ? ""
          : ""
      : toRawDigits(value);

  return (
    <>
      <Input
        id={id}
        inputMode="numeric"
        value={formatThousands(raw)}
        onChange={(event) => onValueChange(toRawDigits(event.target.value))}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
      />
      {name ? <input type="hidden" name={name} value={raw} /> : null}
    </>
  );
}

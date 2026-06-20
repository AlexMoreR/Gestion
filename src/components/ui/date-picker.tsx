"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { format, isValid, parse } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";

// Las fechas se manejan como strings "yyyy-MM-dd" (igual que un <input type="date">)
// para no romper los formularios ni los server actions existentes.
function parseValue(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function toValue(date?: Date): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

type DatePickerProps = {
  /** Si se pasa, agrega un input oculto con este name para enviar en FormData. */
  name?: string;
  /** Modo controlado: valor "yyyy-MM-dd". */
  value?: string;
  /** Modo no controlado: valor inicial "yyyy-MM-dd". */
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Limites como "yyyy-MM-dd". */
  min?: string;
  max?: string;
  id?: string;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  /** Asocia el input oculto a un form por id (atributo form=""). */
  form?: string;
};

export function DatePicker({
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  min,
  max,
  id,
  className,
  placeholder = "Selecciona fecha",
  form,
  ...rest
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<string>(defaultValue ?? "");
  const current = isControlled ? value ?? "" : internal;
  const [open, setOpen] = React.useState(false);

  const selectedDate = parseValue(current);
  const minDate = parseValue(min);
  const maxDate = parseValue(max);

  const commit = (next: string) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  const disabledMatchers = [
    minDate ? { before: minDate } : undefined,
    maxDate ? { after: maxDate } : undefined,
  ].filter(Boolean) as Array<{ before: Date } | { after: Date }>;

  return (
    <>
      {name ? (
        <input type="hidden" name={name} value={current} required={required} form={form} />
      ) : null}
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={rest["aria-label"]}
            className={cn(
              "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
              selectedDate ? "text-foreground" : "text-muted-foreground",
              className,
            )}
          >
            <span>{selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: es }) : placeholder}</span>
            <CalendarIcon className="size-4 shrink-0 opacity-70" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            // z alto para quedar por encima de los modales (z-[55]/z-[60]).
            className="z-[70] w-auto rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-md outline-none"
          >
            <Calendar
              mode="single"
              locale={es}
              selected={selectedDate}
              defaultMonth={selectedDate}
              disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
              onSelect={(date) => {
                commit(toValue(date));
                setOpen(false);
              }}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
}

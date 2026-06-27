"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { DateRange } from "react-day-picker";
import { format, isValid, parse } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Calendar } from "@/components/ui/calendar";

// Las fechas se manejan como strings "yyyy-MM-dd" para encajar con los filtros existentes.
function parseValue(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : undefined;
}

function toValue(date?: Date): string {
  return date ? format(date, "yyyy-MM-dd") : "";
}

type DateRangePickerProps = {
  from?: string;
  to?: string;
  onChange?: (range: { from: string; to: string }) => void;
  className?: string;
  placeholder?: string;
  numberOfMonths?: number;
  "aria-label"?: string;
};

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
  placeholder = "Selecciona un rango",
  numberOfMonths = 2,
  ...rest
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const monthsToShow = isMobile ? 1 : numberOfMonths;

  const fromDate = parseValue(from);
  const toDate = parseValue(to);
  const selected: DateRange | undefined = fromDate ? { from: fromDate, to: toDate } : undefined;

  const label = fromDate
    ? toDate
      ? `${format(fromDate, "dd MMM yyyy", { locale: es })} - ${format(toDate, "dd MMM yyyy", { locale: es })}`
      : format(fromDate, "dd MMM yyyy", { locale: es })
    : placeholder;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={rest["aria-label"]}
          className={cn(
            "flex h-9 w-full items-center justify-start gap-2 rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
            fromDate ? "text-foreground" : "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4 shrink-0 opacity-70" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          // z alto para quedar por encima de modales (z-[55]/z-[60]).
          className="z-[70] w-auto rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-md outline-none"
        >
          <Calendar
            mode="range"
            locale={es}
            numberOfMonths={monthsToShow}
            selected={selected}
            defaultMonth={fromDate}
            onSelect={(range) =>
              onChange?.({ from: toValue(range?.from), to: toValue(range?.to) })
            }
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

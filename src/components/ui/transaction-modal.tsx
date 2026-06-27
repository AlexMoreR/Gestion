"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shell estándar para los modales transaccionales (Comprar, Nueva cotización,
 * Enviar a ventas, Venta directa, Movimiento de inventario, Cargo a proveedor).
 *
 * Estructura fija:
 *  - Header fijo: icono + título y, enseguida, un control opcional (la fecha).
 *  - Cuerpo scrolleable.
 *  - Footer fijo: barra de total opcional + acciones (Cancelar / Confirmar).
 *
 * `formProps` envuelve todo (header/body/footer) en un <form> para acciones de
 * servidor; los `hiddenFields` van dentro de ese form pero fuera del cuerpo.
 */
export type TransactionModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Icono mostrado a la izquierda del título. */
  icon?: React.ReactNode;
  /** Control opcional enseguida del título (normalmente el DatePicker). */
  headerExtra?: React.ReactNode;
  /** Barra de total en el footer. Opcional. */
  total?: { label: React.ReactNode; value: React.ReactNode };
  /** Botones de acción del footer (alineados a la derecha). */
  actions?: React.ReactNode;
  /** Cuerpo scrolleable. */
  children: React.ReactNode;
  /** Si se entrega, el contenido se envuelve en un <form>. */
  formProps?: React.ComponentProps<"form">;
  /** Inputs ocultos: dentro del form, fuera del cuerpo scrolleable. */
  hiddenFields?: React.ReactNode;
  /** Clase para el ancho del modal. Por defecto max-w-3xl. */
  contentClassName?: string;
  /** Clase extra para el cuerpo scrolleable. */
  bodyClassName?: string;
};

export function TransactionModal({
  open,
  onOpenChange,
  title,
  icon,
  headerExtra,
  total,
  actions,
  children,
  formProps,
  hiddenFields,
  contentClassName,
  bodyClassName,
}: TransactionModalProps) {
  const inner = (
    <>
      {hiddenFields}

      {/* Header fijo */}
      <DialogHeader className="shrink-0 border-b border-border px-4 py-2.5 text-left sm:px-5">
        <div className="flex flex-wrap items-center gap-3 pr-8">
          <DialogTitle className="inline-flex items-center gap-2 text-lg font-semibold text-foreground">
            {icon ? <span className="inline-flex shrink-0 text-primary">{icon}</span> : null}
            <span>{title}</span>
          </DialogTitle>
          {headerExtra}
        </div>
      </DialogHeader>

      {/* Cuerpo scrolleable */}
      <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4", bodyClassName)}>
        {children}
      </div>

      {/* Footer fijo */}
      {total || actions ? (
        <div className="shrink-0 space-y-3 border-t border-border bg-background px-5 py-4">
          {total ? (
            <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
              <span className="text-base font-semibold text-foreground">{total.label}</span>
              <span className="text-2xl font-bold text-primary">{total.value}</span>
            </div>
          ) : null}
          {actions ? <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">{actions}</div> : null}
        </div>
      ) : null}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92vh] w-[calc(100%-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0",
          contentClassName,
        )}
      >
        {formProps ? (
          <form {...formProps} className={cn("flex min-h-0 flex-1 flex-col", formProps.className)}>
            {inner}
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">{inner}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

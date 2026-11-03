"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  REVERSAL_COMMENT_MAX,
  REVERSAL_OTHER_MAX,
  REVERSAL_OTHER_MIN,
  REVERSAL_REASONS,
} from "@/lib/order-item-reversal";

// Motivo de una reversa (entrega o despacho). Va dentro de un <form>; la acción valida con parseReversalInput.
// onReadyChange avisa si ya hay motivo elegido (y el texto de "Otro" escrito) para habilitar el botón.
export function ReversalReasonFields({ onReadyChange }: { onReadyChange?: (ready: boolean) => void }) {
  const [reason, setReason] = React.useState("");
  const [otherText, setOtherText] = React.useState("");
  const groupId = React.useId();
  const ready = reason !== "" && (reason !== "OTRO" || otherText.trim().length >= REVERSAL_OTHER_MIN);

  React.useEffect(() => {
    onReadyChange?.(ready);
  }, [ready, onReadyChange]);

  return (
    <fieldset className="w-full space-y-2">
      <legend className="mb-1 text-xs font-semibold text-foreground">¿Por qué? (obligatorio)</legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {REVERSAL_REASONS.map((option) => (
          <label key={option.key} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-xs text-foreground hover:bg-muted">
            <input
              type="radio"
              name="reversalReason"
              value={option.key}
              checked={reason === option.key}
              onChange={() => setReason(option.key)}
              required
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {reason === "OTRO" ? (
        <div className="space-y-1">
          <label htmlFor={`${groupId}-otro`} className="text-xs font-medium text-foreground">
            ¿Cuál es el motivo?
          </label>
          <Input
            id={`${groupId}-otro`}
            name="reversalReasonText"
            value={otherText}
            onChange={(event) => setOtherText(event.target.value)}
            required
            minLength={REVERSAL_OTHER_MIN}
            maxLength={REVERSAL_OTHER_MAX}
            placeholder={`Mínimo ${REVERSAL_OTHER_MIN} letras`}
            className="h-8 text-xs"
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <label htmlFor={`${groupId}-comentario`} className="text-xs font-medium text-foreground">
          Comentario (opcional)
        </label>
        <Textarea
          id={`${groupId}-comentario`}
          name="reversalComment"
          maxLength={REVERSAL_COMMENT_MAX}
          rows={2}
          className="min-h-14 text-xs"
        />
      </div>
    </fieldset>
  );
}

"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Send } from "lucide-react";
import { adminGenerateMonthClosureAction } from "@/app/actions/month-closure-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {pending ? "Generando y enviando..." : "Generar y enviar"}
    </Button>
  );
}

export function MonthClosureForm({ defaultMonth }: { defaultMonth: string }) {
  return (
    <form action={adminGenerateMonthClosureAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-foreground">Mes a cerrar</span>
          <Input type="month" name="month" defaultValue={defaultMonth} required />
        </label>
      </div>

      <label className="space-y-1.5">
        <span className="text-sm font-medium text-foreground">Destinatarios</span>
        <Textarea
          name="recipients"
          required
          rows={3}
          placeholder="correo1@ejemplo.com, correo2@ejemplo.com"
        />
        <span className="text-xs text-muted-foreground">
          Separa los correos con coma o salto de linea. El correo lleva un enlace al informe (requiere iniciar
          sesion).
        </span>
      </label>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "react-toastify";
import { marcarAsistenciaAction } from "@/app/actions/asistencia-actions";

export type AttendanceButtonState = {
  next: "ENTRADA" | "SALIDA";
  // Hora "HH:MM" de la entrada abierta (si toca marcar salida); "ayer HH:MM" si viene de anoche.
  openSince: string | null;
  minutesToday: number;
  workedToday: boolean;
};

// Boton "Marcar entrada / Marcar salida" de la barra. La hora la pone el servidor: aqui no se
// escribe ninguna hora. En celular se ve compacto (icono + palabra corta).
export function AttendanceButton({ state }: { state: AttendanceButtonState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isExit = state.next === "SALIDA";

  const onClick = () => {
    startTransition(async () => {
      const result = await marcarAsistenciaAction(state.next);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  };

  const Icon = isExit ? LogOut : LogIn;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={isExit && state.openSince ? `Trabajando desde ${state.openSince}` : "Marcar entrada (hora del servidor)"}
      className={`mr-1 inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition disabled:opacity-60 ${
        isExit
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
          : "border-[var(--line)] bg-background text-foreground hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sm:hidden">{pending ? "..." : isExit ? "Salida" : "Entrada"}</span>
      <span className="hidden sm:inline">
        {pending ? "Marcando..." : isExit ? "Marcar salida" : "Marcar entrada"}
      </span>
      {isExit && state.openSince ? (
        <span className="hidden font-normal text-emerald-700 md:inline dark:text-emerald-300">· desde {state.openSince}</span>
      ) : null}
    </button>
  );
}

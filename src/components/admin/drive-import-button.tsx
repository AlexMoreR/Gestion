"use client";

import { useState, useTransition } from "react";
import { CloudDownload } from "lucide-react";
import {
  adminImportDrivePhotosAction,
  adminImportDrivePhotosByCodesAction,
  type DriveImportActionState,
} from "@/app/actions/drive-gallery-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function ResultLines({ state }: { state: DriveImportActionState }) {
  return (
    <div className={`space-y-0.5 text-xs ${state.ok ? "text-slate-600" : "text-red-600"}`}>
      <p className="font-medium">{state.message}</p>
      {state.results.length > 1 ? state.results.map((result) => <p key={result.productId}>{result.message}</p>) : null}
      {state.results.flatMap((result) => result.errors).slice(0, 8).map((error, index) => (
        <p key={index} className="text-red-600">
          {error}
        </p>
      ))}
    </div>
  );
}

// Boton en la ficha de un producto. Agrega fotos AL FINAL de la galeria; no cambia la portada.
export function DriveImportButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<DriveImportActionState | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        className="w-fit gap-1.5"
        onClick={() => {
          if (!window.confirm("Se agregan fotos de Drive al final de la galeria (max. 8 en total). La pagina se recarga: guarda antes tus cambios. ¿Seguir?")) {
            return;
          }
          startTransition(async () => {
            const result = await adminImportDrivePhotosAction(productId);
            setState(result);
            if (result.results.some((item) => item.added > 0)) {
              window.location.reload();
            }
          });
        }}
      >
        <CloudDownload className="h-4 w-4" />
        {pending ? "Trayendo de Drive..." : "Traer de Drive"}
      </Button>
      {state ? <ResultLines state={state} /> : null}
    </div>
  );
}

// Varios productos por codigo (listado de productos).
export function DriveImportByCodes() {
  const [pending, startTransition] = useTransition();
  const [codes, setCodes] = useState("");
  const [state, setState] = useState<DriveImportActionState | null>(null);

  return (
    <details className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-slate-800">Traer fotos de Drive (varios productos)</summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-slate-600">
          Codigos separados por coma o salto de linea (max. 10 por tanda). Se agregan al final de cada galeria, hasta 8
          fotos; la portada no cambia.
        </p>
        <Textarea
          value={codes}
          onChange={(event) => setCodes(event.target.value)}
          placeholder="LCV003, SEV001, PSV003, SNV012, MMV014"
          rows={2}
        />
        <Button
          type="button"
          size="sm"
          disabled={pending || !codes.trim()}
          className="gap-1.5"
          onClick={() => {
            startTransition(async () => {
              setState(await adminImportDrivePhotosByCodesAction(codes));
            });
          }}
        >
          <CloudDownload className="h-4 w-4" />
          {pending ? "Trayendo de Drive..." : "Traer de Drive"}
        </Button>
        {state ? <ResultLines state={state} /> : null}
      </div>
    </details>
  );
}

"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import {
  adminImportFichaRowAction,
  adminPreviewFichasAction,
  type VistaPreviaFichas,
} from "@/app/actions/product-ficha-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { driveIdDeArchivo, type AccionFicha } from "@/lib/product-fichas";

const ETIQUETA: Record<AccionFicha["tipo"], string> = {
  crear: "Se crea",
  "ya-existe": "Ya estaba",
  "sin-producto": "No existe el código",
  "sin-imagen": "Falta la imagen",
};

// Carga en lote: CSV (codigo,ficha,driveFileId,nota) + las imagenes llamadas <driveFileId>.jpg.
// 1) Revisar = simulacion (no escribe). 2) Cargar = sube una por una (idempotente: si se corta,
// se vuelve a correr y salta las que ya estan).
export function FichasBulkImport() {
  const [pending, startTransition] = useTransition();
  const [csv, setCsv] = useState("");
  const [archivos, setArchivos] = useState<Map<string, File>>(new Map());
  const [vista, setVista] = useState<VistaPreviaFichas | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  const crear = vista?.plan?.acciones.filter((a) => a.tipo === "crear") ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-[var(--line)] bg-white p-4 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          1. CSV (columnas codigo, ficha, driveFileId, nota)
          <Input
            type="file"
            accept=".csv,text/csv"
            disabled={pending}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setCsv(file ? await file.text() : "");
              setVista(null);
            }}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          2. Imágenes de la carpeta (nombre = driveFileId.jpg)
          <Input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={pending}
            onChange={(event) => {
              const map = new Map<string, File>();
              for (const file of Array.from(event.target.files ?? [])) {
                const id = driveIdDeArchivo(file.name);
                if (id) map.set(id, file);
              }
              setArchivos(map);
              setVista(null);
            }}
          />
          <span className="font-normal text-slate-500">{archivos.size} imagen(es) reconocidas</span>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || !csv}
            className="gap-1.5"
            onClick={() =>
              startTransition(async () => {
                setLog([]);
                setProgreso(null);
                setVista(await adminPreviewFichasAction({ csv, archivos: [...archivos.keys()] }));
              })
            }
          >
            <FileSpreadsheet className="h-4 w-4" />
            Revisar (simulación)
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending || crear.length === 0}
            className="gap-1.5"
            onClick={() => {
              if (!window.confirm(`Se cargan ${crear.length} ficha(s) técnicas. ¿Seguir?`)) return;
              startTransition(async () => {
                const lineas: string[] = [];
                setProgreso({ hechas: 0, total: crear.length });
                for (const [index, accion] of crear.entries()) {
                  const file = archivos.get(accion.fila.driveFileId);
                  if (!file) {
                    lineas.push(`${accion.fila.codigo}: falta la imagen`);
                    continue;
                  }
                  const formData = new FormData();
                  formData.set("codigo", accion.fila.codigo);
                  formData.set("driveFileId", accion.fila.driveFileId);
                  formData.set("file", file);
                  try {
                    const result = await adminImportFichaRowAction(formData);
                    lineas.push(`${result.ok ? "OK" : "ERROR"} · ${result.message}`);
                  } catch (error) {
                    lineas.push(`ERROR · ${accion.fila.codigo}: ${error instanceof Error ? error.message : String(error)}`);
                  }
                  setLog([...lineas]);
                  setProgreso({ hechas: index + 1, total: crear.length });
                }
                setVista(await adminPreviewFichasAction({ csv, archivos: [...archivos.keys()] }));
              });
            }}
          >
            <Upload className="h-4 w-4" />
            {pending && progreso ? `Cargando ${progreso.hechas}/${progreso.total}...` : `Cargar ${crear.length} ficha(s)`}
          </Button>
        </div>
      </div>

      {vista ? (
        <div className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-4 text-sm">
          <p className={vista.ok ? "font-medium text-slate-800" : "font-medium text-red-600"}>{vista.message}</p>
          {vista.plan ? (
            <p className="text-slate-700">
              Se crean <b>{vista.plan.resumen.crear}</b> · ya estaban <b>{vista.plan.resumen.yaExiste}</b> · sin producto{" "}
              <b>{vista.plan.resumen.sinProducto}</b> · sin imagen <b>{vista.plan.resumen.sinImagen}</b>
            </p>
          ) : null}
          {vista.plan && vista.plan.codigosInexistentes.length > 0 ? (
            <p className="text-red-600">Códigos que no existen: {vista.plan.codigosInexistentes.join(", ")}</p>
          ) : null}
          {vista.errores.map((error) => (
            <p key={error} className="text-xs text-amber-700">
              {error}
            </p>
          ))}
          {vista.plan ? (
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">Código</th>
                  <th>Ficha</th>
                  <th>Drive</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {vista.plan.acciones.map((accion) => (
                  <tr key={`${accion.fila.codigo}-${accion.fila.driveFileId}`} className="border-t border-[var(--line)]">
                    <td className="py-1 font-medium">{accion.fila.codigo}</td>
                    <td>{accion.fila.ficha}</td>
                    <td className="font-mono text-[11px] text-slate-500">{accion.fila.driveFileId}</td>
                    <td className={accion.tipo === "crear" || accion.tipo === "ya-existe" ? "" : "text-red-600"}>
                      {ETIQUETA[accion.tipo]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}

      {log.length > 0 ? (
        <div className="space-y-0.5 rounded-xl border border-[var(--line)] bg-white p-4 font-mono text-xs">
          {log.map((linea, index) => (
            <p key={index} className={linea.startsWith("OK") ? "text-slate-700" : "text-red-600"}>
              {linea}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

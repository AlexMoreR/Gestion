"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brush, Eraser, Eye, EyeOff, Save } from "lucide-react";
import { guardarMascaraParteAction } from "@/app/actions/product-parts-actions";
import { Button } from "@/components/ui/button";

type Parte = { nombre: string; mascaraUrl: string | null };

type Props = {
  productId: string;
  fotoSrc: string;
  /** Medida del lienzo (la de la portada, máximo 2000 px por lado). La máscara se guarda de este tamaño. */
  lienzo: { ancho: number; alto: number };
  partes: Parte[];
  /** Nombre de la categoría si el producto usa sus partes (al guardar se copian como propias); si no, null. */
  categoriaNombre: string | null;
};

// Cada parte tiene su capa: transparente = fuera de la parte, blanco = la parte.
function capaNueva(ancho: number, alto: number): HTMLCanvasElement {
  const capa = document.createElement("canvas");
  capa.width = ancho;
  capa.height = alto;
  return capa;
}

/** Pasa una máscara guardada (blanco y negro) a capa: lo negro queda transparente. false si no es del tamaño del lienzo. */
function cargarMascara(capa: HTMLCanvasElement, src: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ctx = capa.getContext("2d")!;
      ctx.drawImage(img, 0, 0, capa.width, capa.height);
      const datos = ctx.getImageData(0, 0, capa.width, capa.height);
      for (let i = 0; i < datos.data.length; i += 4) {
        const luz = datos.data[i];
        datos.data[i] = datos.data[i + 1] = datos.data[i + 2] = 255;
        datos.data[i + 3] = luz;
      }
      ctx.putImageData(datos, 0, 0);
      resolve(img.naturalWidth === capa.width && img.naturalHeight === capa.height);
    };
    img.onerror = () => reject(new Error("no cargó"));
    img.src = src;
  });
}

export function MascarasEditor({ productId, fotoSrc, lienzo, partes, categoriaNombre }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actual, setActual] = useState(partes[0]?.nombre ?? "");
  const [herramienta, setHerramienta] = useState<"pincel" | "borrador">("pincel");
  const [tamano, setTamano] = useState(() => Math.max(10, Math.round(Math.max(lienzo.ancho, lienzo.alto) / 25)));
  const [verMascara, setVerMascara] = useState(false);
  const [sinGuardar, setSinGuardar] = useState<Set<string>>(new Set());
  const [guardadas, setGuardadas] = useState<Set<string>>(() => new Set(partes.filter((p) => p.mascaraUrl).map((p) => p.nombre)));
  const [mensaje, setMensaje] = useState<{ ok: boolean; text: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  // Partes cuya máscara se hizo con otra foto de portada (otro tamaño): se muestran estiradas, nada se borra.
  const [otraPortada, setOtraPortada] = useState<string[]>([]);

  const visible = useRef<HTMLCanvasElement>(null);
  const capas = useRef(new Map<string, HTMLCanvasElement>());
  const ultimo = useRef<{ x: number; y: number } | null>(null);

  // Muestra la capa de la parte elegida: encima de la foto en color, o sola en blanco y negro ("Ver máscara").
  const dibujar = useCallback(() => {
    const canvas = visible.current;
    const capa = capas.current.get(actual);
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (verMascara) {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (capa) ctx.drawImage(capa, 0, 0);
      return;
    }
    if (!capa) return;
    ctx.drawImage(capa, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "rgba(220, 38, 38, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
  }, [actual, verMascara]);

  // Crea las capas y carga las máscaras ya guardadas (una sola vez).
  useEffect(() => {
    let vivo = true;
    const cargas = partes.map(async (parte) => {
      if (capas.current.has(parte.nombre)) return;
      const capa = capaNueva(lienzo.ancho, lienzo.alto);
      capas.current.set(parte.nombre, capa);
      const coincide = parte.mascaraUrl ? await cargarMascara(capa, parte.mascaraUrl).catch(() => true) : true;
      return coincide ? null : parte.nombre;
    });
    void Promise.all(cargas).then((nombres) => {
      if (!vivo) return;
      setOtraPortada(nombres.filter((nombre): nombre is string => !!nombre));
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
    // Las capas viven mientras la pantalla está abierta; al guardar no se vuelven a cargar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cargando) dibujar();
  }, [cargando, dibujar]);

  // Avisa antes de salir con trazos sin guardar.
  useEffect(() => {
    if (sinGuardar.size === 0) return;
    const avisar = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sinGuardar]);

  const punto = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const caja = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - caja.left) / caja.width) * lienzo.ancho,
      y: ((event.clientY - caja.top) / caja.height) * lienzo.alto,
    };
  };

  const trazo = (desde: { x: number; y: number }, hasta: { x: number; y: number }) => {
    const capa = capas.current.get(actual);
    if (!capa) return;
    const ctx = capa.getContext("2d")!;
    ctx.globalCompositeOperation = herramienta === "pincel" ? "source-over" : "destination-out";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = tamano;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(desde.x, desde.y);
    ctx.lineTo(hasta.x + 0.01, hasta.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    dibujar();
  };

  const empezar = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pending || cargando || !actual) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = punto(event);
    ultimo.current = p;
    trazo(p, p);
    setSinGuardar((previo) => new Set(previo).add(actual));
  };

  const mover = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ultimo.current) return;
    const p = punto(event);
    trazo(ultimo.current, p);
    ultimo.current = p;
  };

  const terminar = () => {
    ultimo.current = null;
  };

  const guardar = () => {
    const capa = capas.current.get(actual);
    if (!capa) return;
    if (categoriaNombre && !window.confirm(
      `Este producto usa las partes de la categoría ${categoriaNombre}. Al guardar se copian como partes propias del producto y dejan de seguir los cambios de la categoría. ¿Seguir?`,
    )) return;
    setMensaje(null);
    // PNG en blanco y negro: fondo negro y la parte en blanco.
    const salida = capaNueva(lienzo.ancho, lienzo.alto);
    const ctx = salida.getContext("2d")!;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, salida.width, salida.height);
    ctx.drawImage(capa, 0, 0);
    const nombre = actual;
    salida.toBlob((blob) => {
      if (!blob) {
        setMensaje({ ok: false, text: "No se pudo armar la máscara. Intenta de nuevo." });
        return;
      }
      const datos = new FormData();
      datos.set("productId", productId);
      datos.set("parte", nombre);
      datos.set("mascara", new File([blob], "mascara.png", { type: "image/png" }));
      startTransition(async () => {
        try {
          const result = await guardarMascaraParteAction(datos);
          setMensaje({ ok: result.ok, text: result.message });
          if (!result.ok) return;
          setSinGuardar((previo) => {
            const siguiente = new Set(previo);
            siguiente.delete(nombre);
            return siguiente;
          });
          setGuardadas((previo) => new Set(previo).add(nombre));
          router.refresh();
        } catch {
          setMensaje({ ok: false, text: "No se pudo guardar la máscara. Revisa la conexión e intenta de nuevo." });
        }
      });
    }, "image/png");
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--line)] bg-white p-4">
      {categoriaNombre ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Este producto usa las partes de la categoría {categoriaNombre}. Al guardar la primera máscara se copian como
          partes propias del producto y dejan de seguir los cambios de la categoría.
        </p>
      ) : null}

      {otraPortada.length > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          La máscara de {otraPortada.join(", ")} se pintó sobre otra foto de portada. Revísala y vuelve a guardarla.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          Parte
          <select
            value={actual}
            disabled={pending}
            onChange={(event) => {
              setMensaje(null);
              setActual(event.target.value);
            }}
            className="field-select"
          >
            {partes.map((parte) => (
              <option key={parte.nombre} value={parte.nombre}>
                {parte.nombre}
                {sinGuardar.has(parte.nombre) ? " (sin guardar)" : guardadas.has(parte.nombre) ? " ✓" : " (sin máscara)"}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          variant={herramienta === "pincel" ? "default" : "outline"}
          aria-pressed={herramienta === "pincel"}
          className="gap-1"
          onClick={() => setHerramienta("pincel")}
        >
          <Brush className="h-3.5 w-3.5" />
          Pincel
        </Button>
        <Button
          type="button"
          size="sm"
          variant={herramienta === "borrador" ? "default" : "outline"}
          aria-pressed={herramienta === "borrador"}
          className="gap-1"
          onClick={() => setHerramienta("borrador")}
        >
          <Eraser className="h-3.5 w-3.5" />
          Borrador
        </Button>
        <label className="grid gap-1 text-xs font-medium text-slate-700">
          Tamaño ({tamano} px)
          <input
            type="range"
            min={2}
            max={Math.max(40, Math.round(Math.max(lienzo.ancho, lienzo.alto) / 5))}
            value={tamano}
            onChange={(event) => setTamano(Number(event.target.value))}
            className="h-8 w-36 accent-[var(--primary)]"
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-pressed={verMascara}
          className="gap-1"
          onClick={() => setVerMascara((v) => !v)}
        >
          {verMascara ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {verMascara ? "Ver foto" : "Ver máscara"}
        </Button>
        <Button type="button" size="sm" className="gap-1" disabled={pending || cargando || !actual} onClick={guardar}>
          <Save className="h-3.5 w-3.5" />
          {pending ? "Guardando..." : "Guardar máscara"}
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        Pinta con el dedo o el mouse la zona de «{actual}». En rojo se ve lo pintado; el borrador quita. Cada parte se
        guarda por separado.
      </p>

      <div className="relative w-full max-w-3xl overflow-hidden rounded-lg border border-[var(--line)] bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- la foto debe verse a su medida exacta debajo del lienzo */}
        <img src={fotoSrc} alt="Foto de portada" className="block h-auto w-full select-none" draggable={false} />
        <canvas
          ref={visible}
          width={lienzo.ancho}
          height={lienzo.alto}
          aria-label={`Lienzo para pintar la máscara de ${actual}`}
          className={`absolute inset-0 h-full w-full touch-none ${herramienta === "pincel" ? "cursor-crosshair" : "cursor-cell"} ${
            verMascara ? "" : "opacity-90"
          }`}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
        />
        {cargando ? (
          <p className="absolute inset-x-0 top-2 text-center text-xs text-slate-600">Cargando máscaras...</p>
        ) : null}
      </div>

      {mensaje ? (
        <p role="status" className={`text-xs ${mensaje.ok ? "text-slate-600" : "text-red-600"}`}>
          {mensaje.text}
        </p>
      ) : null}
    </div>
  );
}

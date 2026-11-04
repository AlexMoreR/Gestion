import { Camera } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fotosEmbalajeParaVer, fotosLlegadaParaVer, type EmbalajeTipo } from "@/lib/embalaje-fotos";
import { formatNoteDate } from "@/lib/order-notes";

// Sin código de servidor: sirve en el detalle de la orden y dentro del modal del despacho (cliente).

export type EmbalajeFotoView = {
  id: string;
  url: string;
  tipo: EmbalajeTipo;
  subidoPorTexto: string;
  // "AAAA-MM-DD HH:MM" hora Colombia (formatNoteDate).
  fecha: string;
};

// fotos = cómo salió (ABIERTO, CERRADO, EXTRA); llegada = cómo llegó (LLEGADA, al reversar "Llegó dañado").
export type EmbalajeFotosGrupo = { id: string; producto: string; fotos: EmbalajeFotoView[]; llegada: EmbalajeFotoView[] };

const TIPO_LABEL: Record<EmbalajeTipo, string> = {
  ABIERTO: "Abierto",
  CERRADO: "Cerrado",
  EXTRA: "Extra",
  LLEGADA: "Llegada",
};

// Agrupa por producto (orden de aparición): salida por tipo y fecha, llegada por fecha; deja la fecha ya escrita.
export function gruposEmbalaje(
  fotos: {
    id: string;
    url: string;
    tipo: EmbalajeTipo;
    subidoPorTexto: string;
    createdAt: Date;
    orderItemId: string;
    producto: string;
  }[],
): EmbalajeFotosGrupo[] {
  const grupos = new Map<string, EmbalajeFotosGrupo>();
  const agregar = (foto: (typeof fotos)[number], lado: "fotos" | "llegada") => {
    const grupo = grupos.get(foto.orderItemId) ?? { id: foto.orderItemId, producto: foto.producto, fotos: [], llegada: [] };
    grupo[lado].push({
      id: foto.id,
      url: foto.url,
      tipo: foto.tipo,
      subidoPorTexto: foto.subidoPorTexto,
      fecha: formatNoteDate(foto.createdAt),
    });
    grupos.set(foto.orderItemId, grupo);
  };
  for (const foto of fotosEmbalajeParaVer(fotos)) agregar(foto, "fotos");
  for (const foto of fotosLlegadaParaVer(fotos)) agregar(foto, "llegada");
  return [...grupos.values()];
}

function FotoTile({ foto }: { foto: EmbalajeFotoView }) {
  return (
    <a
      href={foto.url}
      target="_blank"
      rel="noreferrer"
      className="block min-w-0 rounded-md border border-border bg-card p-1.5 hover:border-ring"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={foto.url}
        alt={foto.tipo === "LLEGADA" ? "Foto de cómo llegó" : `Foto del embalaje: ${TIPO_LABEL[foto.tipo]}`}
        className="aspect-square w-full rounded object-cover"
      />
      <p className="mt-1 text-xs font-medium text-foreground">{TIPO_LABEL[foto.tipo]}</p>
      <p className="break-words text-xs text-muted-foreground">Subida por {foto.subidoPorTexto}</p>
      <p className="text-xs text-muted-foreground">{foto.fecha}</p>
    </a>
  );
}

function Columna({ titulo, fotos }: { titulo: string; fotos: EmbalajeFotoView[] }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-semibold text-foreground">{titulo}</p>
      {fotos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin fotos</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {fotos.map((foto) => (
            <FotoTile key={foto.id} foto={foto} />
          ))}
        </div>
      )}
    </div>
  );
}

// Fotos del embalaje por producto. Solo internas: nunca en enlaces de clienta, proveedora ni transportadora.
export function EmbalajeFotosCard({ grupos }: { grupos: EmbalajeFotosGrupo[] }) {
  const conFotos = grupos.filter((grupo) => grupo.fotos.length > 0 || grupo.llegada.length > 0);
  if (conFotos.length === 0) return null;
  return (
    <Card className="border-border bg-card/95">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Fotos del embalaje</h2>
        </div>
        <ul className="space-y-2">
          {conFotos.map((grupo) => (
            <li key={grupo.id} className="rounded-lg border border-border bg-muted/30 p-2.5">
              <p className="break-words text-sm font-medium text-foreground">{grupo.producto}</p>
              {grupo.llegada.length > 0 ? (
                // Comparación lado a lado: cómo salió y cómo llegó.
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Columna titulo="Salió así" fotos={grupo.fotos} />
                  <Columna titulo="Llegó así" fotos={grupo.llegada} />
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {grupo.fotos.map((foto) => (
                    <FotoTile key={foto.id} foto={foto} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

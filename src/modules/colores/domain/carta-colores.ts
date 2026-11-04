// Reglas puras de la carta de colores (cueros y telas). Sin base de datos ni imports con "@/".

export type ColorGrupo = "CUERO" | "TELA";

export type MaterialCarta = { id: string; nombre: string; grupo: ColorGrupo; orden: number; oculto: boolean };
export type ColorCarta = {
  id: string;
  materialId: string;
  codigo: string;
  nombre: string;
  hex?: string | null;
  fotoUrl?: string | null;
  oculto: boolean;
  orden: number;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Errores en español; lista vacía = el color es válido. */
export function validarColor(input: { codigo: string; nombre: string; hex?: string | null }): string[] {
  const errores: string[] = [];
  const codigo = input.codigo ?? "";
  if (codigo.trim().length === 0) errores.push("El código es obligatorio");
  else if (codigo !== codigo.trim()) errores.push("El código no puede empezar ni terminar con espacios");
  else if (codigo.length > 10) errores.push("El código debe tener máximo 10 caracteres");

  const nombre = (input.nombre ?? "").trim();
  if (nombre.length < 2 || nombre.length > 60) errores.push("El nombre debe tener entre 2 y 60 caracteres");

  if (input.hex && !HEX.test(input.hex)) errores.push("El color de muestra debe ser como #A1B2C3");
  return errores;
}

export function etiquetaColor(material: { nombre: string }, color: { codigo: string; nombre: string }): string {
  return `${material.nombre} ${color.codigo} · ${color.nombre}`;
}

export function mensajeWhatsAppColor(material: { nombre: string }, color: { codigo: string; nombre: string }): string {
  return `Hola, me gustó el color ${material.nombre} ${color.codigo} ${color.nombre}`;
}

export type GrupoCartaPublica = {
  grupo: ColorGrupo;
  titulo: string;
  materiales: (MaterialCarta & { colores: ColorCarta[] })[];
};

const GRUPOS: { grupo: ColorGrupo; titulo: string }[] = [
  { grupo: "CUERO", titulo: "Cueros" },
  { grupo: "TELA", titulo: "Telas" },
];

// Orden natural: "2" antes de "10" (los códigos son números, a veces con ceros).
const compararCodigo = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true });

/** Carta para la tienda: Cueros y Telas, sin nada oculto, en orden. */
export function agruparCartaPublica(materiales: MaterialCarta[], colores: ColorCarta[]): GrupoCartaPublica[] {
  const visibles = materiales.filter((m) => !m.oculto).sort((a, b) => a.orden - b.orden);
  return GRUPOS.map(({ grupo, titulo }) => ({
    grupo,
    titulo,
    materiales: visibles
      .filter((m) => m.grupo === grupo)
      .map((m) => ({
        ...m,
        colores: colores
          .filter((c) => c.materialId === m.id && !c.oculto)
          .sort((a, b) => a.orden - b.orden || compararCodigo(a.codigo, b.codigo)),
      })),
  })).filter((g) => g.materiales.length > 0);
}

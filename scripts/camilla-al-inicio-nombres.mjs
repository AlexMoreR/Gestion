// Cambio de UNA SOLA VEZ (nov-2026): 6 camillas cuyo nombre no empieza por "CAMILLA". Solo el campo
// `name`: nunca precio, codigo, enlace (slug), descripcion ni SEO.
//
// Parte 1: solo la regla pura y el texto que se imprime. Todavia no se conecta a la base.

// Tabla fija con el nombre de hoy y el nuevo. CAV006 lleva "3" (no "TRES") para no quedar igual
// que el CAV008 "CAMILLA TRES CUERPOS CON CAJONES".
export const RENOMBRES = [
  { codigo: "CAV004", antes: "2 CUERPOS OVAL", nuevo: "CAMILLA 2 CUERPOS OVAL" },
  { codigo: "CAV005", antes: "3 CUERPOS BRAZOS CORTOS", nuevo: "CAMILLA 3 CUERPOS BRAZOS CORTOS" },
  { codigo: "CAV015", antes: "3 CUERPOS CON BRAZOS", nuevo: "CAMILLA 3 CUERPOS CON BRAZOS" },
  { codigo: "CAV007", antes: "3 CUERPOS TATOOT", nuevo: "CAMILLA 3 CUERPOS TATTOO" },
  { codigo: "CAV009", antes: "EN MADERA CABECERO", nuevo: "CAMILLA EN MADERA CABECERO" },
  { codigo: "CAV006", antes: "TRES CUERPOS CON CAJONES", nuevo: "CAMILLA 3 CUERPOS CON CAJONES" },
];

/**
 * Regla pura: con los productos de hoy ({ id, code, name }) dice que cambia y que se salta.
 * Solo cambia si el nombre de hoy (sin espacios en los extremos) es exactamente `antes`.
 * @returns {{ cambios: { id: string, codigo: string, actual: string, nuevo: string }[], saltados: { codigo: string, motivo: string }[] }}
 */
export function planearCamilla(productos) {
  const cambios = [];
  const saltados = [];
  for (const { codigo, antes, nuevo } of RENOMBRES) {
    const producto = productos.find((p) => p.code === codigo);
    if (!producto) {
      saltados.push({ codigo, motivo: "no existe ese código" });
      continue;
    }
    const actual = String(producto.name ?? "").trim();
    if (actual === nuevo) {
      saltados.push({ codigo, motivo: "ya tiene el nombre nuevo" });
      continue;
    }
    if (actual !== antes) {
      saltados.push({ codigo, motivo: `tiene otro nombre ("${actual}")` });
      continue;
    }
    cambios.push({ id: producto.id, codigo, actual, nuevo });
  }
  return { cambios, saltados };
}

/** Lineas que se imprimen: "CODIGO: actual → nuevo" y los saltados con su motivo. */
export function lineasDelPlan({ cambios, saltados }, aplicar) {
  return [
    aplicar ? "APLICAR: se escriben los nombres nuevos." : "SIMULACION: no se escribe nada (usa --aplicar --tarjeta T-xxx).",
    ...cambios.map((c) => `  ${c.codigo}: "${c.actual}" → "${c.nuevo}"`),
    ...saltados.map((s) => `  ${s.codigo}: se salta, ${s.motivo}`),
  ];
}

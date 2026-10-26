import { randomInt } from "node:crypto";

// Codigo de acceso a /dudas: 6 caracteres faciles de dictar por WhatsApp o por telefono.
// Sin letras ni numeros que se confunden: 0/O, 1/I/L. Mayusculas (al escribirlo da igual).
export const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LARGO_CODIGO = 6;

export function generarCodigoAcceso(aleatorio: (max: number) => number = randomInt): string {
  let codigo = "";
  for (let i = 0; i < LARGO_CODIGO; i += 1) {
    codigo += ALFABETO_CODIGO[aleatorio(ALFABETO_CODIGO.length)];
  }
  return codigo;
}

// Lo que escribe la persona: sin espacios ni guiones, en mayusculas.
export function normalizarCodigo(valor: string): string {
  return valor.toUpperCase().replace(/[\s-]+/g, "");
}

export function esCodigoBienFormado(codigo: string): boolean {
  if (codigo.length !== LARGO_CODIGO) return false;
  for (const letra of codigo) {
    if (!ALFABETO_CODIGO.includes(letra)) return false;
  }
  return true;
}

// Para mostrarlo al crear: "ABC 234" se dicta mas facil.
export function formatearCodigo(codigo: string): string {
  return `${codigo.slice(0, 3)} ${codigo.slice(3)}`;
}

// Nombre de la persona: 2..60 caracteres, espacios colapsados.
export function limpiarNombre(valor: string): string {
  return valor.replace(/\s+/g, " ").trim().slice(0, 60);
}

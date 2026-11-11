// Grupos del menú lateral (solo cómo se ordena y agrupa; qué módulos ve cada rol lo decide el acceso).
import type { LucideIcon } from "lucide-react";

export type NavSection<T> = { title?: string; icon?: LucideIcon; items: T[] };

type GrupoMenu = { title?: string; icon?: LucideIcon; urls: string[] };

// Con esta cantidad de opciones o menos, todo va suelto (a un clic).
export const MAX_SUELTAS = 6;

// Ordena las opciones por grupo. Con MAX_SUELTAS o menos, todas sueltas; si no, en grupos, y un grupo
// con una sola opción para este usuario va suelto. Una opción que no esté en ningún grupo va al final, suelta.
export function agruparMenu<T extends { url: string }>(items: T[], grupos: GrupoMenu[]): NavSection<T>[] {
  const usadas = new Set<T>();
  const porGrupo = grupos.map((grupo) => {
    const del = grupo.urls.flatMap((url) => items.filter((item) => item.url === url && !usadas.has(item)));
    del.forEach((item) => usadas.add(item));
    return { title: grupo.title, icon: grupo.icon, items: del };
  });
  const sueltas = items.filter((item) => !usadas.has(item));
  const conOpciones: NavSection<T>[] = [...porGrupo, { items: sueltas }].filter((seccion) => seccion.items.length > 0);
  if (items.length <= MAX_SUELTAS) {
    return [{ items: conOpciones.flatMap((seccion) => seccion.items) }];
  }
  return conOpciones.map((seccion) =>
    seccion.title && seccion.items.length > 1 ? seccion : { items: seccion.items },
  );
}

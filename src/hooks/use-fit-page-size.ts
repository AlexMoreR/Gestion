"use client";

import * as React from "react";

// Calcula cuantos elementos caben en la pantalla para paginar sin dejar espacio
// en blanco: mide desde donde empieza la lista hasta el borde inferior de la
// ventana (descontando el paginador y los margenes del panel) y deduce
// columnas x filas. Se recalcula al cambiar el tamano de la ventana o el ancho
// de la lista (p. ej. al plegar el menu lateral).
//
// Dentro de `areaRef` cada vista posible es un "marco" con atributos:
//   data-fit-frame                 marca el marco (se usa el que este visible)
//   data-fit-gap="12"              separacion vertical entre filas (px)
//   data-fit-min-column="280"      ancho minimo de columna (si no hay: 1 columna)
//   data-fit-row-height="112"      alto fijo de fila (si no hay: se mide [data-fit-item])
//   data-fit-fallback="53"         alto de fila si todavia no hay filas para medir
//   data-fit-stretch               estira las filas para llenar la pantalla justa
// Un [data-fit-header] visible dentro del marco (p. ej. el encabezado de la
// tabla) se descuenta del alto disponible.

export type FitPageSize = {
  pageSize: number;
  columns: number;
  // Alto de fila a aplicar cuando el marco pide estirarse (null = natural).
  rowHeight: number | null;
};

const MAX_STRETCH = 1.5;
const SAFETY_PX = 4;

function isVisible(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.offsetParent !== null;
}

function numberAttr(element: HTMLElement, name: string): number | null {
  const raw = element.getAttribute(name);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// Espacio que dejan los contenedores por debajo de la lista (paddings, bordes y
// margenes inferiores de los ancestros).
function bottomChrome(element: HTMLElement): number {
  let total = 0;
  let node = element.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    total +=
      (parseFloat(style.paddingBottom) || 0) +
      (parseFloat(style.borderBottomWidth) || 0) +
      (parseFloat(style.marginBottom) || 0);
    node = node.parentElement;
  }
  return total;
}

export function useFitPageSize(
  areaRef: React.RefObject<HTMLElement | null>,
  footerRef: React.RefObject<HTMLElement | null>,
  options: { defaultPageSize: number; recomputeKey: string },
): FitPageSize {
  const [state, setState] = React.useState<FitPageSize>({
    pageSize: options.defaultPageSize,
    columns: 1,
    rowHeight: null,
  });

  const compute = React.useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const frame = Array.from(area.querySelectorAll("[data-fit-frame]")).find(isVisible);
    if (!frame) return; // sin elementos que medir: se conserva el calculo anterior

    const areaRect = area.getBoundingClientRect();
    const footer = footerRef.current;
    const footerSpace = footer
      ? Math.max(0, footer.getBoundingClientRect().top - areaRect.bottom) + footer.offsetHeight
      : 0;
    const top = areaRect.top + window.scrollY;
    const header = Array.from(frame.querySelectorAll("[data-fit-header]")).find(isVisible);
    const available =
      window.innerHeight - top - footerSpace - bottomChrome(area) - (header?.offsetHeight ?? 0) - SAFETY_PX;

    const gap = numberAttr(frame, "data-fit-gap") ?? 0;
    const minColumn = numberAttr(frame, "data-fit-min-column");
    const columns = minColumn ? Math.max(1, Math.floor((frame.clientWidth + gap) / (minColumn + gap))) : 1;

    const fixedRow = numberAttr(frame, "data-fit-row-height");
    const measuredRow = Math.max(
      0,
      ...Array.from(frame.querySelectorAll("[data-fit-item]"))
        .filter(isVisible)
        .map((item) => item.offsetHeight),
    );
    const baseRow = fixedRow ?? (measuredRow > 0 ? measuredRow : numberAttr(frame, "data-fit-fallback") ?? 56);

    const rows = Math.max(1, Math.floor((available + gap) / (baseRow + gap)));

    let rowHeight: number | null = null;
    if (frame.hasAttribute("data-fit-stretch") && fixedRow) {
      const stretched = Math.floor((available - (rows - 1) * gap) / rows);
      rowHeight = stretched > fixedRow && stretched <= fixedRow * MAX_STRETCH ? stretched : fixedRow;
    }

    const next = { pageSize: columns * rows, columns, rowHeight };
    setState((current) =>
      current.pageSize === next.pageSize && current.columns === next.columns && current.rowHeight === next.rowHeight
        ? current
        : next,
    );
  }, [areaRef, footerRef]);

  // Ventana y ancho de la lista. Se calcula enseguida y otra vez al terminar de
  // cambiar el tamano: un cambio brusco (maximizar, girar el celular) puede
  // avisar antes de que el navegador termine de acomodar la pagina.
  React.useEffect(() => {
    let frameId = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      cancelAnimationFrame(frameId);
      clearTimeout(settleTimer);
      frameId = requestAnimationFrame(compute);
      settleTimer = setTimeout(compute, 200);
    };
    window.addEventListener("resize", schedule);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (areaRef.current && observer) observer.observe(areaRef.current);
    schedule();
    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(settleTimer);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
    };
  }, [areaRef, compute]);

  // Cambio de vista o de contenido (p. ej. pasar de "sin resultados" a tener filas).
  React.useEffect(() => {
    const frameId = requestAnimationFrame(compute);
    return () => cancelAnimationFrame(frameId);
  }, [compute, options.recomputeKey]);

  return state;
}

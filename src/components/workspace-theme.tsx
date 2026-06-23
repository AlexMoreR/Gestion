"use client";

import { useEffect } from "react";

// Aplica el tema (claro/oscuro) SOLO mientras se esta dentro del sistema.
// Al desmontarse (salir del workspace hacia el sitio publico) restaura el claro,
// asi la pagina principal nunca queda en oscuro.
export function WorkspaceTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const stored = window.localStorage.getItem("theme");
    const theme = stored ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    return () => {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    };
  }, []);

  return null;
}

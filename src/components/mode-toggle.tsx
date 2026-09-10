"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "theme";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }

  const stored = window.localStorage.getItem(STORAGE_KEY) as "light" | "dark" | null;
  // Por defecto SIEMPRE claro (aunque el dispositivo este en oscuro). Solo se
  // usa oscuro si la persona lo eligio a proposito.
  return stored ?? "light";
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ModeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
      title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
      className={cn("relative text-muted-foreground hover:text-foreground", className)}
      suppressHydrationWarning
    >
      {theme === "dark" ? <Sun className="size-[1.15rem]" /> : <Moon className="size-[1.15rem]" />}
    </Button>
  );
}

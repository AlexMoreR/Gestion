// Validación pura del número de WhatsApp (sin base ni servidor: la usan los ajustes y el MCP, y se prueba con Vitest).
export function normalizeWhatsAppPhone(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (!/^[+\d\s()-]+$/.test(normalized)) {
    return null;
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  return normalized;
}

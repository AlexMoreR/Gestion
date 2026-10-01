import { describe, expect, it } from "vitest";
import { extractApiKey, isValidApiKey } from "./auth";

const KEY = "llave-de-prueba-suficientemente-larga-123";

describe("llave del servidor MCP", () => {
  it("lee la llave de Authorization Bearer o de x-api-key", () => {
    expect(extractApiKey(new Headers({ authorization: `Bearer ${KEY}` }))).toBe(KEY);
    expect(extractApiKey(new Headers({ "x-api-key": KEY }))).toBe(KEY);
    expect(extractApiKey(new Headers())).toBeNull();
  });

  it("acepta solo la llave exacta", () => {
    expect(isValidApiKey(KEY, KEY)).toBe(true);
    expect(isValidApiKey(`${KEY}x`, KEY)).toBe(false);
    expect(isValidApiKey(null, KEY)).toBe(false);
  });

  it("sin llave configurada o con una llave corta, nadie entra", () => {
    expect(isValidApiKey(KEY, undefined)).toBe(false);
    expect(isValidApiKey("", "")).toBe(false);
    expect(isValidApiKey("corta", "corta")).toBe(false);
  });
});

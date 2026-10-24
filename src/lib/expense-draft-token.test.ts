import { describe, expect, it } from "vitest";
import { buildDraftToken, hashDraftToken, verifyDraftToken } from "./expense-draft-token";

const KEY = "clave-de-prueba-0123456789";

describe("token del borrador de gasto", () => {
  it("un token recien armado se verifica", () => {
    const built = buildDraftToken(KEY);
    expect(built).not.toBeNull();
    expect(verifyDraftToken(built!.token, KEY)).toBe(built!.token);
    expect(built!.hash).toBe(hashDraftToken(built!.token));
  });

  it("rechaza una firma falsa o un token manipulado", () => {
    const built = buildDraftToken(KEY)!;
    const [random, signature] = built.token.split(".");
    expect(verifyDraftToken(`${random}.${"a".repeat(22)}`, KEY)).toBeNull();
    expect(verifyDraftToken(`${random}x.${signature}`, KEY)).toBeNull();
    expect(verifyDraftToken("basura", KEY)).toBeNull();
    expect(verifyDraftToken("", KEY)).toBeNull();
    expect(verifyDraftToken(null, KEY)).toBeNull();
  });

  it("rechaza si la clave del servidor es otra", () => {
    const built = buildDraftToken(KEY)!;
    expect(verifyDraftToken(built.token, "otra-clave-distinta-9876543210")).toBeNull();
  });

  it("sin clave no arma ni verifica", () => {
    expect(buildDraftToken("")).toBeNull();
    const built = buildDraftToken(KEY)!;
    expect(verifyDraftToken(built.token, "")).toBeNull();
  });

  it("el hash es estable y los tokens no se repiten", () => {
    expect(hashDraftToken("abc")).toBe(hashDraftToken("abc"));
    expect(hashDraftToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(buildDraftToken(KEY)!.token).not.toBe(buildDraftToken(KEY)!.token);
  });
});

import { describe, expect, it } from "vitest";
import { enCacheDeTienda } from "./storefront-cache";

describe("enCacheDeTienda", () => {
  it("fuera de Next (scripts, pruebas) lee directo y no falla", async () => {
    let llamadas = 0;
    const leer = enCacheDeTienda(async (clave: string) => {
      llamadas += 1;
      return `valor-${clave}`;
    }, "prueba");
    await expect(leer("a")).resolves.toBe("valor-a");
    expect(llamadas).toBe(1);
  });

  it("deja pasar los errores de la consulta", async () => {
    const leer = enCacheDeTienda(async () => {
      throw new Error("base caida");
    }, "prueba-error");
    await expect(leer()).rejects.toThrow("base caida");
  });
});

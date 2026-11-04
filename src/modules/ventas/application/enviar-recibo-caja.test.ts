import { describe, expect, it, vi } from "vitest";
import { dispararRecibo } from "./enviar-recibo-caja";

describe("dispararRecibo: el recibo nunca rompe la venta ni el abono", () => {
  it("dentro de una petición lo programa con after()", () => {
    const tarea = vi.fn(async () => undefined);
    const programar = vi.fn();
    dispararRecibo(tarea, programar);
    expect(programar).toHaveBeenCalledWith(tarea);
    expect(tarea).not.toHaveBeenCalled();
  });

  it("si after() da error (sin petición), la tarea corre igual y no sale error", async () => {
    const tarea = vi.fn(async () => undefined);
    const programar = () => {
      throw new Error("`after` was called outside a request scope");
    };
    expect(() => dispararRecibo(tarea, programar)).not.toThrow();
    expect(tarea).toHaveBeenCalledTimes(1);
  });

  it("una tarea que falla (rechaza o lanza) tampoco saca error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sinPeticion = () => {
      throw new Error("sin petición");
    };
    expect(() => dispararRecibo(() => Promise.reject(new Error("CRM caído")), sinPeticion)).not.toThrow();
    expect(() =>
      dispararRecibo(() => {
        throw new Error("lanza al arrancar");
      }, sinPeticion),
    ).not.toThrow();
    // Real (sin programar): fuera de una petición after() de Next lanza y cae al segundo plano.
    expect(() => dispararRecibo(async () => undefined)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

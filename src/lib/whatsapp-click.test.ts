import { describe, expect, it } from "vitest";
import { datosClicWhatsApp } from "./whatsapp-click";

describe("datosClicWhatsApp", () => {
  it("un enlace wa.me da el evento con su ubicación", () => {
    expect(
      datosClicWhatsApp("https://wa.me/573001112233?text=hola", "principal", null, "Cotizar", "/camillas/x"),
    ).toEqual({ ubicacion: "principal", pagina: "/camillas/x" });
  });

  it("un enlace a otra página da null", () => {
    expect(datosClicWhatsApp("https://magilus.com/catalogo", null, null, "Catálogo", "/")).toBeNull();
    expect(datosClicWhatsApp(null, "principal", null, null, "/")).toBeNull();
    expect(datosClicWhatsApp("https://magilus.com/?q=wa.me/", null, null, "x", "/")).toBeNull();
  });

  it("cuenta también api.whatsapp.com", () => {
    expect(datosClicWhatsApp("https://api.whatsapp.com/send?phone=57", null, null, "Escribir", "/")?.ubicacion).toBe(
      "Escribir",
    );
  });

  it("prioridad: data-cta, luego aria-label, luego texto", () => {
    const href = "https://wa.me/57";
    expect(datosClicWhatsApp(href, "barra", "Escríbenos por WhatsApp", "Hola", "/")?.ubicacion).toBe("barra");
    expect(datosClicWhatsApp(href, null, "Escríbenos por WhatsApp", "Hola", "/")?.ubicacion).toBe(
      "Escríbenos por WhatsApp",
    );
    expect(datosClicWhatsApp(href, "", "  ", "  Cotiza   aquí ", "/")?.ubicacion).toBe("Cotiza aquí");
    expect(datosClicWhatsApp(href, null, null, null, "/")?.ubicacion).toBe("sin_nombre");
  });

  it("corta un texto largo a 40 letras", () => {
    expect(datosClicWhatsApp("https://wa.me/57", null, null, "a".repeat(80), "/")?.ubicacion).toHaveLength(40);
  });

  it("la página sale sin la parte ?…", () => {
    expect(datosClicWhatsApp("https://wa.me/57", "x", null, null, "/cobertura?ref=1#mapa")?.pagina).toBe("/cobertura");
  });
});

import { describe, expect, it, vi } from "vitest";

// La funcion es pura: no se toca la base en estas pruebas.
vi.mock("./prisma", () => ({ prisma: {} }));

import { destinationCityLabel } from "./manufacturing-orders";

describe("destinationCityLabel", () => {
  it("une ciudad y departamento", () => {
    expect(destinationCityLabel({ city: " Ocaña ", department: "Norte de Santander " })).toBe(
      "Ocaña, Norte de Santander",
    );
  });

  it("devuelve solo la ciudad si falta el departamento", () => {
    expect(destinationCityLabel({ city: "Cali", department: null })).toBe("Cali");
  });

  it("devuelve solo el departamento si falta la ciudad", () => {
    expect(destinationCityLabel({ city: "  ", department: "Valle del Cauca" })).toBe("Valle del Cauca");
  });

  it("devuelve null si los dos estan vacios o en blanco", () => {
    expect(destinationCityLabel({ city: "", department: "   " })).toBeNull();
    expect(destinationCityLabel({})).toBeNull();
  });

  it("devuelve null sin cliente", () => {
    expect(destinationCityLabel(null)).toBeNull();
    expect(destinationCityLabel(undefined)).toBeNull();
  });
});

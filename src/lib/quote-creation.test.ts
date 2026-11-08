import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { upsertQuoteClient, type QuoteClientData } from "./quote-creation";

const user = {
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
};
const db = { user } as unknown as PrismaClient;

const base: QuoteClientData = {
  name: "Clienta Nueva",
  phone: "3001234567",
  address: "Calle 1",
  city: "Cali",
};

describe("upsertQuoteClient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Simula a otro cliente que ya tiene cualquier dato que se busque.
    user.findUnique.mockResolvedValue(null);
    user.findFirst.mockResolvedValue({ id: "existente" });
    user.update.mockResolvedValue({ id: "existente" });
    user.create.mockResolvedValue({ id: "nuevo" });
  });

  it("documento 'Sin confirmar' crea un cliente sin tocar la ficha de otro", async () => {
    await expect(upsertQuoteClient(db, { ...base, document: "Sin confirmar" })).resolves.toBe("nuevo");
    expect(user.findFirst).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
  });

  it("telefono 'Sin confirmar' sin documento crea un cliente", async () => {
    await expect(upsertQuoteClient(db, { ...base, phone: "Sin confirmar" })).resolves.toBe("nuevo");
    expect(user.findFirst).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
  });

  it("documento real existente reutiliza al cliente", async () => {
    await expect(upsertQuoteClient(db, { ...base, document: "1144000111" })).resolves.toBe("existente");
    expect(user.findFirst).toHaveBeenCalledWith({ where: { role: "CLIENTE", document: "1144000111" } });
    expect(user.create).not.toHaveBeenCalled();
  });

  it("telefono real sin documento reutiliza al cliente", async () => {
    await expect(upsertQuoteClient(db, base)).resolves.toBe("existente");
    expect(user.findFirst).toHaveBeenCalledWith({ where: { role: "CLIENTE", phone: "3001234567" } });
    expect(user.create).not.toHaveBeenCalled();
  });
});

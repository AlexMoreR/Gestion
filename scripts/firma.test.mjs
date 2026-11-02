import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { firmar, leerTarjeta } from "./firma.mjs";

const SCRIPT = fileURLToPath(new URL("./reparar-ord-00092.mjs", import.meta.url));

describe("firma de scripts", () => {
  it("lee la tarjeta en sus dos formas y rechaza lo que no es T-xxx", () => {
    expect(leerTarjeta(["--aplicar", "--tarjeta", "T-nryjt6n9"])).toBe("T-nryjt6n9");
    expect(leerTarjeta(["--tarjeta=T-12ab"])).toBe("T-12ab");
    expect(leerTarjeta(["--aplicar"])).toBeNull();
    expect(leerTarjeta(["--tarjeta", "--aplicar"])).toBeNull();
    expect(leerTarjeta(["--tarjeta", "T-x;rm"])).toBeNull();
  });

  it("sin --tarjeta, el script con --aplicar se niega antes de conectarse a la base", () => {
    // Base inalcanzable a proposito: si llegara a conectarse, el error seria otro.
    const run = spawnSync(process.execPath, [SCRIPT, "--aplicar"], {
      env: { ...process.env, DATABASE_URL: "postgresql://nadie:nada@127.0.0.1:1/no_usar" },
      encoding: "utf8",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Falta --tarjeta T-xxx");
    expect(run.stdout).toBe("");
  });

  it("la fila de firma lleva origin SCRIPT, la tarjeta y el commit", async () => {
    process.env.GIT_COMMIT = "abc1234";
    let data;
    await firmar({ activityLog: { create: async (args) => (data = args.data) } }, {
      script: "reparar-ord-00092",
      tarjeta: "T-1",
      resumen: "Reparó la ORD-00092",
    });
    expect(data).toMatchObject({
      actorId: null,
      actorName: "Script reparar-ord-00092",
      origin: "SCRIPT",
      ticket: "T-1",
      commitSha: "abc1234",
      summary: "Reparó la ORD-00092",
    });
    delete process.env.GIT_COMMIT;
  });
});

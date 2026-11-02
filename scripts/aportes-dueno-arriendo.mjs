// Correccion de UNA SOLA VEZ (nov-2026): el arriendo de octubre (gasto cmvt1s4es005d2ho4x8jr8kle,
// $1.000.000) lo pago Alexander con su plata, pero quedo registrado en la cuenta "1-Bancolombia".
// Que hace: pasa ese gasto a la cuenta "Aportes del dueño" (OWNER). Sigue contando para la
// ganancia; solo deja de bajar el saldo de 1-Bancolombia.
//
// POR DEFECTO ES SIMULACION: verifica el gasto y muestra el saldo de 1-Bancolombia antes y despues.
// Con --aplicar, en una transaccion: crea la cuenta OWNER si falta, cambia SOLO el accountId del
// gasto y deja una fila en ActivityLog con la cuenta anterior (id y nombre) para poder devolverlo.
// No borra nada. Si algo no cuadra (no existe, otro monto, otra cuenta) se detiene sin escribir.
// Ojo: --aplicar en produccion solo con el si de Alexander, despues de comparar el saldo de
// 1-Bancolombia con el extracto.
//
// Uso (desde la raiz del repo, con DATABASE_URL en el entorno o en .env):
//   npm run aportes:arriendo                  # simulacion
//   npm run aportes:arriendo -- --aplicar     # escribe (pedir aprobacion antes)
// Corre con vite-node y scripts/vite-node.config.mjs (alias "@/" y "server-only").

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createPrismaBalancesRepository } from "../src/modules/balances/infrastructure/prisma-balances-repository";

const GASTO_ID = "cmvt1s4es005d2ho4x8jr8kle";
const MONTO = 1000000;
const CUENTA_ACTUAL = "1-Bancolombia";
const CUENTA_DUENO = "Aportes del dueño";
const CANDADO_CUENTA_DUENO = 7300212027; // el mismo de ensureOwnerAccount

const pesos = (valor) => `$${Math.round(Number(valor)).toLocaleString("es-CO")}`;

async function saldoBancolombia(repository, cuentaId) {
  const saldo = await repository.getAccountBalance(cuentaId);
  if (!saldo) throw new Error(`No se pudo calcular el saldo de ${CUENTA_ACTUAL}.`);
  return saldo.balance;
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL (en el entorno o en .env).");
    process.exitCode = 1;
    return;
  }
  console.log(aplicar ? "MODO APLICAR: se escribe en la base." : "SIMULACION: no se escribe nada.");

  const gasto = await prisma.expense.findUnique({
    where: { id: GASTO_ID },
    select: {
      id: true,
      amount: true,
      expenseDate: true,
      description: true,
      category: { select: { name: true } },
      account: { select: { id: true, name: true, type: true } },
    },
  });
  if (!gasto) return detener(`No existe el gasto ${GASTO_ID}.`);
  if (Number(gasto.amount) !== MONTO) return detener(`El gasto vale ${pesos(gasto.amount)}, no ${pesos(MONTO)}.`);
  if (gasto.account.name !== CUENTA_ACTUAL) {
    return detener(`El gasto está en la cuenta "${gasto.account.name}", no en "${CUENTA_ACTUAL}".`);
  }
  console.log(
    `Gasto ${gasto.id}: ${gasto.category.name} · ${pesos(gasto.amount)} · ${gasto.expenseDate.toISOString().slice(0, 10)}` +
      ` · cuenta "${gasto.account.name}" (${gasto.account.id})${gasto.description ? ` · ${gasto.description}` : ""}`,
  );

  const cuentaDueno = await prisma.account.findFirst({
    where: { OR: [{ type: "OWNER" }, { name: CUENTA_DUENO }] },
    select: { id: true, name: true, type: true },
  });
  if (cuentaDueno && cuentaDueno.type !== "OWNER") {
    return detener(`Ya hay una cuenta "${cuentaDueno.name}" que no es del dueño (tipo ${cuentaDueno.type}).`);
  }
  console.log(cuentaDueno ? `Cuenta del dueño: "${cuentaDueno.name}" (${cuentaDueno.id}).` : `La cuenta "${CUENTA_DUENO}" no existe: se crearía.`);

  const repository = createPrismaBalancesRepository();
  const antes = await saldoBancolombia(repository, gasto.account.id);
  console.log(`Saldo de ${CUENTA_ACTUAL} antes: ${pesos(antes)}`);

  if (!aplicar) {
    console.log(`Saldo de ${CUENTA_ACTUAL} después (simulado): ${pesos(antes + MONTO)}`);
    console.log("Para escribir: npm run aportes:arriendo -- --aplicar (solo con el sí de Alexander).");
    return;
  }

  const creador = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!creador) return detener("No hay ningún usuario ADMIN para crear la cuenta del dueño.");

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CANDADO_CUENTA_DUENO})`);
    // Se vuelve a leer dentro de la transaccion: si alguien lo movio entre tanto, no se toca.
    const actual = await tx.expense.findUnique({ where: { id: GASTO_ID }, select: { accountId: true } });
    if (actual?.accountId !== gasto.account.id) throw new Error("El gasto cambió de cuenta mientras corría el script.");
    const dueno =
      (await tx.account.findFirst({ where: { type: "OWNER" }, select: { id: true, name: true } })) ??
      (await tx.account.create({
        data: { name: CUENTA_DUENO, type: "OWNER", openingBalance: 0, isActive: true, createdById: creador.id },
        select: { id: true, name: true },
      }));
    await tx.expense.update({ where: { id: GASTO_ID }, data: { accountId: dueno.id } });
    await tx.activityLog.create({
      data: {
        actorId: null,
        actorName: "Script aportes:arriendo",
        action: "UPDATE",
        entityType: "Expense",
        entityId: GASTO_ID,
        summary:
          `Pasó el gasto ${GASTO_ID} (${pesos(MONTO)}) de la cuenta "${gasto.account.name}" (${gasto.account.id})` +
          ` a "${dueno.name}" (${dueno.id}). Para devolverlo: accountId = ${gasto.account.id}.`,
      },
    });
  });

  const despues = await saldoBancolombia(repository, gasto.account.id);
  console.log(`Listo. Saldo de ${CUENTA_ACTUAL} después: ${pesos(despues)}`);
}

function detener(mensaje) {
  console.error(`Se detiene sin escribir: ${mensaje}`);
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

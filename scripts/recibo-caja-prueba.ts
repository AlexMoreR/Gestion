// Prueba del recibo de caja al CRM (nov-2026), para que el dueño lo vea antes de que salga a clientes.
// Arma el recibo del último abono (sin retención en la fuente) de una venta y guarda el PDF en un
// archivo. POR DEFECTO NO MANDA NADA. Con --aplicar --tarjeta T-xxx lo manda al CRM (hoy en modo
// PRUEBA: solo le llega al dueño). Nunca escribe en la base (no marca el abono).
//
// Uso (desde la raíz, con DATABASE_URL y la llave CRM_API_KEY en el entorno o en .env):
//   npm run recibo:prueba -- --venta=SAL-123                          # solo el PDF
//   npm run recibo:prueba -- --venta=SAL-123 --aplicar --tarjeta T-xx # además lo manda al CRM
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { exigirTarjeta } from "./firma.mjs";

async function main() {
  const tarjeta = exigirTarjeta(process.argv); // antes de conectarse: con --aplicar y sin tarjeta, se niega
  const venta = process.argv.find((arg) => arg.startsWith("--venta="))?.slice("--venta=".length).trim();
  if (!venta) {
    console.error("Falta --venta=SAL-123.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL (en el entorno o en .env).");
    process.exitCode = 1;
    return;
  }

  const { prisma } = await import("../src/lib/prisma");
  const { storedCodeCandidates } = await import("../src/lib/code-display");
  const { prismaReciboCajaPuertos } = await import("../src/modules/ventas/infrastructure/prisma-recibo-caja");
  const { armarReciboCaja } = await import("../src/modules/ventas/domain/recibo-caja");
  const { armarCuerpoRecibo, postReciboAlCrm, reciboCajaUrl } = await import("../src/modules/ventas/application/enviar-recibo-caja");

  try {
    const sale = await prisma.sale.findFirst({
      where: { code: { in: storedCodeCandidates(venta) } },
      select: { id: true, code: true },
    });
    if (!sale) {
      console.error(`No existe la venta ${venta}.`);
      process.exitCode = 1;
      return;
    }
    const datosVenta = await prismaReciboCajaPuertos.cargarVenta(sale.id);
    const ultimo = datosVenta?.pagos.filter((pago) => !pago.isWithholding).at(-1);
    const datos = datosVenta && ultimo ? armarReciboCaja(datosVenta, [ultimo.id]) : null;
    if (!datos) {
      console.error(`La venta ${venta} no tiene abonos del cliente.`);
      process.exitCode = 1;
      return;
    }
    const cuerpo = await armarCuerpoRecibo(datos);
    const archivo = path.resolve(cuerpo.nombreArchivo);
    await writeFile(archivo, Buffer.from(cuerpo.pdfBase64, "base64"));
    console.log(`PDF guardado en ${archivo}`);
    console.log({ ...cuerpo, pdfBase64: `${cuerpo.pdfBase64.slice(0, 12)}… (${cuerpo.pdfBase64.length} caracteres)` });

    if (!tarjeta) {
      console.log("Simulación: no se mandó nada al CRM. Con --aplicar --tarjeta T-xxx se manda.");
      return;
    }
    const ok = await postReciboAlCrm(cuerpo);
    console.log(ok ? `Enviado al CRM (${reciboCajaUrl()}), tarjeta ${tarjeta}.` : "El CRM no lo recibió (mira los errores de arriba).");
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

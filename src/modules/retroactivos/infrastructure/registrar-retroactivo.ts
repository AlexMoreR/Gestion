import { Prisma } from "@prisma/client";
import { fechaPuestaParaGuardar, type TipoRetroactivo } from "../domain/retroactivo";

export type RegistroRetroactivoInput = {
  tipo: TipoRetroactivo;
  registroId: string;
  fechaPuesta: string | Date;
  usuarioId: string;
  motivo: string;
  monto: number | Prisma.Decimal;
};

type Db = Pick<Prisma.TransactionClient, "registroRetroactivo">;

// El id de la sesion puede ser de un usuario que ya no existe (sesion vieja). Las llaves
// foraneas nuevas (abono.createdById, registro.usuarioId) fallarian: se verifica antes.
export async function usuarioExiste(db: Pick<Prisma.TransactionClient, "user">, id: string): Promise<boolean> {
  return (await db.user.count({ where: { id } })) > 0;
}

export const SESION_VENCIDA = "Tu sesion expiro. Cierra sesion e ingresa de nuevo.";

export function datosRegistroRetroactivo(input: RegistroRetroactivoInput): Prisma.RegistroRetroactivoUncheckedCreateInput {
  return {
    tipo: input.tipo,
    registroId: input.registroId,
    fechaPuesta: fechaPuestaParaGuardar(input.fechaPuesta),
    usuarioId: input.usuarioId,
    motivo: input.motivo,
    monto: new Prisma.Decimal(input.monto),
  };
}

// Se llama dentro de la misma transaccion que crea o edita el registro.
export async function registrarRetroactivos(db: Db, inputs: RegistroRetroactivoInput[]): Promise<void> {
  if (inputs.length === 0) return;
  await db.registroRetroactivo.createMany({ data: inputs.map(datosRegistroRetroactivo) });
}

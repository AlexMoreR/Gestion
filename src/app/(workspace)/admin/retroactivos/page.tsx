import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { formatMoney } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";
import {
  TIPO_RETROACTIVO_LABEL,
  diasDeAtraso,
  rangoMesBogota,
  type TipoRetroactivo,
} from "@/modules/retroactivos/domain/retroactivo";
import { resumirPorPersona } from "@/modules/retroactivos/domain/resumen";
import { displayCode } from "@/lib/code-display";

// Registros retroactivos: ventas, abonos y gastos con fecha de un dia anterior al dia real del
// registro. Solo el dueno/admin con acceso a Balances. Filtra por el mes del registro real.

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TIPOS: TipoRetroactivo[] = ["VENTA", "ABONO", "GASTO"];
const MAX_FILAS = 500;

function str(value: string | string[] | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function fechaHora(date: Date): string {
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dia(date: Date): string {
  return date.toLocaleDateString("es-CO", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });
}

export default async function AdminRetroactivosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (
    !session?.user?.id ||
    session.user.role !== "ADMIN" ||
    !(await hasAdminModuleAccess(session.user.id, session.user.role, "balances"))
  ) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const { valor: mes, desde, hasta } = rangoMesBogota(str(params.mes));
  const persona = str(params.persona);
  const tipoParam = str(params.tipo);
  const tipo = TIPOS.includes(tipoParam as TipoRetroactivo) ? (tipoParam as TipoRetroactivo) : null;

  const whereMes = { registradoEn: { gte: desde, lt: hasta }, ...(tipo ? { tipo } : {}) };

  const [currency, filas, conteos, personas] = await Promise.all([
    getSystemCurrency(),
    prisma.registroRetroactivo.findMany({
      where: { ...whereMes, ...(persona ? { usuarioId: persona } : {}) },
      orderBy: { registradoEn: "desc" },
      take: MAX_FILAS,
      select: {
        id: true,
        tipo: true,
        registroId: true,
        fechaPuesta: true,
        registradoEn: true,
        motivo: true,
        monto: true,
        usuario: { select: { name: true, email: true } },
      },
    }),
    prisma.registroRetroactivo.groupBy({
      by: ["usuarioId", "tipo"],
      where: whereMes,
      _count: { _all: true },
      _sum: { monto: true },
    }),
    prisma.user.findMany({
      where: { role: { not: "CLIENTE" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  // Enlace al registro: ventas y abonos llevan al listado de ventas filtrado por el codigo.
  const ventaIds = filas.filter((fila) => fila.tipo === "VENTA").map((fila) => fila.registroId);
  const abonoIds = filas.filter((fila) => fila.tipo === "ABONO").map((fila) => fila.registroId);
  const [ventas, abonos] = await Promise.all([
    ventaIds.length > 0
      ? prisma.sale.findMany({ where: { id: { in: ventaIds } }, select: { id: true, code: true } })
      : Promise.resolve([]),
    abonoIds.length > 0
      ? prisma.salePayment.findMany({
          where: { id: { in: abonoIds } },
          select: { id: true, sale: { select: { code: true } } },
        })
      : Promise.resolve([]),
  ]);
  const codigoPorRegistro = new Map<string, string>([
    ...ventas.map((venta) => [venta.id, venta.code] as [string, string]),
    ...abonos.map((abono) => [abono.id, abono.sale.code] as [string, string]),
  ]);

  const nombrePorId = new Map(personas.map((user) => [user.id, user.name ?? user.email]));
  const resumen = resumirPorPersona(
    conteos.map((conteo) => ({
      usuarioId: conteo.usuarioId,
      tipo: conteo.tipo,
      cantidad: conteo._count._all,
      monto: Number(conteo._sum.monto ?? 0),
    })),
  );

  const selectClass = "h-9 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground";

  return (
    <section className="w-full space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Registros retroactivos</h1>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Ventas, abonos y gastos registrados con una fecha anterior al día en que se cargaron (hora Colombia). El mes es el
          del registro real.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          Mes
          <input type="month" name="mes" defaultValue={mes} className={`${selectClass} block`} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Persona
          <select name="persona" defaultValue={persona} className={`${selectClass} block`}>
            <option value="">Todas</option>
            {personas.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name ?? user.email}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Tipo
          <select name="tipo" defaultValue={tipo ?? ""} className={`${selectClass} block`}>
            <option value="">Todos</option>
            {TIPOS.map((value) => (
              <option key={value} value={value}>
                {TIPO_RETROACTIVO_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
          Filtrar
        </button>
      </form>

      {resumen.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {resumen.map((item) => (
            <div key={item.usuarioId} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {nombrePorId.get(item.usuarioId) ?? "Usuario"}
                </p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{item.cantidad}</p>
              </div>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {TIPOS.filter((value) => item.porTipo[value].cantidad > 0).map((value) => (
                  <li key={value} className="flex justify-between gap-2">
                    <span>
                      {TIPO_RETROACTIVO_LABEL[value]} · {item.porTipo[value].cantidad}
                    </span>
                    <span className="tabular-nums">{formatMoney(item.porTipo[value].monto, currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card p-3">
        {filas.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No hay registros retroactivos en este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Registrado</th>
                  <th className="py-2 pr-3 font-medium">Persona</th>
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Fecha puesta</th>
                  <th className="py-2 pr-3 text-right font-medium">Días de atraso</th>
                  <th className="py-2 pr-3 text-right font-medium">Monto</th>
                  <th className="py-2 pr-3 font-medium">Motivo</th>
                  <th className="py-2 font-medium">Registro</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const codigo = codigoPorRegistro.get(fila.registroId);
                  const href =
                    fila.tipo === "GASTO" ? "/admin/gastos" : codigo ? `/admin/ventas?q=${encodeURIComponent(codigo)}` : null;
                  return (
                    <tr key={fila.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{fechaHora(fila.registradoEn)}</td>
                      <td className="py-2 pr-3">{fila.usuario.name ?? fila.usuario.email}</td>
                      <td className="py-2 pr-3">{TIPO_RETROACTIVO_LABEL[fila.tipo]}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{dia(fila.fechaPuesta)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{diasDeAtraso(fila.fechaPuesta, fila.registradoEn)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(Number(fila.monto), currency)}</td>
                      <td className="max-w-xs py-2 pr-3 text-muted-foreground">{fila.motivo}</td>
                      <td className="py-2 whitespace-nowrap">
                        {href ? (
                          <Link href={href} className="text-primary hover:underline">
                            {displayCode(codigo) ?? "Ver gastos"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Borrado</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filas.length === MAX_FILAS ? (
              <p className="pt-2 text-xs text-muted-foreground">Se muestran los {MAX_FILAS} más recientes. Filtra por persona o tipo.</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

import { redirect } from "next/navigation";
import { Save, Users } from "lucide-react";
import { auth } from "@/auth";
import {
  adminCreateSupplierAction,
} from "@/app/actions/catalog-actions";
import { adminUpdateCurrencyAction, adminUpdatePrimaryColorAction } from "@/app/actions/settings-actions";
import { CreateUserModal } from "@/components/admin/create-user-modal";
import { UsersDataTable } from "@/components/admin/users-data-table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency, getSystemPrimaryColor } from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminConfiguracionPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  const suppliers = await prisma.supplier.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { products: true } } },
  });

  const systemCurrency = await getSystemCurrency();
  const systemPrimaryColor = await getSystemPrimaryColor();

  return (
    <section className="w-full space-y-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl">Configuracion general</h1>
        <p className="text-[13px] leading-5 text-slate-600">
          Organiza ajustes del sistema, catalogo y usuarios desde un solo lugar.
        </p>
      </div>

      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Configuracion guardada"
        errorTitle="Error de configuracion"
      />

      <section className="space-y-3">
        <div className="grid gap-3">
          <Card className="space-y-3">
            <form action={adminUpdateCurrencyAction} className="flex flex-wrap items-end gap-2">
              <label className="min-w-64 flex-1 space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Moneda activa</span>
                <select name="currency" defaultValue={systemCurrency} className="field-select" required>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                aria-label="Guardar moneda"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
              >
                <Save className="h-4 w-4" />
              </button>
            </form>
            <form action={adminUpdatePrimaryColorAction} className="flex flex-wrap items-end gap-2">
              <label className="min-w-64 flex-1 space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Color primario</span>
                <div className="flex items-center gap-2">
                  <Input
                    name="primaryColor"
                    type="color"
                    defaultValue={systemPrimaryColor}
                    className="h-11 w-16 rounded-lg border border-[var(--line)] bg-white p-1"
                    required
                  />
                  <Input
                    value={systemPrimaryColor}
                    readOnly
                    className="h-11 flex-1 bg-slate-50 text-xs text-slate-600"
                  />
                </div>
              </label>
              <button
                type="submit"
                aria-label="Guardar color"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
              >
                <Save className="h-4 w-4" />
              </button>
            </form>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Catalogo base</h2>
          <p className="text-xs leading-5 text-slate-600">
            Gestiona proveedores. Las categorias ahora se administran desde la ruta dedicada de categorias.
          </p>
        </div>
        <div className="grid gap-3">
          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Proveedores</h3>
            <form action={adminCreateSupplierAction} className="space-y-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Nombre</span>
                <Input name="name" placeholder="Ej. Textiles Andina" required />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Correo (opcional)</span>
                  <Input name="email" type="email" placeholder="ventas@proveedor.com" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">Telefono (opcional)</span>
                  <Input name="phone" placeholder="+57 300..." />
                </label>
              </div>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Crear proveedor
              </button>
            </form>
            <div className="space-y-2">
              {suppliers.length === 0 ? (
                <p className="text-xs text-slate-500">Aun no hay proveedores.</p>
              ) : (
                suppliers.map((supplier) => (
                  <div
                    key={supplier.id}
                    className="rounded-lg border border-[var(--line)] bg-slate-50/70 px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-800">{supplier.name}</p>
                      <p className="text-xs text-slate-500">{supplier._count.products} producto(s)</p>
                    </div>
                    <p className="text-xs text-slate-500">
                      {supplier.email || "Sin correo"} - {supplier.phone || "Sin telefono"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4 text-slate-500" />
              Usuarios y accesos
            </h2>
            <p className="text-xs leading-5 text-slate-600">Crea cuentas y administra roles de todos los usuarios.</p>
          </div>
          <CreateUserModal />
        </div>
        <Card className="space-y-4">
          <UsersDataTable users={users} />
        </Card>
      </section>
    </section>
  );
}

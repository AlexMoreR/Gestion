import { redirect } from "next/navigation";
import { Pencil, Trash2, Users } from "lucide-react";
import { auth } from "@/auth";
import {
  adminCreateCategoryAction,
  adminCreateSupplierAction,
  adminDeleteCategoryAction,
  adminUpdateCategoryAction,
} from "@/app/actions/catalog-actions";
import { adminUpdateCurrencyAction } from "@/app/actions/settings-actions";
import { CreateUserModal } from "@/components/admin/create-user-modal";
import { UsersDataTable } from "@/components/admin/users-data-table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { getSystemCurrency } from "@/lib/system-settings";

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
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  const suppliers = await prisma.supplier.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { products: true } } },
  });
  const systemCurrency = await getSystemCurrency();

  return (
    <section className="w-full space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
            <Users className="h-4 w-4 text-slate-500" />
            <span>Usuarios</span>
          </h1>
          <p className="mt-0.5 text-[13px] leading-5 text-slate-600">
            Crea cuentas y administra roles de todos los usuarios.
          </p>
        </div>
        <CreateUserModal />
      </div>

      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Configuracion guardada"
        errorTitle="Error de configuracion"
      />

      <div className="space-y-3">
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Moneda del sistema</h2>
          <p className="text-xs leading-5 text-slate-600">
            Define la moneda global para visualizar precios en catalogo y administracion.
          </p>
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
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
            >
              Guardar moneda
            </button>
          </form>
        </Card>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Categorias</h2>
            <form action={adminCreateCategoryAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Nueva categoria</span>
                <Input name="name" placeholder="Ej. Camisas" required />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Logo (opcional)</span>
                <Input name="logo" type="file" accept="image/*" />
              </label>
              <button
                type="submit"
                className="mt-auto inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Crear
              </button>
            </form>
            <div className="space-y-2">
              {categories.length === 0 ? (
                <p className="text-xs text-slate-500">Aun no hay categorias.</p>
              ) : (
                categories.map((category) => (
                  <div
                    key={category.id}
                    className="space-y-3 rounded-xl border border-[var(--line)] bg-white px-3 py-3 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.35)]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        {category.logoUrl ? (
                          <img
                            src={category.logoUrl}
                            alt={`Logo ${category.name}`}
                            className="h-10 w-10 rounded-lg border border-[var(--line)] object-cover"
                          />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--line)] bg-slate-50 text-xs font-semibold text-slate-500">
                            {category.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{category.name}</p>
                          <p className="text-xs text-slate-500">/{category.slug}</p>
                        </div>
                      </div>
                      <p className="inline-flex rounded-full border border-[var(--line)] bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                        {category._count.products} producto(s)
                      </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <form action={adminUpdateCategoryAction} className="flex min-w-0 items-center gap-2">
                        <input type="hidden" name="categoryId" value={category.id} />
                        <Input
                          name="name"
                          defaultValue={category.name}
                          className="h-9 bg-white text-xs"
                          required
                        />
                        <button
                          type="submit"
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white transition hover:bg-slate-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                      </form>
                      <form action={adminDeleteCategoryAction}>
                        <input type="hidden" name="categoryId" value={category.id} />
                        <button
                          type="submit"
                          className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </button>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Proveedores</h2>
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
                      {supplier.email || "Sin correo"} · {supplier.phone || "Sin telefono"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <Card className="space-y-4">
          <UsersDataTable users={users} />
        </Card>
      </div>
    </section>
  );
}

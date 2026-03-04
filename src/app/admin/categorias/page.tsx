import { redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { auth } from "@/auth";
import { adminCreateCategoryAction, adminUpdateCategoryAction } from "@/app/actions/catalog-actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminCategoriasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <section className="w-full space-y-5">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 md:text-xl">Categorias</h1>
        <p className="text-[13px] leading-5 text-slate-600">Aqui puedes crear y editar categorias del catalogo.</p>
      </div>

      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Configuracion guardada"
        errorTitle="Error de configuracion"
      />

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Nueva categoria</h2>
        <form action={adminCreateCategoryAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Nombre</span>
            <Input name="name" placeholder="Ej. Camillas" required />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Logo (opcional)</span>
            <Input name="logo" type="file" accept="image/*" />
          </label>
          <button
            type="submit"
            className="mt-auto inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
          >
            Crear
          </button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Listado de categorias</h2>
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
              </div>
            ))
          )}
        </div>
      </Card>
    </section>
  );
}

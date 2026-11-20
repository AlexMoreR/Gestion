import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Images } from "lucide-react";
import { auth } from "@/auth";
import { ComboFotosColorEditor } from "@/components/admin/combo-fotos-color-editor";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { leerCartaColores } from "@/lib/carta-colores-crm.server";
import { prisma } from "@/lib/prisma";
import { leerRecargos, resolverPartes } from "@/lib/product-parts";
import { getPublicAssetUrl } from "@/lib/site";
import { esComboCamillas } from "@/modules/ventas/domain/combo-camillas";

type PageProps = { params: Promise<{ productId: string }> };

// Foto por color del combo camilla (nov-2026): la foto real de cada variante de color. Solo ADMIN con Productos.
export default async function FotosPorColorPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/unauthorized");
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "products");
  if (!canAccess || session.user.role !== "ADMIN") redirect("/unauthorized");

  const { productId } = await params;
  const partesSelect = {
    orderBy: { orden: "asc" as const },
    select: { nombre: true, tipo: true, materiales: true, acabados: true, recargos: true, coloresComunes: true, orden: true },
  };
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      code: true,
      partesColor: partesSelect,
      category: { select: { partesColor: partesSelect } },
      bundleComponents: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, quantity: true, child: { select: { name: true, code: true } } },
      },
      fotosColor: { orderBy: { etiqueta: "asc" }, select: { id: true, etiqueta: true, fotoUrl: true } },
    },
  });
  if (!product) notFound();

  const fichaHref = `/admin/productos/${product.id}`;
  const esCombo = esComboCamillas({ codigo: product.code });
  const partes = resolverPartes(product.category?.partesColor ?? [], product.partesColor).map((parte) => ({
    ...parte,
    recargos: leerRecargos(parte.recargos),
  }));
  const carta = esCombo ? await leerCartaColores() : null;

  return (
    <section className="w-full space-y-4">
      <div>
        <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
          <Images className="h-4 w-4 text-slate-500" />
          Fotos por color · {product.name}
        </h1>
        <p className="mt-0.5 text-[13px] leading-5 text-slate-600">
          La foto real del combo en cada combinación de colores. Solo se usa la foto si los colores de la cotización
          son exactamente los mismos; si no hay foto de ese color, no se usa ninguna.{" "}
          <Link href={fichaHref} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
            Volver a la ficha
          </Link>
        </p>
      </div>

      {!esCombo ? (
        <p className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-slate-700">
          Las fotos por color son solo del combo camilla.{" "}
          <Link href={fichaHref} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
            Ir a la ficha
          </Link>
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--line)] bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Partes del combo</h2>
            {product.bundleComponents.length === 0 ? (
              <p className="mt-1 text-sm text-slate-600">Este combo no tiene piezas cargadas en su ficha.</p>
            ) : (
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                {product.bundleComponents.map((pieza) => (
                  <li key={pieza.id}>
                    {pieza.quantity > 1 ? `${pieza.quantity} × ` : ""}
                    {pieza.child.name}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              {partes.length > 0
                ? `Cada variante se elige por parte de color: ${partes.map((parte) => parte.nombre).join(", ")}.`
                : "Este combo no tiene partes de color: cada variante es un solo color."}
              {carta && carta.origen !== "crm"
                ? carta.origen === "copia"
                  ? " No se pudo leer la carta del CRM: se muestra la última copia guardada."
                  : " No se pudo leer la carta del CRM: el color se puede escribir a mano."
                : ""}
            </p>
          </div>

          <ComboFotosColorEditor
            productId={product.id}
            partes={partes}
            carta={carta?.materiales ?? []}
            variantes={product.fotosColor.map((foto) => ({
              id: foto.id,
              etiqueta: foto.etiqueta,
              src: getPublicAssetUrl(foto.fotoUrl),
            }))}
          />
        </>
      )}
    </section>
  );
}

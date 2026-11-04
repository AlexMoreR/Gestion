import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Paintbrush } from "lucide-react";
import { auth } from "@/auth";
import { MascarasEditor } from "@/components/admin/mascaras-editor";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { medidaLienzo } from "@/lib/mascara-parte";
import { prisma } from "@/lib/prisma";
import { separarImagenes } from "@/lib/product-fichas";
import { resolverPartes } from "@/lib/product-parts";
import { leerImagen, medidasVisibles } from "@/lib/recolor-image.server";
import { getPublicAssetUrl } from "@/lib/site";

type PageProps = { params: Promise<{ productId: string }> };

// Máscaras de color (nov-2026): se pinta sobre la foto de portada qué zona es cada parte. Solo ADMIN.
export default async function MascarasDeColorPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/unauthorized");
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "products");
  if (!canAccess || session.user.role !== "ADMIN") redirect("/unauthorized");

  const { productId } = await params;
  const partesSelect = { orderBy: { orden: "asc" as const }, select: { nombre: true, mascaraUrl: true, orden: true } };
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      code: true,
      images: { orderBy: { order: "asc" }, select: { url: true, tipo: true } },
      partesColor: partesSelect,
      category: { select: { name: true, partesColor: partesSelect } },
    },
  });
  if (!product) notFound();

  const portada = separarImagenes(product.images).fotos[0] ?? null;
  const medidas = portada ? await leerImagen(portada.url).then(medidasVisibles).catch(() => null) : null;
  const partes = resolverPartes(product.category?.partesColor ?? [], product.partesColor);
  const heredadas = product.partesColor.length === 0 && partes.length > 0;
  const fichaHref = `/admin/productos/${product.id}`;

  let aviso: string | null = null;
  if (!portada) aviso = "Este producto no tiene foto de portada. Sube una en la ficha del producto.";
  else if (!medidas) aviso = "No se pudo leer la foto de portada. Revisa que esté guardada en la ficha del producto.";
  else if (partes.length === 0) aviso = "Este producto no tiene partes de color. Defínelas en la tarjeta «Partes de color» de la ficha.";

  return (
    <section className="w-full space-y-4">
      <div>
        <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
          <Paintbrush className="h-4 w-4 text-slate-500" />
          Máscaras de color · {product.name}
        </h1>
        <p className="mt-0.5 text-[13px] leading-5 text-slate-600">
          Pinta sobre la foto de portada la zona de cada parte (lo pintado es la parte; lo demás queda fuera). Con esto
          se podrá mostrar la foto con los colores elegidos.{" "}
          <Link href={fichaHref} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
            Volver a la ficha
          </Link>
        </p>
      </div>

      {aviso || !portada || !medidas ? (
        <p className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-slate-700">
          {aviso}{" "}
          <Link href={fichaHref} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
            Ir a la ficha
          </Link>
        </p>
      ) : (
        <MascarasEditor
          productId={product.id}
          fotoSrc={getPublicAssetUrl(portada.url)}
          lienzo={medidaLienzo(medidas.ancho, medidas.alto)}
          partes={partes.map((parte) => ({ nombre: parte.nombre, mascaraUrl: parte.mascaraUrl }))}
          categoriaNombre={heredadas ? (product.category?.name ?? "su categoría") : null}
        />
      )}
    </section>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ColoresWorkspace } from "@/components/admin/colores-workspace";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";
import { etiquetaColor } from "@/modules/colores/domain/carta-colores";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminColoresPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/unauthorized");
  }
  if (!(await hasAdminModuleAccess(session.user.id, session.user.role, "colores"))) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const materiales = await prisma.colorMaterial.findMany({
    orderBy: { orden: "asc" },
    include: { colores: { orderBy: { orden: "asc" } } },
  });

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Carta de colores"
        errorTitle="No se pudo guardar"
      />

      {/* key: con un aviso de "listo" se cierra el formulario; con error queda abierto para corregir. */}
      <ColoresWorkspace
        key={okMessage}
        materiales={materiales.map((material) => ({
          id: material.id,
          nombre: material.nombre,
          oculto: material.oculto,
          colores: material.colores
            // Mismo orden que la tienda: orden y luego código natural ("2" antes de "10").
            .sort((a, b) => a.orden - b.orden || a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
            .map((color) => ({
              id: color.id,
              codigo: color.codigo,
              nombre: color.nombre,
              hex: color.hex,
              fotoUrl: color.fotoUrl,
              oculto: color.oculto,
              etiqueta: etiquetaColor(material, color),
            })),
        }))}
      />
    </section>
  );
}

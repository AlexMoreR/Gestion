import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { auth } from "@/auth";
import { FichasBulkImport } from "@/components/admin/fichas-bulk-import";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";

// Carga en lote de fichas tecnicas (ProductImage.tipo = "ficha").
// Las imagenes se suben por la app, asi quedan en el mismo volumen que las fotos (magilus_uploads).
export default async function AdminFichasTecnicasPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/unauthorized");
  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "products");
  if (!canAccess) redirect("/unauthorized");

  return (
    <section className="w-full space-y-4">
      <div>
        <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
          <FileText className="h-4 w-4 text-slate-500" />
          Fichas técnicas en lote
        </h1>
        <p className="mt-0.5 text-[13px] leading-5 text-slate-600">
          Sube el CSV y las imágenes (cada una llamada como su driveFileId, por ejemplo 1kne5Sw6t_….jpg). Primero revisa
          la simulación; luego carga. Se puede repetir sin duplicar: salta las fichas que ya están. Las fichas nunca se
          usan como foto ni como portada.
        </p>
      </div>
      <FichasBulkImport />
    </section>
  );
}

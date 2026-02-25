import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Card } from "@/components/ui/card";

export default async function HomePage() {
  const session = await auth();
  const role = session?.user?.role;

  if (role === "ADMIN") redirect("/admin");
  if (role === "EMPLEADO") redirect("/empleado");
  if (role === "CLIENTE") redirect("/cliente");

  return (
    <section className="app-page grid min-h-[76vh] place-items-center">
      <Card className="max-w-3xl space-y-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
          Gestiona usuarios y permisos desde un solo panel
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-slate-600 md:text-base">
          Base de autenticacion con rutas por rol, seguridad en server actions y experiencia
          de administracion lista para escalar.
        </p>
      </Card>
    </section>
  );
}

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConfigTabs } from "@/components/admin/config-tabs";
import { CreateUserModal } from "@/components/admin/create-user-modal";
import { UsersDataTable } from "@/components/admin/users-data-table";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminConfiguracionUsuariosPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "config_users");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  // Solo el equipo del sistema. Los clientes (rol CLIENTE) se gestionan en el modulo Clientes.
  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "EMPLEADO"] } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Usuario actualizado"
        errorTitle="Error de usuarios"
      />

      <ConfigTabs action={<CreateUserModal />} />

      <Card className="space-y-4">
        <CardContent>
          <UsersDataTable users={users} />
        </CardContent>
      </Card>
    </section>
  );
}

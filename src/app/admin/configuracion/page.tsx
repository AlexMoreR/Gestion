import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { auth } from "@/auth";
import { CreateUserModal } from "@/components/admin/create-user-modal";
import { UsersDataTable } from "@/components/admin/users-data-table";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

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

      {okMessage && (
        <Card className="status-success py-3">
          <p className="text-sm font-medium">{okMessage}</p>
        </Card>
      )}
      {errorMessage && (
        <Card className="status-danger py-3">
          <p className="text-sm font-medium">{errorMessage}</p>
        </Card>
      )}

      <div>
        <Card className="space-y-4">
          <UsersDataTable users={users} />
        </Card>
      </div>
    </section>
  );
}

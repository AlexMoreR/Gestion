import { redirect } from "next/navigation";
import { Contact } from "lucide-react";
import { auth } from "@/auth";
import { ClientsDataTable } from "@/components/admin/clients-data-table";
import { Card, CardContent } from "@/components/ui/card";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminClientesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "clients");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const clients = await prisma.user.findMany({
    where: { role: "CLIENTE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      document: true,
      phone: true,
      city: true,
      createdAt: true,
      _count: { select: { quotesAsClient: true, ordersAsClient: true } },
    },
  });

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Cliente actualizado"
        errorTitle="Error de clientes"
      />

      <div>
        <h1 className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight md:text-xl">
          <Contact className="h-5 w-5 text-muted-foreground" />
          <span>Clientes</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Directorio de clientes. Se crean automaticamente al cotizar.
        </p>
      </div>

      <Card>
        <CardContent>
          <ClientsDataTable
            clients={clients.map((client) => ({
              id: client.id,
              name: client.name,
              email: client.email,
              document: client.document,
              phone: client.phone,
              city: client.city,
              quotesCount: client._count.quotesAsClient,
              ordersCount: client._count.ordersAsClient,
              createdAt: client.createdAt.toLocaleDateString("es-CO"),
            }))}
          />
        </CardContent>
      </Card>
    </section>
  );
}

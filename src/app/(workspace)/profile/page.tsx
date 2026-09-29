import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/auth/profile-form";
import { TeamManager, type TeamMember } from "@/components/auth/team-manager";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import {
  adminModuleDefinitions,
  EMPLOYEE_FORBIDDEN_MODULES,
  getStoredUserModuleAccessMap,
} from "@/lib/admin-module-access";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProfilePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, image: true, email: true, role: true },
  });

  if (!user) {
    redirect("/login");
  }

  const isAdmin = user.role === "ADMIN";
  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  // Datos de "Mi negocio > Equipos" (solo para el dueño/admin).
  let teamMembers: TeamMember[] = [];
  const forbidden = new Set(EMPLOYEE_FORBIDDEN_MODULES);
  const teamModules = adminModuleDefinitions
    .filter((moduleItem) => !forbidden.has(moduleItem.key))
    .map((moduleItem) => ({ key: moduleItem.key, label: moduleItem.label, group: moduleItem.group }));

  if (isAdmin) {
    const [members, accessMap] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ["ADMIN", "EMPLEADO"] } },
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
        select: { id: true, name: true, email: true, role: true },
      }),
      getStoredUserModuleAccessMap(),
    ]);
    teamMembers = members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role as "ADMIN" | "EMPLEADO",
      modules: accessMap[member.id] ?? [],
    }));
  }

  return (
    <section className="w-full space-y-8 py-3 md:py-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Listo"
        errorTitle="Hubo un problema"
      />

      <div className="w-full">
        <ProfileForm
          defaultName={user.name ?? ""}
          defaultImage={user.image ?? ""}
          email={user.email}
          role={user.role}
        />
      </div>

      {isAdmin ? (
        <div className="w-full space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Mi negocio</h2>
            <p className="text-sm text-muted-foreground">
              Administra tu equipo y los accesos a los módulos de gestión.
            </p>
          </div>
          <TeamManager members={teamMembers} modules={teamModules} returnTo="/profile" />
        </div>
      ) : null}
    </section>
  );
}

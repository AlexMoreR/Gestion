import type { ReactNode } from "react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { getAdminModuleAccess } from "@/lib/admin-module-access";
import { getSystemBrandName } from "@/lib/system-settings";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  const [brandName, adminModuleAccess] = await Promise.all([
    getSystemBrandName(),
    getAdminModuleAccess(session?.user?.id, session?.user?.role),
  ]);

  return (
    <AppShell
      initialUser={session?.user ?? null}
      brandName={brandName}
      adminModuleAccess={adminModuleAccess}
    >
      {children}
    </AppShell>
  );
}

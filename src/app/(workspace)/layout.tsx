import type { ReactNode } from "react";
import { auth } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { WorkspaceTheme } from "@/components/workspace-theme";
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
    <>
      {/* Aplica el tema guardado antes de pintar (sin parpadeo) solo en el sistema. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){}})();`,
        }}
      />
      <WorkspaceTheme />
      <AppShell
        initialUser={session?.user ?? null}
        brandName={brandName}
        adminModuleAccess={adminModuleAccess}
      >
        {children}
      </AppShell>
    </>
  );
}

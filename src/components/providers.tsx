"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

type ProvidersProps = {
  children: React.ReactNode;
  session: Session | null;
};

export function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider session={session}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster
        position="top-right"
        closeButton
        expand
        visibleToasts={4}
        toastOptions={{
          classNames: {
            toast: "app-sonner-toast",
            success: "app-sonner-success",
            error: "app-sonner-error",
            info: "app-sonner-info",
            title: "app-sonner-title",
            description: "app-sonner-description",
          },
        }}
      />
    </SessionProvider>
  );
}

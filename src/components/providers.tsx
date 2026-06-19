"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { TooltipProvider } from "@/components/ui/tooltip";

type ProvidersProps = {
  children: React.ReactNode;
  session: Session | null;
};

export function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider session={session}>
      <TooltipProvider>{children}</TooltipProvider>
      <ToastContainer
        position="top-right"
        autoClose={3500}
        limit={4}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        theme="colored"
      />
    </SessionProvider>
  );
}

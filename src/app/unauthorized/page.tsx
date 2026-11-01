import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Pantalla de cuenta y acceso: que Google no la indexe ni herede el canonical "/".
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
  alternates: { canonical: null },
};

export default function UnauthorizedPage() {
  return (
    <section className="app-page grid min-h-[70vh] place-items-center">
      <Card className="max-w-md space-y-4 border-[var(--danger-line)] text-center">
        <CardContent>
          <h1 className="text-2xl font-semibold">Sin autorizacion</h1>
          <p className="text-slate-600">
            No tienes permisos para acceder a esta ruta.
          </p>
          <Button className="w-full">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

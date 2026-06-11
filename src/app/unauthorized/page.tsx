import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <section className="app-page grid min-h-[70vh] place-items-center">
      <Card className="max-w-md space-y-4 border-[(--danger-line)] text-center">
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

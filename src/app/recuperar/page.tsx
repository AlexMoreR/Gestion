import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RecuperarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Recuperar contrasena</CardTitle>
          <CardDescription>
            Ingresa tu correo y te enviaremos un enlace para crear una nueva contrasena.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {okMessage ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {okMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="text-sm font-medium text-destructive">{errorMessage}</p>
          ) : null}

          <form action={requestPasswordResetAction} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Correo</span>
              <Input type="email" name="email" placeholder="correo@empresa.com" required />
            </label>
            <Button type="submit" className="w-full">
              Enviar enlace
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Volver a iniciar sesion
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

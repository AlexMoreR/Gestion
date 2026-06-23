import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/password-input";
import { verifyPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RestablecerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const payload = token ? verifyPasswordResetToken(token) : null;
  const user = payload
    ? await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true },
      })
    : null;

  const invalid = !payload || !user || user.email !== payload.email;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Restablecer contrasena</CardTitle>
          <CardDescription>
            {invalid
              ? "El enlace de recuperacion es invalido o expiro."
              : `Crea una nueva contrasena para ${user?.email}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invalid ? (
            <Link href="/recuperar" className="text-sm font-medium text-primary hover:underline">
              Solicitar un nuevo enlace
            </Link>
          ) : (
            <form action={resetPasswordAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              {errorMessage ? (
                <p className="text-sm font-medium text-destructive">{errorMessage}</p>
              ) : null}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Nueva contrasena</span>
                <PasswordInput name="password" placeholder="Minimo 8 caracteres" minLength={8} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Confirmar contrasena</span>
                <PasswordInput name="confirmPassword" placeholder="Repite la contrasena" minLength={8} required />
              </label>
              <Button type="submit" className="w-full">
                Guardar contrasena
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

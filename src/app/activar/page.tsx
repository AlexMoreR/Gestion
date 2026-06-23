import Link from "next/link";
import { activateAccountAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { verifyInvitationToken } from "@/lib/invitation";
import { prisma } from "@/lib/prisma";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ActivarCuentaPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const payload = token ? verifyInvitationToken(token) : null;
  const user = payload
    ? await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { email: true, emailVerified: true },
      })
    : null;

  const invalid = !payload || !user || user.email !== payload.email;
  const alreadyUsed = !invalid && user?.emailVerified != null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Activar cuenta</CardTitle>
          <CardDescription>
            {invalid
              ? "El enlace de invitacion es invalido o expiro."
              : alreadyUsed
                ? "Esta invitacion ya fue usada."
                : `Crea tu contrasena para ${user?.email}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invalid || alreadyUsed ? (
            <Link href="/login" className="text-sm font-medium text-primary hover:underline">
              Ir a iniciar sesion
            </Link>
          ) : (
            <form action={activateAccountAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              {errorMessage ? (
                <p className="text-sm font-medium text-destructive">{errorMessage}</p>
              ) : null}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Contrasena</span>
                <Input type="password" name="password" placeholder="Minimo 8 caracteres" minLength={8} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Confirmar contrasena</span>
                <Input type="password" name="confirmPassword" placeholder="Repite la contrasena" minLength={8} required />
              </label>
              <Button type="submit" className="w-full">
                Activar cuenta
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

import { redirect } from "next/navigation";
import { Save } from "lucide-react";
import { auth } from "@/auth";
import { adminUpdateMinMarginsAction } from "@/app/actions/settings-actions";
import { ConfigTabs } from "@/components/admin/config-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import {
  getSystemMinRetailMarginPct,
  getSystemMinWholesaleMarginPct,
} from "@/lib/system-settings";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminConfiguracionReglasPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    redirect("/unauthorized");
  }

  const canAccess = await hasAdminModuleAccess(session.user.id, session.user.role, "config_business");
  if (!canAccess) {
    redirect("/unauthorized");
  }

  const params = await searchParams;
  const okMessage = typeof params.ok === "string" ? params.ok : "";
  const errorMessage = typeof params.error === "string" ? params.error : "";

  const [minRetailMarginPct, minWholesaleMarginPct] = await Promise.all([
    getSystemMinRetailMarginPct(),
    getSystemMinWholesaleMarginPct(),
  ]);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Reglas guardadas"
        errorTitle="Error de configuracion"
      />

      <ConfigTabs />

      <Card>
        <CardHeader>
          <CardTitle>Regla inicial</CardTitle>
          <CardDescription>
            Margen minimo permitido (porcentaje de utilidad sobre el precio). Si el margen de un
            producto al Detal cae por debajo de este valor, se resalta en rojo en la lista de
            productos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={adminUpdateMinMarginsAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Margen minimo al Detal (%)</span>
                <Input
                  name="minRetailMarginPct"
                  type="number"
                  min={0}
                  step="0.1"
                  defaultValue={minRetailMarginPct}
                  placeholder="0"
                  required
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium">Margen minimo al por mayor (%)</span>
                <Input
                  name="minWholesaleMarginPct"
                  type="number"
                  min={0}
                  step="0.1"
                  defaultValue={minWholesaleMarginPct}
                  placeholder="0"
                  required
                />
              </label>
            </div>

            <div className="flex justify-end">
              <Button type="submit">
                <Save className="h-4 w-4" />
                Guardar reglas
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

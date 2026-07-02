import { redirect } from "next/navigation";
import Image from "next/image";
import { Save } from "lucide-react";
import { auth } from "@/auth";
import {
  adminUpdateBrandNameAction,
  adminUpdateCurrencyAction,
  adminUpdateDianUvtAction,
  adminUpdatePrimaryColorAction,
  adminUpdateStorefrontHeroAction,
  adminUpdateStorefrontLogoAction,
  adminUpdateStorefrontPromoItemsAction,
  adminUpdateWhatsAppPhoneAction,
} from "@/app/actions/settings-actions";
import { DianTaxThresholdMeter } from "@/components/admin/dian-tax-threshold-meter";
import { ConfigTabs } from "@/components/admin/config-tabs";
import { StorefrontPromoItemsForm } from "@/components/admin/storefront-promo-items-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { getPublicAssetUrl } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import {
  getSystemBrandName,
  getSystemCurrency,
  getSystemDianUvt,
  getSystemPrimaryColor,
  getSystemStorefrontHeroDescription,
  getSystemStorefrontHeroTitle,
  getSystemStorefrontLogoPath,
  getSystemStorefrontPromoItems,
  getSystemWhatsAppPhoneDisplay,
} from "@/lib/system-settings";
import { Button } from "@/components/ui/button";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Año en curso en hora de Colombia (UTC-5) y su rango [from, to) para el
// acumulado anual de ventas que alimenta el control DIAN del negocio.
function resolveCurrentYear() {
  const bogotaNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const year = bogotaNow.getUTCFullYear();
  return {
    year,
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

export default async function AdminConfiguracionNegocioPage({ searchParams }: PageProps) {
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
  const currentYear = resolveCurrentYear();

  const [
    systemCurrency,
    systemPrimaryColor,
    systemBrandName,
    systemWhatsAppPhone,
    storefrontLogoPath,
    storefrontHeroTitle,
    storefrontHeroDescription,
    storefrontPromoItems,
    dianUvt,
    annualSalesAgg,
  ] = await Promise.all([
    getSystemCurrency(),
    getSystemPrimaryColor(),
    getSystemBrandName(),
    getSystemWhatsAppPhoneDisplay(),
    getSystemStorefrontLogoPath(),
    getSystemStorefrontHeroTitle(),
    getSystemStorefrontHeroDescription(),
    getSystemStorefrontPromoItems(),
    getSystemDianUvt(),
    prisma.sale.aggregate({
      _sum: { total: true },
      _count: { _all: true },
      where: {
        status: { notIn: ["DRAFT", "CANCELLED"] },
        createdAt: { gte: currentYear.from, lt: currentYear.to },
      },
    }),
  ]);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Configuración guardada"
        errorTitle="Error de configuración"
      />

      <ConfigTabs />

      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
          <CardDescription>Nombre, moneda, contacto y color de la marca.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <form action={adminUpdateBrandNameAction} className="flex items-end gap-2">
              <label className="flex-1 space-y-1.5">
                <span className="text-sm font-medium">Nombre de la marca</span>
                <Input name="brandName" defaultValue={systemBrandName} placeholder="Nombre comercial" required />
              </label>
              <Button type="submit" size="icon" aria-label="Guardar marca">
                <Save className="h-4 w-4" />
              </Button>
            </form>

            <form action={adminUpdateCurrencyAction} className="flex items-end gap-2">
              <label className="flex-1 space-y-1.5">
                <span className="text-sm font-medium">Moneda activa</span>
                <select name="currency" defaultValue={systemCurrency} className="field-select" required>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="icon" aria-label="Guardar moneda">
                <Save className="h-4 w-4" />
              </Button>
            </form>
          </div>

          <form action={adminUpdateWhatsAppPhoneAction} className="flex items-end gap-2">
            <label className="flex-1 space-y-1.5">
              <span className="text-sm font-medium">Número de WhatsApp</span>
              <Input name="whatsappPhone" defaultValue={systemWhatsAppPhone} placeholder="+57 300 123 4567" required />
            </label>
            <Button type="submit" size="icon" aria-label="Guardar WhatsApp">
              <Save className="h-4 w-4" />
            </Button>
          </form>

          <form action={adminUpdatePrimaryColorAction} className="flex items-end gap-2">
            <label className="flex-1 space-y-1.5">
              <span className="text-sm font-medium">Color primario</span>
              <div className="flex items-center gap-2">
                <Input
                  name="primaryColor"
                  type="color"
                  defaultValue={systemPrimaryColor}
                  className="w-14 p-1"
                  required
                />
                <Input value={systemPrimaryColor} readOnly className="flex-1" />
              </div>
            </label>
            <Button type="submit" size="icon" aria-label="Guardar color">
              <Save className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Topes tributarios (DIAN)</CardTitle>
          <CardDescription>
            UVT vigente para calcular los topes de IVA (3.500 UVT) y renta (1.400 UVT).
            La DIAN la actualiza cada año.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={adminUpdateDianUvtAction} className="flex items-end gap-2 md:max-w-sm">
            <label className="flex-1 space-y-1.5">
              <span className="text-sm font-medium">Valor de la UVT</span>
              <Input
                name="dianUvt"
                type="number"
                min={1}
                step={1}
                defaultValue={dianUvt}
                placeholder="49799"
                required
              />
            </label>
            <Button type="submit" size="icon" aria-label="Guardar UVT">
              <Save className="h-4 w-4" />
            </Button>
          </form>

          <DianTaxThresholdMeter
            currency={systemCurrency}
            annualSales={Number(annualSalesAgg._sum.total ?? 0)}
            salesCount={annualSalesAgg._count._all}
            uvt={dianUvt}
            year={currentYear.year}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portada del sitio</CardTitle>
          <CardDescription>Logo, título y descripción del home público.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
          <form action={adminUpdateStorefrontLogoAction} className="space-y-3">
            <label
              htmlFor="storefront-logo-input"
              className="flex min-h-40 cursor-pointer items-center justify-center rounded-lg border border-dashed bg-muted/30 p-4 transition hover:bg-muted/50"
            >
              <Image
                src={getPublicAssetUrl(storefrontLogoPath)}
                alt={`Logo principal de ${systemBrandName}`}
                width={280}
                height={96}
                className="h-auto max-h-28 w-auto max-w-full object-contain"
                unoptimized
              />
            </label>
            <Input id="storefront-logo-input" name="logo" type="file" accept="image/*" className="sr-only" required />
            <Button type="submit" className="w-full">
              <Save className="h-4 w-4" />
              Guardar logo
            </Button>
          </form>

          <form action={adminUpdateStorefrontHeroAction} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Título principal del home</span>
              <Input
                name="heroTitle"
                defaultValue={storefrontHeroTitle}
                placeholder="Mensaje principal de la portada"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Descripción principal del home</span>
              <Textarea
                name="heroDescription"
                defaultValue={storefrontHeroDescription}
                placeholder="Texto de apoyo que acompaña el título principal"
                rows={4}
                required
              />
            </label>

            <div className="flex justify-end">
              <Button type="submit">
                <Save className="h-4 w-4" />
                Guardar portada
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <StorefrontPromoItemsForm
        action={adminUpdateStorefrontPromoItemsAction}
        initialItems={storefrontPromoItems}
      />
    </section>
  );
}

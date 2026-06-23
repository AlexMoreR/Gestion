import { redirect } from "next/navigation";
import Image from "next/image";
import { Save } from "lucide-react";
import { auth } from "@/auth";
import {
  adminUpdateBrandNameAction,
  adminUpdateCurrencyAction,
  adminUpdatePrimaryColorAction,
  adminUpdateStorefrontHeroAction,
  adminUpdateStorefrontLogoAction,
  adminUpdateStorefrontPromoItemsAction,
  adminUpdateWhatsAppPhoneAction,
} from "@/app/actions/settings-actions";
import { ConfigTabs } from "@/components/admin/config-tabs";
import { StorefrontPromoItemsForm } from "@/components/admin/storefront-promo-items-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { getPublicAssetUrl } from "@/lib/site";
import {
  getSystemBrandName,
  getSystemCurrency,
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

  const [
    systemCurrency,
    systemPrimaryColor,
    systemBrandName,
    systemWhatsAppPhone,
    storefrontLogoPath,
    storefrontHeroTitle,
    storefrontHeroDescription,
    storefrontPromoItems,
  ] = await Promise.all([
    getSystemCurrency(),
    getSystemPrimaryColor(),
    getSystemBrandName(),
    getSystemWhatsAppPhoneDisplay(),
    getSystemStorefrontLogoPath(),
    getSystemStorefrontHeroTitle(),
    getSystemStorefrontHeroDescription(),
    getSystemStorefrontPromoItems(),
  ]);

  return (
    <section className="w-full space-y-5">
      <QueryFeedbackToast
        okMessage={okMessage}
        errorMessage={errorMessage}
        okTitle="Configuracion guardada"
        errorTitle="Error de configuracion"
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
              <span className="text-sm font-medium">Numero de WhatsApp</span>
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
          <CardTitle>Portada del sitio</CardTitle>
          <CardDescription>Logo, titulo y descripcion del home publico.</CardDescription>
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
              <span className="text-sm font-medium">Titulo principal del home</span>
              <Input
                name="heroTitle"
                defaultValue={storefrontHeroTitle}
                placeholder="Mensaje principal de la portada"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Descripcion principal del home</span>
              <Textarea
                name="heroDescription"
                defaultValue={storefrontHeroDescription}
                placeholder="Texto de apoyo que acompana el titulo principal"
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

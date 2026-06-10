import { redirect } from "next/navigation";
import Image from "next/image";
import { Save, Settings } from "lucide-react";
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
import { StorefrontPromoItemsForm } from "@/components/admin/storefront-promo-items-form";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

      <div>
        <h1 className="inline-flex items-center gap-1 text-lg font-semibold tracking-tight text-slate-900 md:text-xl">
          <Settings className="h-4 w-4 text-slate-500" />
          <span>Configuracion negocio</span>
        </h1>
        <p className="mt-1 text-xs text-slate-600">
          Ajusta moneda activa, identidad visual y parametros generales del sistema.
        </p>
      </div>

      <Card className="space-y-3">
        <div className="grid gap-3 xl:grid-cols-2">
          <form action={adminUpdateBrandNameAction} className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Nombre de la marca</span>
              <Input
                name="brandName"
                defaultValue={systemBrandName}
                placeholder="Nombre comercial"
                className="h-11"
                required
              />
            </label>
            <button
              type="submit"
              aria-label="Guardar marca"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[(--primary-strong)]"
            >
              <Save className="h-4 w-4" />
            </button>
          </form>

          <form action={adminUpdateCurrencyAction} className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Moneda activa</span>
              <select name="currency" defaultValue={systemCurrency} className="field-select" required>
                {SUPPORTED_CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              aria-label="Guardar moneda"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[(--primary-strong)]"
            >
              <Save className="h-4 w-4" />
            </button>
          </form>
        </div>

        <form action={adminUpdateWhatsAppPhoneAction} className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Numero de WhatsApp</span>
            <Input
              name="whatsappPhone"
              defaultValue={systemWhatsAppPhone}
              placeholder="+57 300 123 4567"
              className="h-11"
              required
            />
          </label>
          <button
            type="submit"
            aria-label="Guardar WhatsApp"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[(--primary-strong)]"
          >
            <Save className="h-4 w-4" />
          </button>
        </form>

        <form action={adminUpdatePrimaryColorAction} className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Color primario</span>
            <div className="flex items-center gap-2">
              <Input
                name="primaryColor"
                type="color"
                defaultValue={systemPrimaryColor}
                className="h-11 w-16 rounded-lg border border-[(--line)] bg-white p-1"
                required
              />
              <Input
                value={systemPrimaryColor}
                readOnly
                className="h-11 flex-1 bg-slate-50 text-xs text-slate-600"
              />
            </div>
          </label>
          <button
            type="submit"
            aria-label="Guardar color"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[(--primary-strong)]"
          >
            <Save className="h-4 w-4" />
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] p-0 shadow-[0_30px_70px_-48px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.92),rgba(248,250,252,0.7)_46%,transparent_72%),linear-gradient(135deg,rgba(255,255,255,0.88),rgba(248,250,252,0.9))] px-5 py-4 md:px-6">
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">Portada del sitio</h2>
        </div>

        <div className="grid gap-5 p-5 md:p-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-4">
            <form
              action={adminUpdateStorefrontLogoAction}
              className="space-y-4 rounded-[1.6rem] border border-slate-200/80 bg-white/90 p-4 shadow-[0_18px_38px_-34px_rgba(15,23,42,0.28)]"
            >
              <div>
                <label
                  htmlFor="storefront-logo-input"
                  className="group relative mt-4 flex min-h-48 cursor-pointer items-center justify-center overflow-hidden rounded-[1.35rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.96),rgba(248,250,252,0.9)_60%,rgba(241,245,249,0.88))] p-5 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_22px_44px_-30px_rgba(15,23,42,0.38)]"
                >
                  <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/70 to-transparent" />
                  <Image
                    src={getPublicAssetUrl(storefrontLogoPath)}
                    alt={`Logo principal de ${systemBrandName}`}
                    width={280}
                    height={96}
                    className="relative h-auto max-h-28 w-auto max-w-full object-contain drop-shadow-[0_14px_24px_rgba(15,23,42,0.1)] transition group-hover:scale-[1.02]"
                    unoptimized
                  />
                </label>
              </div>

              <label className="sr-only" htmlFor="storefront-logo-input">
                Seleccionar logo principal
              </label>
              <Input
                id="storefront-logo-input"
                name="logo"
                type="file"
                accept="image/*"
                className="sr-only"
                required
              />
              <button
                type="submit"
                aria-label="Guardar logo principal"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--primary-strong),var(--primary))] px-4 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_var(--primary)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-18px_var(--primary)]"
              >
                <Save className="h-4 w-4" />
              </button>
            </form>
          </div>

          <form
            action={adminUpdateStorefrontHeroAction}
            className="space-y-5 rounded-[1.75rem] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.9))] p-5 shadow-[0_24px_50px_-38px_rgba(15,23,42,0.3)]"
          >
            <div className="grid gap-5">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-800">Titulo principal del home</span>
              <Input
                name="heroTitle"
                defaultValue={storefrontHeroTitle}
                placeholder="Mensaje principal de la portada"
                className="h-12 rounded-xl border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                required
              />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-800">Descripcion principal del home</span>
              <textarea
                name="heroDescription"
                defaultValue={storefrontHeroDescription}
                placeholder="Texto de apoyo que acompana el titulo principal"
                className="min-h-24 w-full rounded-[1.1rem] border border-slate-200 bg-white px-2 py-3 text-sm text-slate-800 placeholder:text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] transition focus-visible:border-[(--line-strong)] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d1d5db80]"
                required
              />
              </label>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="submit"
                aria-label="Guardar portada"
                className="inline-flex h-11 min-w-28 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--primary-strong),var(--primary))] px-5 text-sm font-semibold text-white shadow-[0_16px_30px_-18px_var(--primary)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-18px_var(--primary)]"
              >
                <Save className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </Card>

      <StorefrontPromoItemsForm
        action={adminUpdateStorefrontPromoItemsAction}
        initialItems={storefrontPromoItems}
      />
    </section>
  );
}

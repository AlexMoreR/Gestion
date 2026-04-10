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
} from "@/app/actions/settings-actions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QueryFeedbackToast } from "@/components/ui/query-feedback-toast";
import { hasAdminModuleAccess } from "@/lib/admin-module-access";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import {
  getSystemBrandName,
  getSystemCurrency,
  getSystemPrimaryColor,
  getSystemStorefrontHeroDescription,
  getSystemStorefrontHeroTitle,
  getSystemStorefrontLogoPath,
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
    storefrontLogoPath,
    storefrontHeroTitle,
    storefrontHeroDescription,
  ] = await Promise.all([
    getSystemCurrency(),
    getSystemPrimaryColor(),
    getSystemBrandName(),
    getSystemStorefrontLogoPath(),
    getSystemStorefrontHeroTitle(),
    getSystemStorefrontHeroDescription(),
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
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
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
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
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
                className="h-11 w-16 rounded-lg border border-[var(--line)] bg-white p-1"
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
            className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
          >
            <Save className="h-4 w-4" />
          </button>
        </form>
      </Card>

      <Card className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-900">Portada del sitio</h2>
          <p className="text-xs text-slate-600">
            Define el logo y el mensaje principal que se muestra en la pagina inicial del catalogo.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Logo actual</p>
              <div className="relative mt-3 flex min-h-40 items-center justify-center overflow-hidden rounded-2xl border border-white bg-white p-4 shadow-sm">
                <Image
                  src={storefrontLogoPath}
                  alt={`Logo principal de ${systemBrandName}`}
                  width={280}
                  height={96}
                  className="h-auto max-h-24 w-auto max-w-full object-contain"
                  unoptimized
                />
              </div>
            </div>

            <form action={adminUpdateStorefrontLogoAction} className="space-y-3 rounded-2xl border border-[var(--line)] p-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Cambiar logo principal</span>
                <Input name="logo" type="file" accept="image/*" className="h-11 pt-2.5" required />
              </label>
              <p className="text-xs text-slate-500">Usa PNG, JPG, WEBP o SVG. Recomendado: fondo transparente y menos de 2 MB.</p>
              <button
                type="submit"
                aria-label="Guardar logo principal"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
              >
                <Save className="h-4 w-4" />
              </button>
            </form>
          </div>

          <form action={adminUpdateStorefrontHeroAction} className="space-y-4 rounded-2xl border border-[var(--line)] p-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Titulo principal del home</span>
              <Input
                name="heroTitle"
                defaultValue={storefrontHeroTitle}
                placeholder="Mensaje principal de la portada"
                className="h-11"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Descripcion principal del home</span>
              <textarea
                name="heroDescription"
                defaultValue={storefrontHeroDescription}
                placeholder="Texto de apoyo que acompana el titulo principal"
                className="min-h-28 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 transition focus-visible:border-[var(--line-strong)] focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d1d5db80]"
                required
              />
            </label>

            <div className="rounded-2xl border border-dashed border-[var(--line)] bg-slate-50/70 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Vista previa</p>
              <div className="mt-3 space-y-2 rounded-2xl bg-[linear-gradient(135deg,var(--primary-strong)_0%,var(--primary)_55%,var(--primary-strong)_100%)] p-5 text-white shadow-[0_22px_40px_-30px_rgba(15,23,42,0.55)]">
                <p className="max-w-xl text-xl font-semibold tracking-tight">{storefrontHeroTitle}</p>
                <p className="max-w-2xl text-sm leading-6 text-white/82">{storefrontHeroDescription}</p>
              </div>
            </div>

            <button
              type="submit"
              aria-label="Guardar portada"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
            >
              <Save className="h-4 w-4" />
            </button>
          </form>
        </div>
      </Card>
    </section>
  );
}

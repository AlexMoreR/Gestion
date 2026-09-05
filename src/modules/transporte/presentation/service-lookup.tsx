"use client";

import * as React from "react";
import { CheckCircle2, Loader2, MapPin, PackageCheck, Truck } from "lucide-react";
import type { TransportLookupResult, TransportOption } from "@/modules/transporte/domain/entities";
import {
  publicCheckFreeShippingAction,
  publicGetCitiesAction,
  publicGetLocalitiesAction,
} from "@/app/actions/transporte-actions";

type ServiceLookupProps = {
  departments: TransportOption[];
  brandName: string;
  whatsAppHref: string; // solo digitos
};

const selectClass =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-slate-900 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export function ServiceLookup({ departments, brandName, whatsAppHref }: ServiceLookupProps) {
  const [departmentId, setDepartmentId] = React.useState("");
  const [cities, setCities] = React.useState<TransportOption[]>([]);
  const [cityId, setCityId] = React.useState("");
  const [localities, setLocalities] = React.useState<TransportOption[]>([]);
  const [localityId, setLocalityId] = React.useState("");

  const [loadingCities, setLoadingCities] = React.useState(false);
  const [loadingLocalities, setLoadingLocalities] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [result, setResult] = React.useState<TransportLookupResult | null>(null);

  async function onDepartmentChange(value: string) {
    setDepartmentId(value);
    setCityId("");
    setCities([]);
    setLocalities([]);
    setLocalityId("");
    setResult(null);
    if (!value) return;
    setLoadingCities(true);
    const rows = await publicGetCitiesAction(value);
    setCities(rows);
    setLoadingCities(false);
  }

  async function check(nextCityId: string, nextLocalityId: string) {
    if (!nextCityId) {
      setResult(null);
      return;
    }
    setChecking(true);
    const res = await publicCheckFreeShippingAction(nextCityId, nextLocalityId || null);
    setResult(res);
    setChecking(false);
  }

  async function onCityChange(value: string) {
    setCityId(value);
    setLocalityId("");
    setLocalities([]);
    setResult(null);
    if (!value) return;
    setLoadingLocalities(true);
    const rows = await publicGetLocalitiesAction(value);
    setLocalities(rows);
    setLoadingLocalities(false);
    await check(value, "");
  }

  async function onLocalityChange(value: string) {
    setLocalityId(value);
    await check(cityId, value);
  }

  const placeSuffix = result?.placeLabel ? ` a ${result.placeLabel}` : "";
  // Mensaje cuando SI tiene envio gratis (boton verde de compra).
  const waBuyLink = `https://wa.me/${whatsAppHref}?text=${encodeURIComponent(
    `Hola *${brandName}*, tengo envío gratis${placeSuffix} y quiero comprar. 🎉`,
  )}`;
  // Mensaje cuando NO tiene envio gratis (boton de cotizar).
  const waQuoteLink = `https://wa.me/${whatsAppHref}?text=${encodeURIComponent(
    `Hola *${brandName}*, quiero cotizar el envío${placeSuffix}.`,
  )}`;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Departamento</span>
          <select
            className={selectClass}
            value={departmentId}
            onChange={(event) => onDepartmentChange(event.target.value)}
          >
            <option value="">Elige tu departamento…</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Ciudad / Municipio</span>
          <select
            className={selectClass}
            value={cityId}
            onChange={(event) => onCityChange(event.target.value)}
            disabled={!departmentId || loadingCities}
          >
            <option value="">
              {loadingCities ? "Cargando…" : !departmentId ? "Primero el departamento" : "Elige tu ciudad…"}
            </option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cityId && (localities.length > 0 || loadingLocalities) ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            Corregimiento / vereda <span className="font-normal text-slate-400">(opcional)</span>
          </span>
          <select
            className={selectClass}
            value={localityId}
            onChange={(event) => onLocalityChange(event.target.value)}
            disabled={loadingLocalities}
          >
            <option value="">
              {loadingLocalities ? "Cargando…" : "Toda la ciudad (o elige un corregimiento)"}
            </option>
            {localities.map((locality) => (
              <option key={locality.id} value={locality.id}>
                {locality.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {/* Resultado */}
      {checking ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
        </div>
      ) : result ? (
        result.freeShipping ? (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
              <div>
                <p className="text-base font-semibold text-emerald-800">
                  ¡Sí! Tenemos <span className="underline decoration-emerald-400">envío gratis</span>
                </p>
                <p className="text-sm text-emerald-700">
                  Enviamos gratis a <span className="font-medium">{result.placeLabel}</span>. 🎉
                </p>
              </div>
            </div>
            <a
              href={waBuyLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <PackageCheck className="h-4 w-4" /> Tengo envío gratis · Comprar por WhatsApp
            </a>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <Truck className="mt-0.5 h-6 w-6 shrink-0 text-slate-500" />
              <div>
                <p className="text-base font-semibold text-slate-800">Envío con costo</p>
                <p className="text-sm text-slate-600">
                  Por ahora no tenemos envío gratis a <span className="font-medium">{result.placeLabel}</span>, pero
                  igual te lo llevamos. Escríbenos y te cotizamos el envío.
                </p>
              </div>
            </div>
            <a
              href={waQuoteLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              <PackageCheck className="h-4 w-4" /> Cotizar mi envío por WhatsApp
            </a>
          </div>
        )
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-400">
          <MapPin className="h-4 w-4" /> Elige tu ubicación para ver si tienes envío gratis.
        </div>
      )}
    </div>
  );
}

"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// La ficha agrega " | <marca>" al titulo SEO, por eso se recomienda <= 50 sin la marca.
// Los maximos duros coinciden con la validacion del servidor (product-actions.ts).
const TITLE_RECOMMENDED_MAX = 50;
const TITLE_HARD_MAX = 70;
const DESCRIPTION_RECOMMENDED_MIN = 140;
const DESCRIPTION_RECOMMENDED_MAX = 155;
const DESCRIPTION_HARD_MAX = 180;

function counterClass(ok: boolean, empty: boolean) {
  if (empty) return "text-slate-400";
  return ok ? "text-emerald-600" : "text-amber-600";
}

export function ProductSeoFields({
  seoTitle,
  seoDescription,
  onSeoTitleChange,
  onSeoDescriptionChange,
}: {
  seoTitle: string;
  seoDescription: string;
  onSeoTitleChange: (value: string) => void;
  onSeoDescriptionChange: (value: string) => void;
}) {
  const titleLength = seoTitle.trim().length;
  const descriptionLength = seoDescription.trim().length;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <Search className="h-4 w-4 text-slate-500" />
        SEO (Google)
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Titulo SEO</span>
        <Input
          name="seoTitle"
          placeholder="Ej. Silla hidraulica para peluqueria"
          maxLength={TITLE_HARD_MAX}
          value={seoTitle}
          onChange={(e) => onSeoTitleChange(e.target.value)}
        />
        <span className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>Déjalo vacío para usar el título automático. Se le agrega &quot; | Magilus&quot;.</span>
          <span className={counterClass(titleLength <= TITLE_RECOMMENDED_MAX, titleLength === 0)}>
            {titleLength}/{TITLE_RECOMMENDED_MAX}
          </span>
        </span>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Descripcion SEO</span>
        <Textarea
          name="seoDescription"
          rows={3}
          maxLength={DESCRIPTION_HARD_MAX}
          value={seoDescription}
          onChange={(e) => onSeoDescriptionChange(e.target.value)}
          placeholder="Resumen breve y persuasivo para Google."
        />
        <span className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span>Ideal entre 140 y 155 caracteres. Vacía usa la descripción del producto.</span>
          <span
            className={counterClass(
              descriptionLength >= DESCRIPTION_RECOMMENDED_MIN && descriptionLength <= DESCRIPTION_RECOMMENDED_MAX,
              descriptionLength === 0,
            )}
          >
            {descriptionLength}/{DESCRIPTION_RECOMMENDED_MIN}–{DESCRIPTION_RECOMMENDED_MAX}
          </span>
        </span>
      </label>
    </div>
  );
}

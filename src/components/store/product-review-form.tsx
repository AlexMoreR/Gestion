"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Star, X } from "lucide-react";

import { adminCreateProductReviewAction } from "@/app/actions/product-review-actions";
import { Button } from "../ui/button";

type ProductReviewFormProps = {
  productId: string;
  returnTo: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] disabled:opacity-60"
    >
      {pending ? "Guardando..." : "Agregar recomendacion"}
    </Button>
  );
}

export function ProductReviewForm({ productId, returnTo }: ProductReviewFormProps) {
  const [rating, setRating] = useState(5);
  const [hovered, setHovered] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const clearPhoto = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
    setPhotoPreview(null);
  };

  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoPreview((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      const file = event.target.files?.[0];
      return file ? URL.createObjectURL(file) : null;
    });
  };

  return (
    <form
      action={adminCreateProductReviewAction}
      className="space-y-3 rounded-xl border border-dashed border-[var(--primary)]/40 bg-[var(--primary)]/[0.04] p-4"
    >
      <p className="text-sm font-semibold text-slate-900">Agregar recomendacion (solo admin)</p>

      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="rating" value={rating} />

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">Calificacion</label>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, index) => {
            const value = index + 1;
            const filled = (hovered || rating) >= value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                onMouseEnter={() => setHovered(value)}
                onMouseLeave={() => setHovered(0)}
                aria-label={`${value} estrellas`}
                className="text-amber-400 transition"
              >
                <Star className={`h-6 w-6 ${filled ? "fill-current" : "fill-none text-slate-300"}`} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="review-author" className="text-xs font-medium text-slate-600">
            Nombre del cliente (opcional)
          </label>
          <input
            id="review-author"
            name="authorName"
            type="text"
            maxLength={80}
            placeholder="Ej: Laura M."
            className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="review-photo" className="text-xs font-medium text-slate-600">
            Foto (opcional)
          </label>
          <input
            id="review-photo"
            name="photo"
            type="file"
            accept="image/*"
            ref={photoInputRef}
            onChange={handlePhotoChange}
            className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs file:mr-2 file:rounded file:border-0 file:bg-[var(--primary)]/10 file:px-2 file:py-1 file:text-[var(--primary-strong)]"
          />
          {photoPreview ? (
            <div className="relative mt-2 inline-block">
              <img
                src={photoPreview}
                alt="Vista previa"
                className="h-24 w-24 rounded-lg border border-[var(--line)] object-cover"
              />
              <button
                type="button"
                onClick={clearPhoto}
                aria-label="Quitar vista previa"
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-1 sm:max-w-[16rem]">
        <label htmlFor="review-date" className="text-xs font-medium text-slate-600">
          Fecha (opcional)
        </label>
        <input
          id="review-date"
          name="reviewDate"
          type="date"
          className="h-10 w-full rounded-lg border border-[var(--line)] bg-white px-3 text-sm outline-none focus:border-[var(--primary)]"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="review-comment" className="text-xs font-medium text-slate-600">
          Comentario
        </label>
        <textarea
          id="review-comment"
          name="comment"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          placeholder="Escribe la recomendacion del cliente..."
          className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
      </div>

      <SubmitButton />
    </form>
  );
}

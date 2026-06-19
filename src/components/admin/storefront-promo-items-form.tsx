"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "../ui/button";

type StorefrontPromoItemsFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  initialItems: string[];
};

export function StorefrontPromoItemsForm({ action, initialItems }: StorefrontPromoItemsFormProps) {
  const [items, setItems] = useState<string[]>(() => (initialItems.length > 0 ? initialItems : [""]));

  const serializedItems = useMemo(
    () =>
      JSON.stringify(
        items
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    [items],
  );

  function updateItem(index: number, value: string) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addItem() {
    setItems((current) => [...current, ""]);
  }

  function removeItem(index: number) {
    setItems((current) => {
      if (current.length === 1) {
        return [""];
      }

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-[var(--line)] p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900">Franja promocional</h3>
      </div>

      <input type="hidden" name="promoItems" value={serializedItems} />

      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${index}-${item}`} className="flex items-center gap-2">
            <Input
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              placeholder={`Mensaje promocional ${index + 1}`}
              className="h-11"
            />
            <Button
              type="button"
              onClick={() => removeItem(index)}
              aria-label={`Eliminar mensaje ${index + 1}`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={addItem}
          disabled={items.length >= 12}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Agregar texto
        </Button>
        <Button
          type="submit"
          aria-label="Guardar franja promocional"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:bg-[var(--primary-strong)]"
        >
          <Save className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

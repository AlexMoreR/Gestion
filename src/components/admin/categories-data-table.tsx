"use client";

import * as React from "react";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Edit3, Trash2 } from "lucide-react";
import { adminDeleteCategoryAction } from "@/app/actions/catalog-actions";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { getPublicAssetUrl } from "@/lib/site";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  productsCount: number;
};

type CategoriesDataTableProps = {
  categories: CategoryRow[];
  onEditCategory: (categoryId: string) => void;
};

function CategoryLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [hasError, setHasError] = useState(false);

  if (!logoUrl || hasError) {
    return (
      <div className="grid h-9 w-9 place-items-center rounded-md border border-border bg-muted text-xs font-semibold text-muted-foreground">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={getPublicAssetUrl(logoUrl)}
      alt={`Logo ${name}`}
      className="h-9 w-9 rounded-md border border-border object-cover"
      onError={() => setHasError(true)}
    />
  );
}

export function CategoriesDataTable({ categories, onEditCategory }: CategoriesDataTableProps) {
  const columns = React.useMemo<ColumnDef<CategoryRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Categoria",
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <CategoryLogo name={row.original.name} logoUrl={row.original.logoUrl} />
            <p className="text-sm font-medium text-foreground">{row.original.name}</p>
          </div>
        ),
      },
      {
        accessorKey: "productsCount",
        header: "Productos",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.productsCount}</span>,
      },
      {
        id: "actions",
        header: "Acciones",
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => {
          const category = row.original;
          return (
            <>
              <form data-delete-category-id={category.id} action={adminDeleteCategoryAction}>
                <input type="hidden" name="returnTo" value="/admin/categorias" />
                <input type="hidden" name="categoryId" value={category.id} />
              </form>
              <div className="flex items-center justify-start gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 border border-transparent hover:border-border"
                  onClick={() => onEditCategory(category.id)}
                  aria-label={`Editar ${category.name}`}
                >
                  <Edit3 className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 border border-transparent text-red-600 hover:border-red-100 hover:bg-red-50 hover:text-red-700"
                  onClick={() => {
                    const forms = document.querySelectorAll<HTMLFormElement>(
                      `form[data-delete-category-id="${category.id}"]`,
                    );
                    const form =
                      Array.from(forms).find((candidate) => candidate.offsetParent !== null) ??
                      forms[0] ??
                      null;
                    form?.requestSubmit();
                  }}
                  aria-label={`Eliminar ${category.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </>
          );
        },
      },
    ],
    [onEditCategory],
  );

  return (
    <DataTable
      data={categories}
      columns={columns}
      searchPlaceholder="Buscar categoria"
      emptyMessage="Aun no hay categorias."
      pageSize={10}
      minWidth="min-w-[520px]"
    />
  );
}

"use client";

import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";
import { DataTable } from "@/components/ui/data-table";

type InventoryDataGridProps<TData> = {
  title: string;
  description?: string;
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  searchPlaceholder?: string;
  emptyMessage: string;
  pageSize?: number;
  toolbar?: React.ReactNode;
  getRowDate?: (row: TData) => string | null | undefined;
  initialDateFrom?: string;
  initialDateTo?: string;
};

export function InventoryDataGrid<TData>({
  pageSize = 10,
  ...props
}: InventoryDataGridProps<TData>) {
  return <DataTable {...props} pageSize={pageSize} minWidth="min-w-[760px]" />;
}

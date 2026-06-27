"use client";

import type { ColumnDef } from "@tanstack/react-table";
import * as React from "react";
import { DataTable } from "@/components/ui/data-table";

type ExpensesDataGridProps<TData> = {
  title?: string;
  description?: string;
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  searchPlaceholder?: string;
  emptyMessage: string;
  pageSize?: number;
  toolbar?: React.ReactNode;
  searchFirst?: boolean;
  getRowDate?: (row: TData) => string | null | undefined;
  initialDateFrom?: string;
  initialDateTo?: string;
};

export function ExpensesDataGrid<TData>({
  pageSize = 8,
  ...props
}: ExpensesDataGridProps<TData>) {
  return <DataTable {...props} pageSize={pageSize} minWidth="min-w-[860px]" />;
}

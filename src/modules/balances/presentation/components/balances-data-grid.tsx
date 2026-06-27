"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

type BalancesDataGridProps<TData> = {
  title: string;
  description?: string;
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  searchPlaceholder?: string;
  emptyMessage: string;
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  paginate?: boolean;
  showFooter?: boolean;
  getRowDate?: (row: TData) => string | null | undefined;
  initialDateFrom?: string;
  initialDateTo?: string;
};

export function BalancesDataGrid<TData>({
  pageSize = 8,
  ...props
}: BalancesDataGridProps<TData>) {
  return <DataTable {...props} pageSize={pageSize} minWidth="min-w-[860px]" />;
}

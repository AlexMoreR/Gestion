"use client";

import { usePathname, useRouter } from "next/navigation";

type MonthOption = {
  value: string;
  label: string;
};

type SupplierBalanceMonthSelectProps = {
  months: MonthOption[];
  value: string;
};

export function SupplierBalanceMonthSelect({ months, value }: SupplierBalanceMonthSelectProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      className="field-select w-48"
      value={value}
      onChange={(event) => router.push(`${pathname}?month=${event.target.value}`)}
      aria-label="Mes"
    >
      {months.map((month) => (
        <option key={month.value} value={month.value}>
          {month.label}
        </option>
      ))}
    </select>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) {
          router.push(`${pathname}?month=${next}`);
        }
      }}
    >
      <SelectTrigger size="sm" className="w-full text-xs" aria-label="Mes">
        <SelectValue>
          {(current) => months.find((month) => month.value === current)?.label ?? current}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {months.map((month) => (
          <SelectItem key={month.value} value={month.value}>
            {month.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

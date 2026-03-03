"use client";

import { Check } from "lucide-react";

type ProductFormStep = {
  id: number;
  label: string;
};

type ProductFormStepperProps = {
  steps: readonly ProductFormStep[];
  activeStep: number;
};

export function ProductFormStepper({ steps, activeStep }: ProductFormStepperProps) {
  return (
    <div className="sticky top-0 z-40 -mx-4 px-3 sm:-mx-6 sm:px-6 md:top-[-1.25rem]">
      <div className="rounded-b-xl border border-t-0 border-[var(--line)] bg-white/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {steps.map((step, index, arr) => {
            const isCurrent = activeStep === step.id;
            const isDone = activeStep > step.id;
            return (
              <div
                key={step.id}
                className={`flex min-w-[7.25rem] flex-1 items-center gap-2 rounded-lg px-2 py-1.5 transition sm:min-w-0 ${
                  isCurrent ? "bg-slate-50" : ""
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isCurrent
                      ? "bg-[var(--primary)] text-white ring-2 ring-[var(--primary)]/20"
                      : isDone
                        ? "bg-[#e8efff] text-[var(--primary)]"
                        : "bg-white text-slate-500 ring-1 ring-[var(--line)]"
                  }`}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : step.id}
                </span>
                <span className={`truncate text-xs font-medium ${isCurrent || isDone ? "text-slate-800" : "text-slate-500"}`}>
                  {step.label}
                </span>
                {index < arr.length - 1 ? (
                  <span className={`mx-1 h-px flex-1 ${isDone ? "bg-[var(--primary)]/50" : "bg-[var(--line)]"}`} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

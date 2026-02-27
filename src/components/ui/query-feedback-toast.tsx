"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

type QueryFeedbackToastProps = {
  okMessage?: string;
  errorMessage?: string;
  okTitle?: string;
  errorTitle?: string;
};

export function QueryFeedbackToast({
  okMessage,
  errorMessage,
  okTitle = "Operacion completada",
  errorTitle = "No se pudo completar",
}: QueryFeedbackToastProps) {
  const lastKeyRef = useRef<string>("");

  useEffect(() => {
    const key = `${okMessage ?? ""}|${errorMessage ?? ""}`;
    if (!key || key === "|" || lastKeyRef.current === key) {
      return;
    }

    lastKeyRef.current = key;

    if (okMessage) {
      toast.success(okTitle, {
        description: okMessage,
      });
    }

    if (errorMessage) {
      toast.error(errorTitle, {
        description: errorMessage,
      });
    }
  }, [okMessage, errorMessage, okTitle, errorTitle]);

  return null;
}

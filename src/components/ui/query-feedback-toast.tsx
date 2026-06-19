"use client";

import { useEffect, useRef } from "react";
import { toast } from "react-toastify";

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

    toast.dismiss();

    if (okMessage) {
      toast.success(
        <div>
          <p className="text-sm font-semibold">{okTitle}</p>
          <p className="text-xs opacity-90">{okMessage}</p>
        </div>,
      );
    }

    if (errorMessage) {
      toast.error(
        <div>
          <p className="text-sm font-semibold">{errorTitle}</p>
          <p className="text-xs opacity-90">{errorMessage}</p>
        </div>,
      );
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has("ok") || url.searchParams.has("error")) {
      url.searchParams.delete("ok");
      url.searchParams.delete("error");
      const next = `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ""}${url.hash}`;
      window.history.replaceState({}, "", next);
    }
  }, [okMessage, errorMessage, okTitle, errorTitle]);

  return null;
}

"use client";

import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";

type SupplierShareLinkButtonProps = {
  path: string;
};

export function SupplierShareLinkButton({ path }: SupplierShareLinkButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el link");
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
      {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
      Copiar link
    </Button>
  );
}

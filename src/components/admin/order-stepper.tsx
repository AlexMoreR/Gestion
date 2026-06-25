import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { OrderDeliveryManager } from "@/components/admin/order-delivery-manager";
import { cn } from "@/lib/utils";

type CarrierOption = {
  id: string;
  name: string;
};

type AccountOption = {
  id: string;
  name: string;
};

type DispatchData = {
  orderId: string;
  returnTo: string;
  carriers: CarrierOption[];
  accounts: AccountOption[];
  defaultAddress: string;
  canDispatch: boolean;
  allItemsConfirmed: boolean;
  allItemsPaymentSet: boolean;
  allItemsHavePhotos: boolean;
};

type DeliveryData = {
  dispatchId: string | null;
  returnTo: string;
  defaultInstagram: string;
  defaultTiktok: string;
};

type OrderStepperProps = {
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
  step4Done: boolean;
  dispatch: DispatchData;
  delivery: DeliveryData;
};

const STEPS = [
  {
    n: 1,
    title: "Fabricar",
    hint: 'En cada ítem pulsa el botón verde "Fabricar": confirma el proveedor y el costo. El ítem pasa a producción.',
  },
  {
    n: 2,
    title: "Recoger",
    hint: 'En cada ítem pulsa el botón azul "Recoger": registra el pago al proveedor y sube la foto del producto terminado.',
  },
  {
    n: 3,
    title: "Despachar",
    hint: "Elige la modalidad de entrega y crea el despacho de la orden.",
  },
  {
    n: 4,
    title: "Entregar",
    hint: "Registra la entrega: foto de quien recibió y redes del cliente (opcional).",
  },
];

export function OrderStepper({
  step1Done,
  step2Done,
  step3Done,
  step4Done,
  delivery,
}: OrderStepperProps) {
  const done = [step1Done, step2Done, step3Done, step4Done];
  const current = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : !step4Done ? 4 : 0;
  const allDone = current === 0;

  return (
    <Card className="border-border bg-card/95">
      <CardContent className="space-y-4">
        <div className="flex items-center">
          {STEPS.map((step, idx) => {
            const isDone = done[idx];
            const isCurrent = current === step.n;
            return (
              <div key={step.n} className="flex flex-1 items-center last:flex-none">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                      isDone
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : isCurrent
                          ? "border-blue-500 bg-blue-500/10 text-blue-600 ring-2 ring-blue-500/30"
                          : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : step.n}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isDone || isCurrent ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </span>
                </div>
                {idx < STEPS.length - 1 ? (
                  <div className={cn("mx-2 h-0.5 flex-1", isDone ? "bg-emerald-500" : "bg-border")} />
                ) : null}
              </div>
            );
          })}
        </div>

        {allDone ? (
          <p className="text-sm font-medium text-emerald-600">Orden entregada. Pasos completados.</p>
        ) : current === 4 && delivery.dispatchId ? (
          <OrderDeliveryManager
            dispatchId={delivery.dispatchId}
            returnTo={delivery.returnTo}
            defaultInstagram={delivery.defaultInstagram}
            defaultTiktok={delivery.defaultTiktok}
            canDeliver
            buttonLabel="Registrar entrega"
            buttonClassName="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

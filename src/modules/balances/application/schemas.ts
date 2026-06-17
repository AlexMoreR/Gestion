import { z } from "zod";

export const supplierPaymentCreateSchema = z.object({
  saleId: z.string().trim().min(1, "La venta es obligatoria"),
  supplierId: z.string().trim().min(1, "El proveedor es obligatorio"),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero"),
  transactionReference: z.string().trim().min(1, "La referencia es obligatoria").max(120, "Referencia muy larga"),
  paymentDate: z.coerce.date(),
  notes: z.string().trim().max(2000, "Nota demasiado larga").optional(),
});

export const supplierPaymentUpdateSchema = supplierPaymentCreateSchema.extend({
  paymentId: z.string().trim().min(1, "El pago es obligatorio"),
});

export const shippingCostCreateSchema = z.object({
  saleId: z.string().trim().min(1, "La venta es obligatoria"),
  shippingProvider: z.string().trim().min(1, "El transportador es obligatorio").max(120, "Transportador muy largo"),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero"),
  transactionReference: z.string().trim().min(1, "La referencia es obligatoria").max(120, "Referencia muy larga"),
  paymentDate: z.coerce.date(),
});

export const shippingCostUpdateSchema = shippingCostCreateSchema.extend({
  shippingCostId: z.string().trim().min(1, "El costo es obligatorio"),
});

export type SupplierPaymentFormValues = z.infer<typeof supplierPaymentCreateSchema>;
export type ShippingCostFormValues = z.infer<typeof shippingCostCreateSchema>;

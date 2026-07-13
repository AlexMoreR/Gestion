import { z } from "zod";

const optionalAccountId = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

export const supplierPaymentCreateSchema = z.object({
  saleId: z.string().trim().min(1, "La venta es obligatoria"),
  supplierId: z.string().trim().min(1, "El proveedor es obligatorio"),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero"),
  transactionReference: z.string().trim().min(1, "La referencia es obligatoria").max(120, "Referencia muy larga"),
  paymentDate: z.coerce.date(),
  notes: z.string().trim().max(2000, "Nota demasiado larga").optional(),
  accountId: optionalAccountId,
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
  accountId: optionalAccountId,
});

export const shippingCostUpdateSchema = shippingCostCreateSchema.extend({
  shippingCostId: z.string().trim().min(1, "El costo es obligatorio"),
});

const accountTypeSchema = z.enum(["CASH", "BANK", "WALLET", "OTHER"]);

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120, "Nombre muy largo"),
  type: accountTypeSchema,
  reference: z.string().trim().max(120, "Referencia muy larga").optional(),
  openingBalance: z.coerce.number().default(0),
});

export const accountUpdateSchema = accountCreateSchema.extend({
  accountId: z.string().trim().min(1, "La cuenta es obligatoria"),
  isActive: z.coerce.boolean().default(true),
});

export const accountMovementCreateSchema = z
  .object({
    accountId: z.string().trim().min(1, "La cuenta es obligatoria"),
    type: z.enum(["IN", "OUT", "TRANSFER"]),
    amount: z.coerce.number().positive("El monto debe ser mayor a cero"),
    note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
    movementDate: z.coerce.date(),
    toAccountId: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
  })
  .superRefine((value, ctx) => {
    if (value.type === "TRANSFER") {
      if (!value.toAccountId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La cuenta destino es obligatoria", path: ["toAccountId"] });
      } else if (value.toAccountId === value.accountId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La cuenta destino debe ser distinta", path: ["toAccountId"] });
      }
    }
  });

// Edicion puntual de la fecha de una transaccion desde el detalle de la cuenta.
// El id viene prefijado por tipo (ej. "supplier-payment:xxx") para saber que
// registro subyacente actualizar.
export const transactionDateUpdateSchema = z.object({
  transactionId: z.string().trim().min(1, "Transaccion invalida"),
  date: z.coerce.date(),
});

export type SupplierPaymentFormValues = z.infer<typeof supplierPaymentCreateSchema>;
export type ShippingCostFormValues = z.infer<typeof shippingCostCreateSchema>;
export type AccountFormValues = z.infer<typeof accountCreateSchema>;
export type AccountMovementFormValues = z.infer<typeof accountMovementCreateSchema>;

import { z } from "zod";

export const inventoryMovementCreateSchema = z.object({
  productId: z.string().trim().min(1, "El producto es obligatorio"),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  // IN/OUT: unidades a sumar o restar (> 0).
  // ADJUSTMENT: conteo real total del producto (>= 0).
  quantity: z.coerce.number().int("La cantidad debe ser un numero entero").min(0, "Cantidad invalida"),
  note: z.string().trim().max(2000, "Nota demasiado larga").optional(),
  movementDate: z.coerce.date(),
});

export const minStockUpdateSchema = z.object({
  productId: z.string().trim().min(1, "El producto es obligatorio"),
  minStock: z.coerce.number().int("El minimo debe ser un numero entero").min(0, "El minimo no puede ser negativo"),
});

export type InventoryMovementFormValues = z.infer<typeof inventoryMovementCreateSchema>;
export type MinStockFormValues = z.infer<typeof minStockUpdateSchema>;

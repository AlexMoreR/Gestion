## Reglas de negocio

- `ajuste_compra_editada`: en `/admin/ordenes/<id>/editar-compra` (Editar compra) el **Costo unit.** de cada línea es editable y hay una línea **Descuento (resta) / Recargo (suma)** con monto y proveedora, más un **Motivo** obligatorio (≥ 3 letras) para guardar cualquier cambio. El ajuste se guarda como un cargo a la proveedora sin producto ligado a la orden (como el envío): negativo con nota "Descuento: <motivo>" o positivo con "Recargo: <motivo>"; la deuda (cargos − pagos) y el total de la orden (`purchaseEditTotals`, que ya acepta extras negativos) bajan o suben solos. Un descuento nunca deja la compra con saldo a favor de la proveedora. No toca inventario ni el costo FIFO (solo lee los cargos "Compra inventario"). Bitácora "Editó la compra COM-… Motivo: …" con antes/después (líneas, total y `ajustes`). Reglas puras en `src/lib/purchase-edit.ts` (`parsePurchaseAdjustment`, `purchaseEditReasonError`).

## Riesgos de operación

- `descuento_compra_sin_deshacer`: un descuento o recargo puesto por error no se borra desde la pantalla; se corrige con el ajuste contrario (un recargo igual) y su motivo. En la cuenta de la proveedora el descuento sale como un cargo con signo menos.

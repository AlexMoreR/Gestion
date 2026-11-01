## Reglas de negocio

- `pago_proveedora_en_of`: en la orden de venta, pestaña Fabricación, cada OF muestra "Pagado $X · Falta $Y" y la lista de pagos (fecha, cuenta, monto, comprobante). Se lee de la cuenta de la proveedora (`SupplierLedgerEntry`, mismo filtro orden + proveedora que Proveedores): costo = cargos de esa orden; si no hay cargos, los subtotales de la OF; si no hay ninguno, "Costo sin confirmar". Solo lectura; la ganancia sigue usando `purchaseCost`. Reglas puras en `src/modules/proveedores/domain/supplier-payment.ts`.

## Riesgos de operación

- `pago_proveedora_flete_en_costo`: si la proveedora también tiene cargos de flete en la misma orden, ese flete entra en el "Costo" de su OF (así cuadra con Proveedores).

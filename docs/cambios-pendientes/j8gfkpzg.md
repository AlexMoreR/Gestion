## Entidades

- `RegistroAnulado`: copia de un abono o gasto que se anuló: de qué tabla, qué registro (sin llave foránea, queda aunque el original ya no exista), código, monto, la fila completa, motivo, desde dónde, quién y cuándo.

## Reglas de negocio

- `anular_con_motivo`: lo que tiene plata no se borra: se anula con motivo. "Anular" un abono (en `/admin/ventas`) o un gasto (en `/admin/gastos`) pide un motivo de al menos 3 letras, guarda la fila completa en `RegistroAnulado`, la quita y lo anota en la bitácora como "Anuló … (motivo)", todo junto. Si al anular un abono la venta queda debiendo, vuelve a Activa. Regla en `anularConMotivo` y `saleStatusForPaid`.

## Riesgos de operación

- `anulados_sin_pantalla`: `RegistroAnulado` todavía no tiene pantalla propia: las anulaciones se ven en la bitácora (Actividad / `historial_de_registro`) y en la tabla.

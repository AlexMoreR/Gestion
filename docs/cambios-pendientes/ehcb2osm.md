## Reglas de negocio

- `cruce_automatico_fletes`: una sola vez (la primera carga de Balances, de `/admin/balances/fletes-sin-cuenta`, de Nómina o de `saldos_de_cuentas`), cada flete viejo sin cuenta se une solo a su pago al transportador en Proveedores, igual que el botón "Ya está pagado en Proveedores". Exige mismo monto, proveedor de tipo transportadora, pago con cuenta y sin otro flete. Regla A: pago de la misma venta o de su orden (gana el mismo transportador, luego la fecha más cercana). Regla B: pago sin venta ni orden a 5 días o menos, solo si hay una sola pareja (o una sola del mismo transportador). No cambia saldos ni la ganancia. Marca `AppSetting.freightAutoLinkDone` (fecha, cuántos y por cuánto) y candado de Postgres; regla pura `planFreightAutoLink` en `src/modules/balances/domain/freight-without-account.ts`.

## Riesgos de operación

- `cruce_fletes_equivocado`: si otro pago del mismo monto se tomó por el flete, se deshace a mano con la bitácora (entidad SHIPMENT, actor "Gestión (cruce automático)": trae el id del flete y el del pago) dejando vacío `supplierPaymentId` en ese flete. Los fletes sin pareja segura siguen en la pantalla de Fletes sin cuenta.
- `flete_doble_registro`: desde el 30-oct-2026 el despacho crea el pago al transportador en Proveedores; si además se registra a mano en Proveedores, ese flete se resta dos veces de la cuenta.

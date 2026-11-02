## Reglas de negocio

- `deshacer_sin_borrar`: deshacer un despacho, un recogido o una fabricación ya no borra a secas: los fletes (`ShippingCost`), los pagos y cargos de la proveedora o transportadora, el despacho y el trabajo de producción pasan por `anularConMotivo` con un motivo automático ("Deshizo el despacho DSP-…", "Deshizo el recogido de un producto de ORD-…", "Deshizo la fabricación de un producto de ORD-…") y quedan en `RegistroAnulado`. Las asesoras lo ven igual que antes.
- `anulaciones_unico_borrado`: `src/lib/anulaciones.ts` es el único lugar que borra abonos, fletes, gastos, movimientos de inventario y de proveedoras, despachos, órdenes y ventas (también la edición de compras y el borrado definitivo de una venta, que ahora dejan copia de cada fila). La prueba `tests/db/vigilante-borrados.test.ts` falla si alguien agrega un `.delete(`/`.deleteMany(` de esas tablas en otro archivo.
- `bloqueo_proveedora_con_movimientos`: una proveedora con cuenta corriente u OF no se elimina ("Desactívala").
- `bloqueo_producto_con_movimientos`: un producto con movimientos de inventario no se elimina ("Ocúltalo de la tienda").
- `cotizacion_con_venta`: una cotización con venta no cambia sus líneas (antes se borraban y se rehacían); notas, estado, validez y cliente sí.

## Riesgos de operación

- `pruebas_con_base_real`: `npm run test:db` corre las server actions de verdad (cotizar → vender → orden → pago a proveedora → editar → despachar → entregar → anular, y los tres "deshacer") contra un Postgres desechable; en GitHub Actions corre antes de construir la imagen. Solo acepta un `DATABASE_URL` en localhost porque borra el esquema. La base se arma con `prisma db push`, no con `migrate deploy`: las migraciones no arman la base desde cero (ninguna crea la tabla "Sale").
- `proveedora_sin_desactivar`: hoy no hay botón para desactivar una proveedora; el mensaje "Desactívala" no tiene a dónde llevar.

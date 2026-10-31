## Reglas de negocio

- `editar_compra`: editar una compra actualiza la misma orden (mismo ORD y COM, estado, despachos y pagos); el stock y la deuda solo cambian por lo que se cambió. No se quita una línea despachada o con pagos, ni se cambia la proveedora de una línea con pagos. Una compra anulada no se edita.
- `anular_con_motivo`: cancelar una orden pide motivo (queda en el historial). Una compra completada se puede anular; anularla no toca stock, cargos ni pagos. Una compra con pagos no se puede eliminar: solo anular.

## Riesgos de operación

- `compras_editadas_antes`: las compras editadas antes de este arreglo ya perdieron su número original y lo que tenían (pagos, despachos, flete); esto no las recupera. La ORD-00092 se repara con `npm run compras:reparar-92` (simula; `--aplicar` escribe).
- `anular_compra_no_devuelve`: anular una compra deja su stock y su deuda como estaban; devolver stock o quitar la deuda se hace a mano en Inventario y Proveedores.

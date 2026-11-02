## Reglas de negocio

- `anular_venta`: "Anular venta" (Ventas, menú ⋯) pide motivo y deja la venta y su orden en CANCELLED, con el motivo en el historial de la orden; repone el stock ya confirmado. No borra abonos, fletes, despachos ni pagos/cargos a proveedoras. La venta anulada no cuenta en las tarjetas de Ventas, Balances, Comisiones, Nómina ni en `listar_abonos` (sus abonos se listan marcados con `venta_cancelada`). Sus abonos sí siguen en el saldo de las cuentas (la plata entró; una devolución se anota a mano).
- `borrado_definitivo`: el permiso `hard_delete` ("Borrado definitivo") es solo del dueño: un ADMIN con su ficha de Equipo marcada "Dueño" (`canHardDelete`). No sale en Control de módulos. "Borrar definitivamente" una venta pide motivo y guarda antes en Actividad la copia completa (venta, orden, historial, abonos, fletes, despachos y movimientos de proveedora).
- `marca_dueno`: en Equipo, solo el dueño puede marcar o quitar "Dueño" o cambiar el usuario de su ficha (si aún no hay dueño con usuario, solo el ADMIN más antiguo).
- `bitacora_antes_despues`: cotizaciones (crear, editar, borrar con copia completa), órdenes (crear, cambiar estado, asignar, cancelar), OF (editar) y compras COM (editar, anular) anotan en Actividad su código y cómo estaba antes y después.

## Riesgos de operación

- `cotizacion_de_venta_anulada`: una cotización cuya venta se anuló no puede generar otra venta; se hace una cotización nueva.

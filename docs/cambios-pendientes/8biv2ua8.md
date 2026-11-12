## Reglas de negocio

- `cambiar_producto`: «Cambiar producto» (nov-2026, sin migración) cambia un producto de una venta en un solo paso desde Editar orden: en una transacción reactiva la orden si estaba cancelada (casilla obligatoria), agrega el nuevo a la cotización y la orden, cancela el viejo con el motivo (stock de vuelta o cargo a la proveedora anulado, aviso en la OF, copia en `RegistroAnulado`) y recalcula total y saldo. Los abonos no se tocan: el saldo es el nuevo total menos lo pagado (si pagó de más queda saldo a favor). Si el viejo ya está en una OF hay que marcar que se entiende el aviso. Si el viejo no se puede cancelar, no se agrega nada. Deja una nota «Cambió X por Y. Motivo: … Total: $… · Saldo: $…» y una entrada en la bitácora. Código en `src/lib/sale-item-swap.server.ts` (`cambiarProductoDeVenta`) y `faltaEnCambio` en `src/lib/sale-item-cancel.ts`.

## Riesgos de operación

- `cambiar_producto_balances`: si la venta estaba pagada por completo y el producto nuevo es más caro, vuelve a «por cobrar» y sale de Balances hasta pagar la diferencia (aunque fuera de un mes ya cerrado); si es más barato, queda saldo a favor sin devolución automática.

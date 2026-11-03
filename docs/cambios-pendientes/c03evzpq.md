## Entidades

- `CompraUnidad`: una unidad de una compra por lote a proveedora (ej. un combo de los 6 que se le pidieron a Laura). Liga la compra (`orderId`, borrado en cascada), el producto de la línea, el `estado` (PENDIENTE → FABRICANDO → EN_INVENTARIO → VENDIDA), la `ubicacion` (Cali o Taller proveedora), el `color` y la orden de venta que se la llevó (`saleOrderId`). PENDIENTE y FABRICANDO todavía no están en el inventario. Migración `20261105120000_compra_por_lote`, solo aditiva. Parte 1 de 3: aún no hay pantalla que la llene.

## Reglas de negocio

- `compra_por_lote`: reglas puras en `src/modules/inventory/domain/purchase-lot.ts`: `splitPurchaseLine` (de lo comprado, cuántas entran ya y cuántas quedan pendientes), `validateLotTransition` (fabricar exige color; llegó exige Cali o Taller proveedora; vender solo desde inventario y con orden de venta) y `summarizeLotUnits` (cuántas en Cali, taller, fabricando, pendientes y vendidas).
- `revisor_compras_por_lote`: el revisor diario espera en el inventario lo comprado menos las unidades PENDIENTE o FABRICANDO de esa compra (un combo se resta por sus piezas: pendientes × cantidad de cada componente). Una compra con todo pendiente no es "sin entrada". Sin filas en `CompraUnidad` revisa igual que antes.

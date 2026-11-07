## Reglas de negocio

- `despacho_colectivo_o_individual`: en el detalle de una orden, al marcar varios productos sale "Despachar N" solo con los Recogidos (los que se fabrican quedan fuera con aviso) y todos salen en un solo despacho; el **Despachar** de cada fila despacha solo ese producto. Si un producto ya no está listo al guardar, no se despacha nada ni se registra flete. La orden pasa a Despachada solo cuando todos sus productos están despachados (también al despachar desde `/admin/despachos` y con **Marcar despachada**); los despachos viejos sin productos ligados siguen como antes. Reglas en `src/lib/order-dispatch.ts`.
- `entrega_con_varios_despachos`: el paso Entregar de la orden queda listo solo con todo despachado y entregado, y **Registrar entrega** toma el primer despacho sin entregar.

## Riesgos de operación

- `revision_despachos_incompletos`: `npm run ordenes:revisar-despachos` (solo lectura, sin `--aplicar`) lista órdenes Despachadas o Cerradas con productos sin despacho y Recogidos sin salir mientras otro ya salió. No corrige nada: las Despachadas se terminan con el flujo normal y las Cerradas las decide Alexander.

## Pantallas

- `alerta_combo_camillas_ventas`: en /admin/ventas, una venta con el Combo Camillas (o sin productos) que no tiene orden ni está cancelada muestra la insignia roja "Falta el producto: no se pudo crear la orden". Se calcula al cargar la lista (`necesitaAlertaCombo`), no se guarda y se quita sola al crear la orden.
- `aviso_orden_sola_laura`: en la orden, la tarjeta de fabricación de Laura muestra "Orden creada sola para Laura. Envíale el link" junto a Ver / Copiar enlace / Enviar por WhatsApp cuando la orden se creó sola (bitácora "Orden creada sola (Combo Camillas)") o es del combo. No se le manda nada a Laura sin que la asesora lo haga.

## Automatizaciones

- `combo_camillas_rellenar`: `npm run combo:rellenar` revisa SAL-00081 y SAL-00082 y muestra qué haría (simulación). Con `--aplicar` crea la orden de Laura con la misma lógica de la app (`crearOrdenCombo`), una vez por venta y solo si `planComboOrder` dice "crear"; si no trae productos no inventa nada y la deja con la alerta. Corre con vite-node y `scripts/vite-node.config.mjs`.

## Riesgos de operación

- `combo_camillas_rellenar_comisiones`: aplicar el relleno carga el costo del combo a esas ventas: baja su ganancia en Balances, la comisión de octubre de quien las vendió (Ingrid en SAL-00082) y crea el cargo en la cuenta de Laura. Revisar la simulación con el dueño antes de `--aplicar`.

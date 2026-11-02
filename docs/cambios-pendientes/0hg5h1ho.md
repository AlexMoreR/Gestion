## Reglas de negocio

- `revisor_diario`: cada mañana (7:00 a. m., cron en aizen1, `scripts/revisor`) `GET /api/revisor` revisa, solo leyendo, ventas "Pagada" con saldo o pagadas sin marcar, pagos o cargos a proveedora sin su orden, stock negativo, ítems por stock confirmados o entregados sin su salida, compras sin su entrada, con otra cantidad o recibidas sin "Completada", borrados de ventas, órdenes o abonos sin copia en anulados (desde el 1-nov-2026), huecos ORD/SAL/COM, cuentas en negativo y saldos que cambiaron sin movimientos que lo expliquen. Avisa por correo: lo nuevo a Sistemas (`REVISOR_CORREO_SISTEMAS`); lo de plata que sigue desde ayer, también al dueño (`REVISOR_CORREO_DUENO`). No corrige nada.

## Riesgos de operación

- `revisor_fuera_de_la_imagen`: el revisor corre por cron en aizen1; si el servidor está apagado no llega nada, y si falta el JSON de ayer ese día no compara saldos. `REVISOR_API_KEY` va en los dos lugares (`docker service update --env-add` y el compose de Portainer); quien la tenga ve códigos, montos y saldos.
- `revisor_primer_dia`: el primer día todos los hallazgos son "nuevos" (incluidos huecos viejos de numeración): llega un correo largo a Sistemas; desde el segundo día solo lo nuevo.

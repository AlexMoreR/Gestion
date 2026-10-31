## Reglas de negocio

- `aviso_diario_dinero`: cada mañana (7:00 a. m., cron en aizen1, `scripts/alertas/alerta-dinero.mjs`) se consulta `GET /api/alertas/dinero` (solo lectura, llave `ALERTAS_API_KEY` o `MCP_API_KEY`) y, solo si una cuenta está en negativo o en las últimas 24 h se guardó un abono, flete o pago a proveedora sin cuenta, se le manda a Alexander un WhatsApp corto por la línea Admin (WAHA) con la cuenta y su saldo, o la venta/proveedora y el monto. La retención en la fuente no cuenta. Si todo está bien, no manda nada.

## Riesgos de operación

- `aviso_diario_dinero_falla`: si el cron, Gestión o WAHA fallan, ese día el aviso no llega ni se reintenta (error en `/var/log/magilus-alertas.log`). Lo sin cuenta de hace más de 24 h no se vuelve a avisar (se ve en Balances). Quien tenga la llave ve los saldos.

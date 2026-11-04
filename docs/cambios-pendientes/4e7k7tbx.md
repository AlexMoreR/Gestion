## Reglas de negocio

- `recibo_de_caja`: al pasar una cotización a venta (un solo recibo por todas las cuotas) y en cada abono nuevo (no la retención en la fuente ni la venta de mostrador), Gestión manda al CRM un recibo de caja en PDF (POST a `CRM_RECIBO_URL`, por defecto `https://crm.magilus.com/api/gestion/recibo-de-caja`, Bearer `CRM_API_KEY` → `CATALOGO_API_KEY` → `MCP_API_KEY`), después de responder a la asesora y con reintentos a los 2, 8 y 30 s. El abono guarda `reciboCajaEstado` (ENVIADO/FALLIDO) y `reciboCajaEn`; `/admin/ventas` → Registrar abono → «Abonos registrados» muestra «Recibo enviado» o «Recibo no enviado». `RECIBO_CAJA_AVISO=off` lo apaga.

## Riesgos de operación

- `recibo_de_caja_sin_reintento`: si el CRM está caído más de ~40 s, la llave no coincide o el contenedor se reinicia justo al guardar, el recibo no sale y no se reintenta solo. Cuando el CRM salga de modo PRUEBA, estos recibos les llegan a los clientes por WhatsApp.

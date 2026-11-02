## Entidades

- `ActivityLog`: la bitácora ahora guarda también el código de la cosa (`entityCode`), cómo estaba antes y cómo quedó (`before`/`after`, JSON con solo los campos esenciales, sin fotos ni comprobantes), el origen (`origin`: PANTALLA, MCP, CRM, SCRIPT, MIGRACION o COORDINADOR; vacío = Pantalla), la tarjeta (`ticket`) y el commit (`commitSha`). Migración `20261031120000_bitacora_completa`, solo aditiva. `logActivityTx` anota dentro de una transacción y falla si no puede (parte 1 de 4: todavía nada lo usa).

## Pantallas

- `/admin/configuracion/actividad`: columna "Origen" (las entradas viejas dicen "Pantalla"), el código debajo del detalle y filtro "Código" (`?codigo=`).

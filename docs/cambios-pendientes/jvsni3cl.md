## Riesgos de operación

- `precios_vigentes_cerebro`: un cron en aizen1 (cada 30 min, `scripts/precios-vigentes/subir-precios-vigentes.sh`) sube la hoja "Precios vigentes" de `/api/asesor/precios-vigentes` a la carpeta Magilus del cerebro en Drive, solo si cambió. La hoja lleva el COSTO de cada producto y usa un remoto de rclone con permiso `drive` (todo el Drive): esa carpeta no la debe leer el bot de ventas ni las asesoras. Si falla, llega el correo de aviso del respaldo.

# Hoja "Precios vigentes" al cerebro (aizen1)

`subir-precios-vigentes.sh` baja la hoja de Gestión (`GET /api/asesor/precios-vigentes`, llave
`MCP_API_KEY`) y la sube con rclone a la carpeta Magilus del cerebro en Drive, **solo si cambió**
(se compara con la última subida, `ultima.md`, sin contar la línea `Generado:`). Si no cambió, deja
`sin cambios` en el registro. Si algo falla, manda el correo de `../respaldo/aviso-fallo.sh` (con su
propio asunto), **uno solo por racha de fallas**: la marca `.avisado` del directorio de estado se
borra cuando una corrida vuelve a salir bien.
Corre en aizen1 por cron, **fuera de la imagen** de Gestión.

> **Ojo: la hoja lleva COSTOS.** La carpeta Magilus del cerebro no la debe leer el bot de ventas
> ni las asesoras. Solo Claude (el asesor del dueño).

## Instalar

1. Requisitos en aizen1: `curl`, `flock` y `rclone` en el PATH.
2. Copiar los scripts (el aviso se busca en `../respaldo/`, el mismo del respaldo nocturno):

   ```bash
   sudo install -d -m 700 /opt/magilus/precios-vigentes /opt/magilus/respaldo
   sudo install -m 700 subir-precios-vigentes.sh /opt/magilus/precios-vigentes/
   sudo install -m 700 ../respaldo/aviso-fallo.sh /opt/magilus/respaldo/
   ```

3. Agregar a `/etc/magilus/respaldo.env` las variables `PRECIOS_*`, `MCP_API_KEY` y
   `RCLONE_CONFIG_CEREBRO_*` (ver `../respaldo/respaldo.env.example`). El remoto `cerebro` necesita
   permiso `drive` (no `drive.file`): lo tiene que autorizar Alexander con `rclone authorize "drive"`.
   Otro archivo: `PRECIOS_ENV=/ruta/al.env`.
4. Probar sin subir nada (imprime la hoja):

   ```bash
   sudo PRECIOS_SOLO_MOSTRAR=1 /opt/magilus/precios-vigentes/subir-precios-vigentes.sh | head
   ```

5. Cron de root cada 30 minutos, hora de Colombia (`crontab -e`; cada media hora cae igual en
   cualquier zona, y el registro ya escribe la hora de Colombia):

   ```
   */30 * * * * /opt/magilus/precios-vigentes/subir-precios-vigentes.sh >/dev/null 2>&1
   ```

Registro: `/var/log/magilus-precios-vigentes.log` (`PRECIOS_LOG`).

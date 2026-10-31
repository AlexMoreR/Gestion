# Aviso diario de dinero por WhatsApp

Una vez al día, `alerta-dinero.mjs` le pregunta a Gestión (`GET /api/alertas/dinero`) si hay algo
que avisar y, **solo si hay algo**, se lo manda a Alexander por WhatsApp desde la línea Admin (WAHA):

- una cuenta en saldo negativo (se repite cada día mientras siga así), o
- un abono, flete o pago a proveedora guardado **sin cuenta** en las últimas 24 h
  (la retención en la fuente no cuenta; los gastos no pueden quedar sin cuenta).

Máximo 2 líneas. Si todo está bien no manda nada. Solo lee: no cambia ningún dato.
Corre en aizen1 por cron, **fuera de la imagen** (igual que `scripts/respaldo/`).

## Instalar (una vez, en aizen1)

1. En el servicio de Gestión, agregar la llave (larga, 24+ caracteres) en los dos lugares que dice
   el CLAUDE.md (sección 9): `docker service update --env-add ALERTAS_API_KEY=... magilus_app_magilus_app`
   y una línea en el compose de Portainer. Si no se agrega, la ruta usa `MCP_API_KEY`.
2. Copiar el script y las claves:

   ```bash
   sudo mkdir -p /opt/magilus/alertas /etc/magilus
   sudo cp scripts/alertas/alerta-dinero.mjs /opt/magilus/alertas/
   sudo install -m 600 -o root -g root scripts/alertas/alertas.env.example /etc/magilus/alertas.env
   sudo nano /etc/magilus/alertas.env   # llenar los valores
   ```

3. Probar sin mandar nada:

   ```bash
   sudo node --env-file=/etc/magilus/alertas.env /opt/magilus/alertas/alerta-dinero.mjs --simular
   ```

   Muestra el texto que mandaría, o `todo bien, no se manda nada`.

4. Cron a las **7:00 a. m. de Colombia** (`sudo crontab -e`). La hora del cron es la del servidor:
   mirar `date`; si aizen1 está en hora de Colombia va `0 7`, si está en UTC va `0 12`.

   ```
   0 7 * * * node --env-file=/etc/magilus/alertas.env /opt/magilus/alertas/alerta-dinero.mjs >> /var/log/magilus-alertas.log 2>&1
   ```

Necesita Node 20 o más (por `--env-file`).

## Si algo falla

El error queda en `/var/log/magilus-alertas.log` (`ERROR alerta de dinero: ...`). El script **no
reintenta**, para no mandar el mismo mensaje dos veces: ese día el aviso no llega. Lo guardado sin
cuenta hace más de 24 h no se vuelve a avisar; el total viejo se sigue viendo en Balances.

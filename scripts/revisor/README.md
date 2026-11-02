# Revisor diario de Gestión (aizen1, 7:00 a. m.)

`revisor-diario.sh` llama cada mañana a `GET /api/revisor` de Gestión, que **solo lee** la base y
devuelve `{ fecha, fechaSaldos, hallazgos: [{ tipo, codigo, detalle, esPlata }], saldos }`. Guarda la
respuesta en `/opt/magilus/revisor/AAAA-MM-DD.json` y decide a quién avisar con `decidir-avisos.mjs`:

- Un hallazgo **nuevo** (mismo tipo y código no estaba ayer) → correo a **Sistemas** (`REVISOR_CORREO_SISTEMAS`).
- Un hallazgo **de plata que ya estaba ayer** (sigue sin arreglar) → correo a Sistemas **y al dueño**
  (`REVISOR_CORREO_DUENO`).
- Lo que ya se avisó y no es de plata no se repite. Sin hallazgos nuevos, no sale ningún correo.

Los correos salen por `../respaldo/aviso-fallo.sh` (el mismo SMTP del respaldo nocturno). **Gestión no
manda WhatsApp.** Si el revisor no puede correr (Gestión caída, llave mala), avisa a Sistemas.

Qué revisa (reglas en `src/modules/revisor/domain/checks.ts`): ventas "Pagada" con saldo o pagadas sin
marcar; pagos o cargos a proveedora sin su orden; stock negativo; ítems por stock confirmados o
entregados sin su salida; compras sin su entrada o con otra cantidad; compras recibidas que no están
"Completada"; borrados de ventas, órdenes o abonos sin copia en anulados (desde el 1-nov-2026); huecos
en la numeración ORD, SAL y COM; cuentas en negativo; y saldos que cambiaron sin movimientos que lo
expliquen (el saldo al cierre de ayer contra el que reportó la corrida anterior, que el script manda
como `?saldosAyer=`). Si falta el JSON de ayer, ese día no se comparan saldos.

## Instalar

1. Requisitos en aizen1: `bash`, `curl` y `node` (18 o más) en el PATH.
2. La llave. En Gestión va `REVISOR_API_KEY` (mínimo 24 caracteres) **en los dos lugares**, si no se
   pierde en el próximo despliegue:

   ```bash
   docker service update --env-add REVISOR_API_KEY=<llave> magilus_app_magilus_app
   ```

   y una línea `REVISOR_API_KEY: <llave>` en el compose de Portainer del stack `magilus_app`
   (`/var/lib/docker/volumes/portainer_data/_data/compose/10/docker-compose.yml`; copia antes de
   editarlo). Sin `REVISOR_API_KEY`, la ruta acepta `MCP_API_KEY`.
3. Copiar los scripts (el aviso se busca en `../respaldo/`):

   ```bash
   sudo install -d -m 700 /opt/magilus/revisor /opt/magilus/respaldo
   sudo install -m 700 revisor-diario.sh decidir-avisos.mjs /opt/magilus/revisor/
   sudo install -m 700 ../respaldo/aviso-fallo.sh /opt/magilus/respaldo/
   ```

4. Crear `/etc/magilus/revisor.env` (ver `revisor.env.example`, `chmod 600`) con la llave y los dos
   correos. El SMTP lo toma de `/etc/magilus/respaldo.env`.
5. Probar a mano (deja el JSON del día y, si hay hallazgos, manda el correo):

   ```bash
   sudo /opt/magilus/revisor/revisor-diario.sh
   ```

6. Cron de root a las **7:00 a. m. de Colombia** (`sudo crontab -e`). La hora del cron es la del
   servidor: si aizen1 está en hora de Colombia va `0 7`, si está en UTC va `0 12`.

   ```
   0 7 * * * /opt/magilus/revisor/revisor-diario.sh >/dev/null 2>&1
   ```

Registro: `/var/log/magilus-revisor.log` (`REVISOR_LOG`). Los JSON del día no se borran solos (pesan poco).

## Pruebas

```bash
node --test scripts/revisor/decidir-avisos.test.mjs
```

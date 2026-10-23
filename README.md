# Gestión (Magilus)

Plataforma web de **Magilus**: la tienda pública (`magilus.com`) y el panel interno (`/admin`) con
catálogo, inventario, cotizaciones, ventas, órdenes, producción, despachos, balances, gastos, nómina y
transporte. La descripción completa del proyecto está en [`CLAUDE.md`](CLAUDE.md).

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # pruebas (Vitest)
npx tsc --noEmit   # tipos
npm run build      # build de producción
```

Necesita un `.env` con `DATABASE_URL` (PostgreSQL) y `AUTH_SECRET`. Hacer push a `main` despliega a
producción (GitHub Actions → GHCR → Portainer); las migraciones se aplican solas al arrancar.

---

## Respaldo de la base de datos

Todas las noches a las **2:30 a. m. (hora Colombia)** el servidor **aizen1** saca una copia completa de la
base de Gestión (ventas, abonos, cotizaciones, clientes, nómina, cuentas…), la guarda en
`/opt/respaldos/gestion/` y la sube al Google Drive de Magilus, carpeta **`Respaldos/Gestion`**.
Se guardan los **últimos 30 días**; lo más viejo se borra solo de esa carpeta. Si algo falla llega un
correo a **gestionmagilus@gmail.com** diciendo en qué paso falló.

- Nombre de cada archivo: `gestion-AAAA-MM-DD_HHMM.dump` (formato `custom` de `pg_dump`, ya comprimido).
- Los scripts están en [`scripts/respaldo/`](scripts/respaldo) y corren **fuera de la app** (no van en la
  imagen Docker ni cambian con cada despliegue).
- **La carpeta de Drive no se comparte con nadie**: los respaldos traen datos personales (cédulas,
  celulares, direcciones).
- Las **fotos y comprobantes** (`/public/uploads`) **no** entran en este respaldo.
- **Señal a revisar cada mañana:** que haya un archivo nuevo en Drive. Si el servidor estaba apagado no
  hay respaldo ni correo.

| Archivo | Para qué |
|---|---|
| `respaldo-gestion.sh` | El respaldo nocturno: volcado → revisión → copia en aizen1 → Drive → borrar lo de más de 30 días. |
| `aviso-fallo.sh` | Manda el correo de falla (mismo SMTP de Gestión). |
| `retencion.mjs` | Regla de qué se borra: solo `gestion-AAAA-MM-DD_HHMM.dump` con más de 30 días, y nunca el más reciente. Pruebas en `retencion.test.mjs`. |
| `restaurar-prueba.sh` | Carga el último respaldo en una base desechable y compara cantidades con producción. |
| `respaldo.env.example` | Ejemplo de las claves (sin valores reales). |

Orden de seguridad del respaldo: primero confirma que la copia nueva quedó sana en aizen1 **y** en Drive
(mismo tamaño) y solo después borra las viejas. Si cualquier paso falla, no se borra nada.

### Instalación en aizen1 (una sola vez)

Requisitos del servidor: `docker`, `flock`, `timeout`, `tzdata` y `curl` (si no hay `curl` ni `node`, se usan sus imágenes de
Docker).

**1. Usuario de solo lectura en Postgres.** Lo crea a mano un administrador de la base (no va en una
migración porque llevaría la contraseña en el código):

```sql
CREATE ROLE gestion_respaldo LOGIN PASSWORD '<clave larga>';
GRANT CONNECT ON DATABASE <base de gestion> TO gestion_respaldo;
GRANT pg_read_all_data TO gestion_respaldo;              -- Postgres 14 o más nuevo
ALTER ROLE gestion_respaldo SET default_transaction_read_only = on;
```

Ese usuario no puede borrar ni cambiar nada. (En Postgres 13 o más viejo, en vez de `pg_read_all_data`:
`GRANT USAGE ON SCHEMA public`, `GRANT SELECT ON ALL TABLES IN SCHEMA public` y
`GRANT SELECT ON ALL SEQUENCES IN SCHEMA public`, más `ALTER DEFAULT PRIVILEGES` para las tablas nuevas.)

Ojo: `pg_read_all_data` vale para **todas** las bases de ese Postgres, y por defecto cualquier usuario se
puede conectar a cualquier base. Si en el mismo Postgres está la base de AizenCRM u otra, quitarle el
acceso: `REVOKE CONNECT ON DATABASE <otra base> FROM PUBLIC;` (antes, confirmar que el usuario de esa
app tiene su propio `GRANT CONNECT`, para no dejarla sin acceso).

**2. Copiar los scripts** (desde este repo):

```bash
ssh aizen1 'sudo mkdir -p /opt/magilus/respaldo /etc/magilus'
scp scripts/respaldo/*.sh scripts/respaldo/retencion.mjs scripts/respaldo/respaldo.env.example aizen1:/tmp/
ssh aizen1 'cd /tmp && sudo install -m 700 -o root -g root respaldo-gestion.sh aviso-fallo.sh restaurar-prueba.sh /opt/magilus/respaldo/ \
  && sudo install -m 600 -o root -g root retencion.mjs /opt/magilus/respaldo/'
```

**3. Conectar Google Drive** (en un computador con navegador, con [rclone](https://rclone.org/downloads/)):

```bash
rclone config      # n (nuevo) → nombre: drive → tipo: drive → client_id/secret: vacío (o los propios)
                   # → scope: 3 "drive.file" → sin opciones avanzadas → autorizar en el navegador
                   #   con la cuenta de Google de Magilus → no es Shared Drive
rclone config show drive   # copiar client_id, client_secret y token
```

Con `drive.file` rclone **solo ve lo que él mismo creó**: no puede ver ni borrar nada más del Drive. Por
eso la carpeta `Respaldos/Gestion` la crea rclone en el primer respaldo (no crearla a mano).

- Después de copiar los datos, **borrar el remoto del computador** (`rclone config delete drive`): las
  claves solo deben quedar en el servidor.
- Si se usa un client_id propio de Google Cloud, la app debe estar **publicada** (no en modo "Testing"):
  en modo Testing el permiso se vence a los 7 días y la subida fallaría cada semana.
- Los respaldos viejos que se borran en Drive van a la **papelera** de Drive (Google los elimina del todo
  a los 30 días).

**4. Claves**: copiar el ejemplo, llenarlo y protegerlo (solo root lo puede leer):

```bash
sudo install -m 600 -o root -g root /tmp/respaldo.env.example /etc/magilus/respaldo.env
sudo nano /etc/magilus/respaldo.env    # PGHOST, PGPASSWORD, red de Docker, token de Drive, SMTP...
```

`PGHOST` y `RESPALDO_DOCKER_RED` deben ser el host y la red con los que Gestión llega a Postgres (ver
`DATABASE_URL` del stack `magilus_app`); la red debe ser *attachable*. El SMTP es el mismo de Gestión.

**5. Tarea programada** (`/etc/cron.d/magilus-respaldo`). El servidor corre en UTC (revisar con `date`):
2:30 a. m. de Colombia = 7:30 UTC (Colombia no cambia de horario). Si el servidor estuviera en hora de
Colombia, poner `30 2` en vez de `30 7`.

```cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Respaldo de Gestion: 2:30 a. m. Colombia (7:30 UTC)
30 7 * * * root /opt/magilus/respaldo/respaldo-gestion.sh >>/var/log/magilus-respaldo-cron.log 2>&1
```

El registro queda en `/var/log/magilus-respaldo.log`. En `magilus-respaldo-cron.log` quedan los errores
de antes de arrancar (por ejemplo, si no se puede leer `/etc/magilus/respaldo.env`): en ese caso no hay
correo, porque sin ese archivo no hay con qué mandarlo.

### Pruebas en aizen1

1. **Respaldo a mano:** `sudo /opt/magilus/respaldo/respaldo-gestion.sh` → debe aparecer
   `gestion-<fecha>.dump` en `/opt/respaldos/gestion/` y en Drive `Respaldos/Gestion`.
2. **Aviso:** correrlo con una clave de base equivocada a propósito y confirmar que llega el correo:
   ```bash
   sudo install -m 600 /etc/magilus/respaldo.env /tmp/malo.env && sudo sed -i "s/^PGPASSWORD=.*/PGPASSWORD='mala'/" /tmp/malo.env
   sudo RESPALDO_ENV=/tmp/malo.env /opt/magilus/respaldo/respaldo-gestion.sh; sudo rm /tmp/malo.env
   ```
3. **Limpieza:** crear un respaldo falso viejo y un archivo ajeno, correr el respaldo y confirmar que solo
   se borra el viejo:
   ```bash
   sudo touch /opt/respaldos/gestion/gestion-2020-01-01_0230.dump /opt/respaldos/gestion/factura.pdf
   sudo /opt/magilus/respaldo/respaldo-gestion.sh
   ls /opt/respaldos/gestion/     # factura.pdf sigue; gestion-2020-01-01_0230.dump ya no
   sudo rm /opt/respaldos/gestion/factura.pdf
   ```
4. **Restauración de prueba** (justo después de un respaldo, para que las cantidades coincidan):
   ```bash
   sudo /opt/magilus/respaldo/restaurar-prueba.sh            # o: ... restaurar-prueba.sh /ruta/archivo.dump
   ```
   Levanta un Postgres **desechable y sin red** (se borra solo al terminar), carga el respaldo y muestra
   una tabla con las cantidades de ventas, abonos, cotizaciones, clientes, cuentas, gastos… en la copia y
   en producción. Termina con `PRUEBA OK` si todo coincide. A producción solo la lee.

### Cómo restaurar (si se daña la base)

> **Nunca** restaurar encima de la base de producción que está funcionando. Se restaura en una base
> **nueva** y, cuando se confirma que está bien, se apunta Gestión a ella.

1. **Conseguir el archivo:** el más nuevo de `/opt/respaldos/gestion/` o, si aizen1 se perdió, bajarlo de
   Drive `Respaldos/Gestion`.
2. **Probarlo primero:** `restaurar-prueba.sh /ruta/gestion-AAAA-MM-DD_HHMM.dump`.
3. **Detener Gestión** para que nadie escriba mientras tanto:
   `docker service scale magilus_app_magilus_app=0`.
4. **Crear una base nueva y cargar el respaldo** con un usuario administrador de Postgres (no
   `gestion_respaldo`, que es de solo lectura), usando la misma versión de Postgres del servidor:
   ```bash
   docker run --rm -it --network <red de postgres> -v /opt/respaldos/gestion:/respaldos:ro \
     -e PGHOST=<host> -e PGUSER=<admin> -e PGPASSWORD='<clave admin>' postgres:<version>-alpine sh -c '
       createdb -O <usuario de la app> gestion_restaurada &&
       pg_restore --no-owner --role=<usuario de la app> -d gestion_restaurada /respaldos/gestion-AAAA-MM-DD_HHMM.dump'
   ```
   (`-O` y `--role` dejan la base y las tablas a nombre del usuario con el que se conecta Gestión. Si sale
   solo el error `schema "public" already exists`, se puede ignorar.)
5. **Apuntar Gestión a la base restaurada:** cambiar el nombre de la base en `DATABASE_URL`, en los dos
   lugares (ver `CLAUDE.md`, sección 9: `docker service update --env-add …` y el compose de Portainer).
6. **Volver a encender:** `docker service scale magilus_app_magilus_app=1` y revisar ventas, abonos y
   saldos en el panel. Lo registrado después de la hora del respaldo se perdió y hay que volver a cargarlo.

### Resultado de la prueba de restauración

| Fecha | Archivo | Resultado |
|---|---|---|
| _pendiente_ | _se anota al correr `restaurar-prueba.sh` en aizen1_ | _pendiente_ |

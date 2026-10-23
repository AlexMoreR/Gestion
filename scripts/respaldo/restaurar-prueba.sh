#!/usr/bin/env bash
# Prueba de restauracion del respaldo de Gestion. NUNCA toca la base de produccion para escribir.
#
# Uso: restaurar-prueba.sh [archivo.dump]   (por defecto, el respaldo mas nuevo de RESPALDO_DIR)
#
# 1. Crea una base de pruebas DESECHABLE: un contenedor de Postgres nuevo, sin red (--network none),
#    que se borra solo al terminar.
# 2. Carga el respaldo ahi con pg_restore (dentro de ese contenedor).
# 3. Cuenta ventas, abonos, cotizaciones, clientes, cuentas, gastos... en la copia y en produccion
#    (produccion solo se lee, con el usuario de solo lectura) y compara.
# Para que las cantidades coincidan, correrla justo despues de un respaldo (si alguien vende entre
# el respaldo y la prueba, produccion tendra mas registros que la copia).
set -Eeuo pipefail
umask 077

DIR_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=respaldo-gestion.sh
. "$DIR_SCRIPTS/respaldo-gestion.sh"
cargar_configuracion

ARCHIVO="${1:-}"
if [ -z "$ARCHIVO" ]; then
  ARCHIVO="$(find "$RESPALDO_DIR" -maxdepth 1 -type f -name 'gestion-*.dump' -printf '%p\n' | sort | tail -n 1)"
fi
if [ -z "$ARCHIVO" ] || [ ! -f "$ARCHIVO" ]; then
  echo "No hay respaldo para probar (${ARCHIVO:-$RESPALDO_DIR vacio})" >&2
  exit 1
fi
ARCHIVO="$(cd "$(dirname "$ARCHIVO")" && pwd)/$(basename "$ARCHIVO")"

CONTENEDOR="gestion-restauracion-prueba-$$"
BASE_PRUEBA="gestion_prueba"
trap 'docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true' EXIT

IMAGEN="$(imagen_postgres)"
marca "Respaldo a probar: $ARCHIVO"
marca "Base de pruebas desechable: contenedor $CONTENEDOR ($IMAGEN, sin red)"

docker run -d --rm --name "$CONTENEDOR" --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB="$BASE_PRUEBA" \
  -v "$ARCHIVO:/respaldo.dump:ro" \
  "$IMAGEN" >/dev/null

# El contenedor arranca Postgres dos veces (una para inicializar): se espera a que termine eso.
listo=""
for _ in $(seq 1 90); do
  # Sin grep -q: con pipefail, cortar la salida de docker logs daria un falso "no arranco".
  if docker logs "$CONTENEDOR" 2>&1 | grep 'PostgreSQL init process complete' >/dev/null \
    && docker exec "$CONTENEDOR" pg_isready -q -U postgres -d "$BASE_PRUEBA"; then
    listo=1
    break
  fi
  sleep 1
done
if [ -z "$listo" ]; then
  echo "La base de pruebas no arranco" >&2
  docker logs "$CONTENEDOR" 2>&1 | tail -n 20 >&2
  exit 1
fi

marca "Cargando el respaldo en la base de pruebas..."
ESTADO_RESTAURAR=0
SALIDA_RESTAURAR="$(docker exec "$CONTENEDOR" pg_restore --no-owner --no-privileges -U postgres -d "$BASE_PRUEBA" /respaldo.dump 2>&1)" || ESTADO_RESTAURAR=$?
# El unico error esperable es que el esquema public ya exista en la base nueva.
ERRORES="$(grep 'error:' <<<"$SALIDA_RESTAURAR" | grep -v 'schema "public" already exists' || true)"
if [ -n "$ERRORES" ]; then
  echo "pg_restore reporto errores:" >&2
  echo "$ERRORES" >&2
  exit 1
fi
marca "Respaldo cargado (pg_restore termino con codigo $ESTADO_RESTAURAR, sin errores reales)."

# Cantidades a comparar: tabla|cantidad. "(tablas)" = cuantas tablas hay en el esquema public.
CONSULTA="
SELECT '(tablas)', count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL SELECT 'Sale (ventas)', count(*) FROM \"Sale\"
UNION ALL SELECT 'SalePayment (abonos)', count(*) FROM \"SalePayment\"
UNION ALL SELECT 'Quote (cotizaciones)', count(*) FROM \"Quote\"
UNION ALL SELECT 'User (clientes y usuarios)', count(*) FROM \"User\"
UNION ALL SELECT 'Account (cuentas)', count(*) FROM \"Account\"
UNION ALL SELECT 'AccountMovement (movimientos)', count(*) FROM \"AccountMovement\"
UNION ALL SELECT 'Expense (gastos, nomina)', count(*) FROM \"Expense\"
UNION ALL SELECT 'TeamMember (equipo)', count(*) FROM \"TeamMember\"
UNION ALL SELECT 'Order (ordenes)', count(*) FROM \"Order\"
UNION ALL SELECT 'Product (productos)', count(*) FROM \"Product\"
UNION ALL SELECT '_prisma_migrations', count(*) FROM \"_prisma_migrations\"
"
COPIA="$(docker exec -i "$CONTENEDOR" psql -XAt -F '|' -v ON_ERROR_STOP=1 -U postgres -d "$BASE_PRUEBA" <<<"$CONSULTA")"
PRODUCCION="$(pg_produccion "$IMAGEN" psql -XAt -F '|' -v ON_ERROR_STOP=1 <<<"$CONSULTA")"

echo
printf '%-32s %12s %12s  %s\n' "Tabla" "Copia" "Produccion" ""
diferencias=0
while IFS='|' read -r tabla en_copia; do
  en_produccion="$(awk -F '|' -v t="$tabla" '$1 == t { print $2 }' <<<"$PRODUCCION")"
  if [ "$en_copia" = "$en_produccion" ]; then marca_fila="igual"; else marca_fila="DISTINTO"; diferencias=$((diferencias + 1)); fi
  printf '%-32s %12s %12s  %s\n' "$tabla" "$en_copia" "$en_produccion" "$marca_fila"
done <<<"$COPIA"
echo

if [ "$diferencias" -eq 0 ]; then
  marca "PRUEBA OK: la copia restaurada tiene las mismas cantidades que produccion."
else
  marca "PRUEBA CON DIFERENCIAS ($diferencias). Si se vendio o registro algo despues del respaldo es normal: saque un respaldo nuevo y repita la prueba enseguida."
  exit 2
fi

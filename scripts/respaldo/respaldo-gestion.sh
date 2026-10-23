#!/usr/bin/env bash
# Respaldo nocturno de la base de datos de Gestion (corre en aizen1, fuera de la app).
#
# 1. Saca un volcado completo (pg_dump, formato custom = ya comprimido) con el usuario de SOLO
#    LECTURA gestion_respaldo y con las herramientas de la misma version de Postgres del servidor.
# 2. Revisa que el archivo este sano (pg_restore --list) y lo deja en RESPALDO_DIR.
# 3. Lo sube a Google Drive (RESPALDO_DRIVE_DESTINO, por defecto "Respaldos/Gestion").
# 4. Solo si todo lo anterior salio bien, borra los respaldos de mas de RESPALDO_DIAS dias, en
#    aizen1 y en Drive. Que se borra lo decide retencion.mjs: solo archivos con nombre
#    "gestion-AAAA-MM-DD_HHMM.dump" y solo dentro de la carpeta de respaldos.
# Si cualquier paso falla, manda un correo (aviso-fallo.sh) y no borra nada.
#
# Configuracion: /etc/magilus/respaldo.env (ver respaldo.env.example). Requiere docker y flock.
# Este archivo tambien lo usa restaurar-prueba.sh (lo carga con `source` para reutilizar funciones).

DIR_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESPALDO_ENV="${RESPALDO_ENV:-/etc/magilus/respaldo.env}"
PASO="inicio"

marca() { echo "[$(TZ=America/Bogota date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Falla (y dispara el aviso) si falta alguna variable.
requerir() {
  local variable
  for variable in "$@"; do
    if [ -z "${!variable:-}" ]; then
      echo "Falta la variable $variable en $RESPALDO_ENV"
      return 1
    fi
  done
}

cargar_configuracion() {
  if [ ! -r "$RESPALDO_ENV" ]; then
    echo "No se puede leer $RESPALDO_ENV" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$RESPALDO_ENV"
  set +a
  RESPALDO_DIR="${RESPALDO_DIR:-/opt/respaldos/gestion}"
  RESPALDO_DIAS="${RESPALDO_DIAS:-30}"
  RESPALDO_MIN_LIBRE_MB="${RESPALDO_MIN_LIBRE_MB:-2048}"
  RESPALDO_LOG="${RESPALDO_LOG:-/var/log/magilus-respaldo.log}"
  RESPALDO_DRIVE_DESTINO="${RESPALDO_DRIVE_DESTINO:-drive:Respaldos/Gestion}"
  RESPALDO_RCLONE_IMAGEN="${RESPALDO_RCLONE_IMAGEN:-rclone/rclone:latest}"
  RESPALDO_NODE_IMAGEN="${RESPALDO_NODE_IMAGEN:-node:20-alpine}"
  # Tiempo maximo de cada contenedor (pg_dump, subida...): si algo se cuelga, falla y avisa esa noche.
  RESPALDO_LIMITE="${RESPALDO_LIMITE:-2h}"
}

# Corre una herramienta de Postgres (psql, pg_dump...) contra PRODUCCION, en un contenedor
# desechable. PGOPTIONS fuerza transacciones de solo lectura, ademas del usuario de solo lectura.
pg_produccion() {
  local imagen="$1"
  shift
  local red=()
  if [ -n "${RESPALDO_DOCKER_RED:-}" ]; then red=(--network "$RESPALDO_DOCKER_RED"); fi
  timeout "$RESPALDO_LIMITE" docker run --rm -i "${red[@]}" \
    -e PGHOST -e PGPORT -e PGDATABASE -e PGUSER -e PGPASSWORD \
    -e PGCONNECT_TIMEOUT=20 -e "PGOPTIONS=-c default_transaction_read_only=on" \
    -v "$RESPALDO_DIR:/respaldos" \
    "$imagen" "$@"
}

# Imagen de Postgres con la misma version (mayor) que el servidor de produccion.
imagen_postgres() {
  if [ -n "${RESPALDO_PG_IMAGEN:-}" ]; then
    echo "$RESPALDO_PG_IMAGEN"
    return 0
  fi
  local version
  version="$(pg_produccion postgres:17-alpine psql -XAtc "show server_version_num")"
  version="${version//[^0-9]/}"
  if [ -z "$version" ]; then
    echo "No se pudo leer la version de Postgres del servidor" >&2
    return 1
  fi
  echo "postgres:$((version / 10000))-alpine"
}

# Ejecuta rclone (Drive) en un contenedor. La configuracion de Drive va solo en variables
# RCLONE_CONFIG_* del archivo de entorno: no hay archivo de configuracion de rclone.
rclone_drive() {
  local entorno=() variable
  for variable in $(compgen -e | grep '^RCLONE_' || true); do entorno+=(-e "$variable"); done
  timeout "$RESPALDO_LIMITE" docker run --rm -i "${entorno[@]}" -v "$RESPALDO_DIR:/respaldos" "$RESPALDO_RCLONE_IMAGEN" "$@"
}

# Lee nombres por stdin y devuelve los que hay que borrar (regla en retencion.mjs).
# Usa el node del servidor solo si es 18 o mas nuevo; si no, el de la imagen de Docker.
retencion() {
  local mayor=0
  if command -v node >/dev/null 2>&1; then mayor="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"; fi
  if [ "${mayor:-0}" -ge 18 ] 2>/dev/null; then
    node "$DIR_SCRIPTS/retencion.mjs" --dias "$RESPALDO_DIAS"
  else
    docker run --rm -i -v "$DIR_SCRIPTS:/respaldo-scripts:ro" "$RESPALDO_NODE_IMAGEN" \
      node /respaldo-scripts/retencion.mjs --dias "$RESPALDO_DIAS"
  fi
}

fallo() {
  local codigo="$1" linea="$2"
  # Dentro de un $(...) solo se sale: el aviso lo manda una sola vez el script principal.
  if [ "$BASH_SUBSHELL" -gt 0 ]; then exit "$codigo"; fi
  trap - ERR
  marca "ERROR en el paso \"$PASO\" (linea $linea, codigo $codigo). No se borro ningun respaldo viejo."
  sleep 1 # deja que el registro termine de escribirse antes de adjuntarlo
  "$DIR_SCRIPTS/aviso-fallo.sh" "$PASO" "${REGISTRO_CORRIDA:-}" || marca "Tampoco se pudo mandar el correo de aviso."
  exit "$codigo"
}

limpiar() {
  if [ -n "${PARCIAL:-}" ]; then rm -f -- "$PARCIAL"; fi
  if [ -n "${REGISTRO_CORRIDA:-}" ]; then rm -f -- "$REGISTRO_CORRIDA"; fi
}

main() {
  set -Eeuo pipefail
  umask 077

  # Sin configuracion no hay con que mandar el correo: solo queda el error en la salida (cron).
  cargar_configuracion

  REGISTRO_CORRIDA="$(mktemp)"
  trap limpiar EXIT
  trap 'fallo $? $LINENO' ERR
  touch "$RESPALDO_LOG"
  exec > >(tee -a "$RESPALDO_LOG" "$REGISTRO_CORRIDA") 2>&1
  marca "Inicio del respaldo de Gestion"

  PASO="revisar configuracion"
  requerir PGHOST PGDATABASE PGUSER PGPASSWORD RESPALDO_DRIVE_DESTINO RCLONE_CONFIG_DRIVE_TYPE RCLONE_CONFIG_DRIVE_TOKEN
  if ! [[ "$RESPALDO_DIAS" =~ ^[0-9]+$ ]] || [ "$RESPALDO_DIAS" -lt 1 ]; then
    echo "RESPALDO_DIAS debe ser un numero mayor que 0"
    false
  fi
  # Sin la zona horaria instalada (tzdata), TZ=America/Bogota daria hora UTC en el nombre sin avisar.
  if [ "$(TZ=America/Bogota date +%z)" != "-0500" ]; then
    echo "El servidor no reconoce la zona America/Bogota (falta tzdata)"
    false
  fi
  mkdir -p "$RESPALDO_DIR"
  chmod 700 "$RESPALDO_DIR"

  PASO="evitar dos respaldos a la vez"
  exec 9>"$RESPALDO_DIR/.respaldo.lock"
  flock -n 9

  PASO="espacio en disco"
  local libre_mb
  libre_mb="$(df -Pm "$RESPALDO_DIR" | awk 'NR == 2 { print $4 }')"
  marca "Espacio libre en $RESPALDO_DIR: ${libre_mb} MB"
  if [ "$libre_mb" -lt "$RESPALDO_MIN_LIBRE_MB" ]; then
    echo "Hay menos de ${RESPALDO_MIN_LIBRE_MB} MB libres"
    false
  fi

  PASO="version de Postgres"
  local imagen
  imagen="$(imagen_postgres)"
  marca "Herramientas de Postgres: $imagen"

  PASO="volcado de la base"
  local nombre archivo
  nombre="gestion-$(TZ=America/Bogota date '+%Y-%m-%d_%H%M').dump"
  archivo="$RESPALDO_DIR/$nombre"
  if [ -e "$archivo" ]; then
    echo "Ya existe $archivo"
    false
  fi
  PARCIAL="$archivo.parcial"
  pg_produccion "$imagen" pg_dump --format=custom --compress=6 --lock-wait-timeout=120s \
    --file="/respaldos/$nombre.parcial"

  PASO="revisar el archivo"
  local indice tablas
  indice="$(pg_produccion "$imagen" pg_restore --list "/respaldos/$nombre.parcial")"
  # Lee el archivo completo (todos los bloques de datos) sin cargarlo en ninguna base.
  pg_produccion "$imagen" pg_restore --file=/dev/null "/respaldos/$nombre.parcial"
  tablas="$(grep -c ' TABLE DATA ' <<<"$indice" || true)"
  if [ "${tablas:-0}" -lt 1 ]; then
    echo "El respaldo no trae datos de ninguna tabla"
    false
  fi
  mv -- "$PARCIAL" "$archivo"
  PARCIAL=""
  chmod 600 "$archivo"
  local tamano
  tamano="$(stat -c %s "$archivo")"
  marca "Respaldo listo: $archivo ($tamano bytes, $tablas tablas con datos)"

  PASO="subir a Drive"
  rclone_drive copyto "/respaldos/$nombre" "$RESPALDO_DRIVE_DESTINO/$nombre"
  local tamano_drive
  tamano_drive="$(rclone_drive lsf --files-only --format s --include "/$nombre" "$RESPALDO_DRIVE_DESTINO")"
  if [ "$tamano_drive" != "$tamano" ]; then
    echo "En Drive el archivo pesa '$tamano_drive' y en aizen1 '$tamano'"
    false
  fi
  marca "Subido a $RESPALDO_DRIVE_DESTINO/$nombre"

  # Desde aca el respaldo nuevo ya esta confirmado en los dos lugares: se pueden borrar los viejos.
  PASO="borrar respaldos viejos en aizen1"
  local viejo viejos
  viejos="$(find "$RESPALDO_DIR" -maxdepth 1 -type f -printf '%f\n' | retencion)"
  for viejo in $viejos; do
    rm -f -- "${RESPALDO_DIR:?}/$viejo"
    marca "Borrado en aizen1: $viejo"
  done

  PASO="borrar respaldos viejos en Drive"
  viejos="$(rclone_drive lsf --files-only "$RESPALDO_DRIVE_DESTINO" | retencion)"
  for viejo in $viejos; do
    rclone_drive deletefile "$RESPALDO_DRIVE_DESTINO/$viejo"
    marca "Borrado en Drive: $viejo"
  done

  PASO="fin"
  marca "Respaldo de Gestion terminado bien: $nombre"
}

# Solo corre al ejecutarlo; al cargarlo con `source` (restaurar-prueba.sh) solo define funciones.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi

#!/usr/bin/env bash
# Sube la hoja "Precios vigentes" de Gestion al cerebro (Drive) cada 30 minutos (cron en aizen1,
# fuera de la app). La hoja lleva el COSTO de cada producto: solo la lee Claude, nunca las asesoras.
#
# 1. Baja la hoja de PRECIOS_URL (GET /api/asesor/precios-vigentes, llave MCP_API_KEY).
# 2. La compara con la ultima que subio (ultima.md en PRECIOS_ESTADO_DIR), sin contar la linea
#    "Generado:" (cambia en cada corrida). Si es igual, anota "sin cambios" y no sube nada.
# 3. Si cambio, la sube con `rclone copyto` a PRECIOS_RCLONE_DESTINO y la guarda como ultima.md.
# Si cualquier paso falla, manda un correo (../respaldo/aviso-fallo.sh), uno solo hasta que vuelva a salir bien.
# Con PRECIOS_SOLO_MOSTRAR=1 solo imprime la hoja (no compara, no sube, no escribe nada).
#
# Configuracion: /etc/magilus/respaldo.env o PRECIOS_ENV (ver ../respaldo/respaldo.env.example).
# Requiere curl, flock y rclone en el PATH; el remoto de rclone va en variables RCLONE_CONFIG_*.

set -Eeuo pipefail
umask 077

DIR_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Copiado a /opt/magilus/precios-vigentes/ el aviso queda en /opt/magilus/respaldo/; en el repo, en ../respaldo/.
AVISO_FALLO="${PRECIOS_AVISO:-$DIR_SCRIPTS/../respaldo/aviso-fallo.sh}"
PRECIOS_ENV="${PRECIOS_ENV:-/etc/magilus/respaldo.env}"
# aviso-fallo.sh lee este mismo archivo si le faltan las variables SMTP.
export RESPALDO_ENV="$PRECIOS_ENV"
PASO="inicio"

marca() { echo "[$(TZ=America/Bogota date '+%Y-%m-%d %H:%M:%S')] precios-vigentes: $*"; }

fallo() {
  local codigo="$1" linea="$2"
  # Dentro de un $(...) solo se sale: el aviso lo manda una sola vez el script principal.
  if [ "$BASH_SUBSHELL" -gt 0 ]; then exit "$codigo"; fi
  trap - ERR
  marca "ERROR en el paso \"$PASO\" (linea $linea, codigo $codigo). No se subio nada."
  if [ "${PRECIOS_SOLO_MOSTRAR:-}" = "1" ]; then exit "$codigo"; fi
  # Un solo correo por racha de fallas (corre cada 30 min): la marca se borra al salir bien.
  if [ -e "$AVISADO" ]; then
    marca "Ya se aviso por correo de esta falla; no se repite hasta que vuelva a salir bien."
    exit "$codigo"
  fi
  sleep 1 # deja que el registro termine de escribirse antes de adjuntarlo
  if AVISO_ASUNTO="Falló la subida de Precios vigentes al cerebro" \
    AVISO_TEXTO="La hoja \"Precios vigentes\" de Gestión no se subió al cerebro (Drive). Los respaldos de la base no se ven afectados. Si falló \"subir a Drive\", puede que el permiso del remoto cerebro se haya vencido (ver scripts/precios-vigentes/README.md)." \
    "$AVISO_FALLO" "$PASO" "${REGISTRO_CORRIDA:-}"; then
    touch "$AVISADO" 2>/dev/null || true
  else
    marca "Tampoco se pudo mandar el correo de aviso."
  fi
  exit "$codigo"
}

limpiar() {
  if [ -n "${TMP:-}" ]; then rm -rf -- "$TMP"; fi
}

# La hoja sin la linea "Generado: ..." (la hora cambia en cada corrida aunque los precios no).
sin_generado() { grep -v '^Generado:' "$1" || true; }

if [ ! -r "$PRECIOS_ENV" ]; then
  echo "No se puede leer $PRECIOS_ENV" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$PRECIOS_ENV"
set +a
PRECIOS_URL="${PRECIOS_URL:-https://magilus.com/api/asesor/precios-vigentes}"
PRECIOS_ESTADO_DIR="${PRECIOS_ESTADO_DIR:-/opt/magilus/precios-vigentes}"
PRECIOS_LOG="${PRECIOS_LOG:-/var/log/magilus-precios-vigentes.log}"
AVISADO="$PRECIOS_ESTADO_DIR/.avisado"

TMP="$(mktemp -d)"
REGISTRO_CORRIDA="$TMP/registro.log"
trap limpiar EXIT
trap 'fallo $? $LINENO' ERR
if [ "${PRECIOS_SOLO_MOSTRAR:-}" != "1" ]; then
  mkdir -p "$PRECIOS_ESTADO_DIR"
  chmod 700 "$PRECIOS_ESTADO_DIR"
  touch "$PRECIOS_LOG"
  exec > >(tee -a "$PRECIOS_LOG" "$REGISTRO_CORRIDA") 2>&1
fi

PASO="revisar configuracion"
if [ -z "${MCP_API_KEY:-}" ]; then
  echo "Falta la variable MCP_API_KEY en $PRECIOS_ENV"
  false
fi

PASO="bajar la hoja"
HOJA="$TMP/hoja.md"
# La llave va por stdin (-K -), no en la linea de comandos: asi no aparece en `ps`.
LLAVE="${MCP_API_KEY//\\/\\\\}"
printf 'header = "Authorization: Bearer %s"\n' "${LLAVE//\"/\\\"}" |
  curl -fsS --max-time 60 -K - -o "$HOJA" -- "$PRECIOS_URL"
if [ ! -s "$HOJA" ] || [ -z "$(sin_generado "$HOJA" | tr -d '[:space:]')" ]; then
  echo "La hoja llego vacia desde $PRECIOS_URL"
  false
fi

if [ "${PRECIOS_SOLO_MOSTRAR:-}" = "1" ]; then
  cat "$HOJA"
  exit 0
fi

PASO="evitar dos subidas a la vez"
exec 9>"$PRECIOS_ESTADO_DIR/.subida.lock"
flock -n 9

PASO="comparar con la ultima subida"
ULTIMA="$PRECIOS_ESTADO_DIR/ultima.md"
if [ -r "$ULTIMA" ] && cmp -s <(sin_generado "$HOJA") <(sin_generado "$ULTIMA"); then
  rm -f -- "$AVISADO"
  marca "sin cambios"
  exit 0
fi

PASO="subir a Drive"
if [ -z "${PRECIOS_RCLONE_DESTINO:-}" ]; then
  echo "Falta la variable PRECIOS_RCLONE_DESTINO en $PRECIOS_ENV"
  false
fi
timeout "${PRECIOS_LIMITE:-10m}" rclone copyto "$HOJA" "$PRECIOS_RCLONE_DESTINO"
# Se guarda solo despues de subir: si la subida falla, la proxima corrida lo vuelve a intentar.
cp -- "$HOJA" "$ULTIMA.parcial"
mv -- "$ULTIMA.parcial" "$ULTIMA"
rm -f -- "$AVISADO"
marca "subida a $PRECIOS_RCLONE_DESTINO ($(wc -l <"$HOJA") lineas)"

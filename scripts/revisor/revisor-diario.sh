#!/usr/bin/env bash
# Revisor diario de Gestion (cron en aizen1 a las 7:00 a. m. de Colombia, fuera de la imagen).
# SOLO LEE: no cambia nada en Gestion.
#
# 1. Llama a GET /api/revisor (llave REVISOR_API_KEY, si no MCP_API_KEY) con ?saldosAyer= = los
#    `saldos` del JSON de ayer (si existe), y guarda la respuesta en REVISOR_DIR/AAAA-MM-DD.json.
# 2. decidir-avisos.mjs compara hoy con ayer: lo nuevo avisa a Sistemas (REVISOR_CORREO_SISTEMAS);
#    lo de plata que sigue desde ayer avisa a Sistemas y al dueño (REVISOR_CORREO_DUENO).
# 3. Los correos salen por ../respaldo/aviso-fallo.sh (mismo SMTP de Gestion). Gestion no manda WhatsApp.
# Si el revisor no se puede correr, avisa a Sistemas.
#
# Configuracion: /etc/magilus/revisor.env (REVISOR_ENV); el SMTP lo toma de /etc/magilus/respaldo.env
# (RESPALDO_ENV). Requiere bash, curl y node en el PATH.

set -Eeuo pipefail
umask 077

DIR_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Copiado a /opt/magilus/revisor/ el aviso queda en /opt/magilus/respaldo/; en el repo, en ../respaldo/.
AVISO="${REVISOR_AVISO:-$DIR_SCRIPTS/../respaldo/aviso-fallo.sh}"
DECIDIR="$DIR_SCRIPTS/decidir-avisos.mjs"
REVISOR_ENV="${REVISOR_ENV:-/etc/magilus/revisor.env}"
export RESPALDO_ENV="${RESPALDO_ENV:-/etc/magilus/respaldo.env}"
PASO="inicio"

marca() { echo "[$(TZ=America/Bogota date '+%Y-%m-%d %H:%M:%S')] revisor: $*"; }

correo() {
  local para="$1" asunto="$2" texto="$3" paso="${4:--}"
  AVISO_CORREO="$para" AVISO_ASUNTO="$asunto" AVISO_TEXTO="$texto" AVISO_REMITENTE="Revisor Gestion" \
    "$AVISO" "$paso"
}

fallo() {
  local codigo="$1" linea="$2"
  if [ "$BASH_SUBSHELL" -gt 0 ]; then exit "$codigo"; fi
  trap - ERR
  marca "ERROR en el paso \"$PASO\" (linea $linea, codigo $codigo)."
  correo "${REVISOR_CORREO_SISTEMAS:-}" "No corrió el revisor diario de Gestión" \
    "El revisor de las 7 a. m. no terminó. Hoy no hay revisión de datos; nada se cambió en Gestión." "$PASO" ||
    marca "Tampoco se pudo mandar el correo de aviso."
  exit "$codigo"
}

if [ ! -r "$REVISOR_ENV" ]; then
  echo "No se puede leer $REVISOR_ENV" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$REVISOR_ENV"
set +a
REVISOR_URL="${REVISOR_URL:-https://magilus.com/api/revisor}"
REVISOR_DIR="${REVISOR_DIR:-/opt/magilus/revisor}"
REVISOR_LOG="${REVISOR_LOG:-/var/log/magilus-revisor.log}"
LLAVE="${REVISOR_API_KEY:-${MCP_API_KEY:-}}"

mkdir -p "$REVISOR_DIR"
chmod 700 "$REVISOR_DIR"
touch "$REVISOR_LOG"
exec > >(tee -a "$REVISOR_LOG") 2>&1
trap 'fallo $? $LINENO' ERR

PASO="revisar configuracion"
for variable in REVISOR_CORREO_SISTEMAS REVISOR_CORREO_DUENO; do
  if [ -z "${!variable:-}" ]; then
    echo "Falta la variable $variable en $REVISOR_ENV"
    exit 1
  fi
done
if [ -z "$LLAVE" ]; then
  echo "Falta REVISOR_API_KEY (o MCP_API_KEY) en $REVISOR_ENV"
  false
fi

HOY="$(TZ=America/Bogota date +%F)"
AYER="$(TZ=America/Bogota date -d yesterday +%F)"
ARCHIVO_HOY="$REVISOR_DIR/$HOY.json"
ARCHIVO_AYER="$REVISOR_DIR/$AYER.json"

PASO="leer saldos de ayer"
SALDOS=""
if [ -r "$ARCHIVO_AYER" ]; then SALDOS="$(node "$DECIDIR" saldos "$ARCHIVO_AYER")"; fi

PASO="llamar a Gestion"
# La llave va por stdin (-K -), no en la linea de comandos: asi no aparece en `ps`.
ESCAPADA="${LLAVE//\\/\\\\}"
ARGS=(-fsS --max-time 120 -K - -G -o "$ARCHIVO_HOY.parcial")
if [ -n "$SALDOS" ]; then ARGS+=(--data-urlencode "saldosAyer=$SALDOS"); fi
printf 'header = "Authorization: Bearer %s"\n' "${ESCAPADA//\"/\\\"}" | curl "${ARGS[@]}" -- "$REVISOR_URL"
mv -- "$ARCHIVO_HOY.parcial" "$ARCHIVO_HOY"

PASO="decidir avisos"
AYER_ARG=()
if [ -r "$ARCHIVO_AYER" ]; then AYER_ARG=("$ARCHIVO_AYER"); fi
TEXTO_SISTEMAS="$(node "$DECIDIR" texto sistemas "$ARCHIVO_HOY" "${AYER_ARG[@]}")"
TEXTO_DUENO="$(node "$DECIDIR" texto dueno "$ARCHIVO_HOY" "${AYER_ARG[@]}")"

PASO="mandar avisos"
if [ -n "$TEXTO_SISTEMAS" ]; then
  correo "$REVISOR_CORREO_SISTEMAS" "Revisor de Gestión: hallazgos del $HOY" "$TEXTO_SISTEMAS"
fi
if [ -n "$TEXTO_DUENO" ]; then
  correo "$REVISOR_CORREO_DUENO" "Gestión: casos con plata sin arreglar ($HOY)" "$TEXTO_DUENO"
fi
marca "listo: $ARCHIVO_HOY (avisos: sistemas=$([ -n "$TEXTO_SISTEMAS" ] && echo si || echo no), dueno=$([ -n "$TEXTO_DUENO" ] && echo si || echo no))"

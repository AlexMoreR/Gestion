#!/usr/bin/env bash
# Aviso por correo cuando falla el respaldo de Gestion.
# Uso: aviso-fallo.sh "<paso que fallo>" [archivo con el registro de esta corrida]
# Usa el mismo SMTP de Gestion (SMTP_HOST/PORT/SECURE/USER/PASS/FROM) y manda a AVISO_CORREO
# (por defecto gestionmagilus@gmail.com). La clave SMTP nunca va en la linea de comandos:
# se le pasa a curl por stdin (-K -), asi no aparece en `ps`.
set -uo pipefail

RESPALDO_ENV="${RESPALDO_ENV:-/etc/magilus/respaldo.env}"
if [ -z "${SMTP_HOST:-}" ] && [ -r "$RESPALDO_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$RESPALDO_ENV"
  set +a
fi

PASO="${1:-desconocido}"
REGISTRO="${2:-}"
PARA="${AVISO_CORREO:-gestionmagilus@gmail.com}"

for variable in SMTP_HOST SMTP_USER SMTP_PASS SMTP_FROM; do
  if [ -z "${!variable:-}" ]; then
    echo "aviso-fallo: falta $variable, no se puede mandar el correo" >&2
    exit 1
  fi
done

# "Magilus <correo@x.com>" -> "correo@x.com" (curl necesita la direccion sola).
DE="$SMTP_FROM"
if [[ "$DE" =~ \<([^>]+)\> ]]; then DE="${BASH_REMATCH[1]}"; fi

PUERTO="${SMTP_PORT:-587}"
if [ "${SMTP_SECURE:-false}" = "true" ]; then URL="smtps://$SMTP_HOST:$PUERTO"; else URL="smtp://$SMTP_HOST:$PUERTO"; fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
chmod 700 "$TMP"

ASUNTO="Falló el respaldo de Gestión (paso: $PASO)"
{
  echo "From: Respaldo Gestion <$DE>"
  echo "To: $PARA"
  echo "Subject: =?UTF-8?B?$(printf '%s' "$ASUNTO" | base64 | tr -d '\n')?="
  echo "Date: $(LC_ALL=C date -R)"
  echo "MIME-Version: 1.0"
  echo "Content-Type: text/plain; charset=UTF-8"
  echo "Content-Transfer-Encoding: 8bit"
  echo
  echo "El respaldo nocturno de la base de datos de Gestión NO se completó."
  echo
  echo "Paso que falló: $PASO"
  echo "Servidor: $(hostname)"
  echo "Hora (Colombia): $(TZ=America/Bogota date '+%Y-%m-%d %H:%M')"
  echo
  echo "Si falló \"subir a Drive\", puede que el permiso de Google Drive se haya vencido:"
  echo "hay que volver a conectarlo (ver README, sección Respaldo)."
  echo "Mientras tanto no se borra ningún respaldo viejo."
  if [ -n "$REGISTRO" ] && [ -r "$REGISTRO" ]; then
    echo
    echo "--- Últimas líneas del registro ---"
    tail -n 40 "$REGISTRO"
  fi
} > "$TMP/mensaje.txt"

# Escapa \ y " para el archivo de configuracion de curl.
escapar() { local v="${1//\\/\\\\}"; printf '%s' "${v//\"/\\\"}"; }
CONFIG="user = \"$(escapar "$SMTP_USER"):$(escapar "$SMTP_PASS")\""

ARGS=(--silent --show-error --ssl-reqd --crlf --max-time 60 -K - --url "$URL" --mail-from "$DE" --mail-rcpt "$PARA")
if command -v curl >/dev/null 2>&1; then
  printf '%s\n' "$CONFIG" | curl "${ARGS[@]}" --upload-file "$TMP/mensaje.txt"
else
  # --user 0:0: la imagen corre como otro usuario y el mensaje solo lo puede leer root.
  printf '%s\n' "$CONFIG" | docker run --rm -i --user 0:0 -v "$TMP:/aviso:ro" curlimages/curl "${ARGS[@]}" --upload-file /aviso/mensaje.txt
fi
ESTADO=$?
if [ "$ESTADO" -eq 0 ]; then echo "aviso-fallo: correo enviado a $PARA"; else echo "aviso-fallo: no se pudo enviar el correo (codigo $ESTADO)" >&2; fi
exit "$ESTADO"

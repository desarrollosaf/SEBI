#!/bin/sh
# Genera un certificado autofirmado propio la primera vez (queda en el volumen de datos).
set -e
mkdir -p "$SEBI_CERT_DIR"
if [ ! -s "$SEBI_CERT_DIR/servidor.key" ] || [ ! -s "$SEBI_CERT_DIR/servidor.crt" ]; then
  SAN="DNS:sebi.local,DNS:localhost,IP:127.0.0.1"
  for h in $(echo "${SEBI_HOST:-}" | tr ',' ' '); do
    if echo "$h" | grep -Eq '^[0-9.]+$'; then SAN="$SAN,IP:$h"; else SAN="$SAN,DNS:$h"; fi
  done
  echo "Generando certificado autofirmado ($SAN)..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout "$SEBI_CERT_DIR/servidor.key" -out "$SEBI_CERT_DIR/servidor.crt" \
    -subj "/O=Poder Legislativo del Estado de Mexico/OU=Direccion de Informatica/CN=sebi.local" \
    -addext "subjectAltName=$SAN" 2>/dev/null
fi
exec "$@"

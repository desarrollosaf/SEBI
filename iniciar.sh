#!/bin/sh
# SEBI - Sistema de Enajenación de Bienes Informáticos
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then echo "No se encontró Node.js. Instálalo (https://nodejs.org, versión LTS) y vuelve a ejecutar."; exit 1; fi
exec node --max-old-space-size=2048 server.js

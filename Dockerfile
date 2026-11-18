# SEBI — imagen Docker (Node.js puro, sin npm install)
FROM node:22-alpine

RUN apk add --no-cache openssl tzdata
ENV TZ=America/Mexico_City \
    NODE_ENV=production \
    SEBI_DATA=/data \
    SEBI_CERT_DIR=/data/cert \
    SEBI_HTTP=8080 \
    SEBI_HTTPS=8443 \
    SEBI_BASE=/sebi

WORKDIR /app
COPY server.js package.json ./
COPY lib ./lib
COPY public ./public
COPY plantillas ./plantillas
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME /data
EXPOSE 8080 8443
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${SEBI_HTTP}${SEBI_BASE}/" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--max-old-space-size=2048", "server.js"]

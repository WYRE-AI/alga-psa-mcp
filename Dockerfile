# node:22-alpine, pinned by manifest-list digest (same pin as the fleet template). Bump deliberately.
FROM node:22-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202 AS production
RUN apk -U upgrade --no-cache && \
    addgroup -g 1001 -S alga && adduser -S alga -u 1001 -G alga
WORKDIR /app
COPY --from=builder --chown=alga:alga /app/package.json ./
COPY --from=builder --chown=alga:alga /app/dist ./dist
COPY --from=builder --chown=alga:alga /app/node_modules ./node_modules
# npm/npx are not needed at runtime and carry their own CVE surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER alga
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1
# 0.0.0.0 is safe only because startup refuses to listen without a real
# CONDUIT_S2S_SECRET, which the platform supplies at runtime and is never baked
# into the image. AUTH_MODE=gateway never falls back to env credentials; Alga
# credentials arrive per request on X-Alga-*. Every tool is a read (GET); the
# image ships no write tools, and ALGA_TOOL_TIERS accepts only "read".
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    MCP_TRANSPORT=http \
    MCP_HTTP_PORT=8080 \
    MCP_HTTP_HOST=0.0.0.0 \
    AUTH_MODE=gateway \
    ALGA_TOOL_TIERS=read
CMD ["node", "dist/http.js"]
ARG VERSION="0.1.0"
ARG COMMIT_SHA="unknown"
ARG BUILD_DATE="unknown"
LABEL io.modelcontextprotocol.server.name="io.github.WYRE-AI/alga-psa-mcp" \
      org.opencontainers.image.title="alga-psa-mcp" \
      org.opencontainers.image.description="Curated MCP tools for the Alga PSA REST API" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${COMMIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/WYRE-AI/alga-psa-mcp" \
      org.opencontainers.image.vendor="WYRE AI" \
      org.opencontainers.image.licenses="Apache-2.0"

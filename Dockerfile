FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS production
RUN apk -U upgrade --no-cache && \
    addgroup -g 1001 -S alga && adduser -S alga -u 1001 -G alga
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
RUN chown -R alga:alga /app && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER alga
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1
ENV NODE_ENV=production LOG_LEVEL=info MCP_TRANSPORT=http MCP_HTTP_PORT=8080 MCP_HTTP_HOST=0.0.0.0 AUTH_MODE=gateway
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

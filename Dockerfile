FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN npm install --global pnpm@11.23.0

FROM base AS build

COPY . .
RUN pnpm install --frozen-lockfile
RUN find . -name '*.tsbuildinfo' -delete && pnpm run typecheck
RUN pnpm --filter @workspace/control-bobinas run build
RUN pnpm --filter @workspace/api-server run build

FROM base AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/artifacts/control-bobinas/dist/public \
    DRIZZLE_MIGRATIONS_DIR=/app/lib/db/drizzle

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/control-bobinas/dist/public ./artifacts/control-bobinas/dist/public
COPY --from=build /app/lib/db/drizzle ./lib/db/drizzle

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/readyz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]

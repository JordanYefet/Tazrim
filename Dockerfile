# Tazrim: one image with the Next.js server, the Prisma migrations and the
# migrate step. The database lives on a volume at /data, never in the image.
#
#   docker compose up -d        (see docker-compose.yml and the README)

# ---- base: Debian slim + OpenSSL (Prisma picks its engine by OpenSSL version)
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

# ---- deps: node_modules from the lockfile
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: Prisma client + standalone Next.js server
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The generator's binaryTarget is "native", which here (same Debian base as the
# runtime stage) is debian-openssl-3.0.x on amd64 or linux-arm64-openssl-3.0.x on arm64.
RUN npx prisma generate
RUN TAZRIM_STANDALONE=1 npx next build
# The Prisma CLI for `migrate deploy` at start, at the exact version in the lockfile,
# installed on its own so the runtime image doesn't carry all of node_modules.
RUN mkdir -p /opt/prisma-cli \
 && cd /opt/prisma-cli \
 && echo '{"private":true}' > package.json \
 && npm install --no-audit --no-fund --omit=dev "prisma@$(node -p "require('/app/node_modules/prisma/package.json').version")" \
 && rm -rf node_modules/prisma/prisma-client node_modules/.cache
# (the bundled client runtime is only for `generate`; the CLI checks for its engines at start, so they stay)
# The runtime schema reads the database location from TAZRIM_DATABASE_URL (the
# committed schema keeps file:./tazrim.db so local dev needs no setup). Fail the
# build if the datasource line ever changes and the rewrite no longer matches.
RUN sed -i 's|^\( *url *= *\)"file:./tazrim.db"|\1env("TAZRIM_DATABASE_URL")|' prisma/schema.prisma \
 && grep -q 'env("TAZRIM_DATABASE_URL")' prisma/schema.prisma

# ---- runtime
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    TAZRIM_DATABASE_URL=file:/data/tazrim.db \
    TAZRIM_DEMO=0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
# The standalone output already traces @prisma/client (only the SQLite runtime);
# the generated client and its query engine are copied whole to be sure.
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --from=build --chown=node:node /app/scripts/seed-demo.mjs ./scripts/seed-demo.mjs
COPY --from=build /opt/prisma-cli /opt/prisma-cli
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/tazrim-entrypoint

RUN mkdir -p /data && chown node:node /data
VOLUME /data
# No USER here on purpose: the entrypoint starts as root only to chown /data,
# then drops to the unprivileged "node" user (setpriv) for migrations and the
# server. Running with --user node also works, as long as /data is writable.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["tazrim-entrypoint"]

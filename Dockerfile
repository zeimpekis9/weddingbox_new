ARG NODE_IMAGE=node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY next.config.js next-env.d.ts tsconfig.json tailwind.config.js postcss.config.js ./
COPY src ./src
ARG NEXT_PUBLIC_SUPABASE_URL=https://example.invalid
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=build-fixture
RUN --network=none npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build --chown=node:node /app/.next ./.next
COPY --chown=node:node next.config.js ./
COPY --chown=node:node src/lib/server/r2-config.ts ./src/lib/server/r2-config.ts
COPY --chown=node:node scripts/worker ./scripts/worker
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0"]

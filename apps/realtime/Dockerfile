# syntax=docker/dockerfile:1
# ECHO realtime (Colyseus world server). Build from the repo ROOT as context:
#   docker build -f apps/realtime/Dockerfile -t echo-realtime .
#   docker run -p 2567:2567 echo-realtime
# Hosts that inject $PORT (Railway/Render/Fly) work out of the box.

FROM node:20-slim AS build
WORKDIR /app
# Manifests first for cached installs.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/realtime/package.json apps/realtime/package.json
RUN npm ci
# Sources, then build shared (workspace dep) and the server.
COPY packages/shared packages/shared
COPY apps/realtime apps/realtime
RUN npm run build -w @echo/shared && npm run build -w @echo/realtime

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/realtime ./apps/realtime
# Curated NPC roster (offline fallback when Supabase isn't configured).
COPY db ./db
EXPOSE 2567
CMD ["node", "apps/realtime/dist/index.js"]

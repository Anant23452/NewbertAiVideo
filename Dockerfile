FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.backend.json ./
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
COPY packages ./packages
RUN npm run build:api && npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core fontconfig tini ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 FFMPEG_PATH=/usr/bin/ffmpeg DEVANAGARI_FONT_READY=true MEDIA_STORAGE_PROVIDER=supabase NODE_EXTRA_CA_CERTS=/app/deploy/supabase-ca.crt
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY scripts/hosting/pilot.mjs ./scripts/hosting/pilot.mjs
COPY scripts/hosting/verify-container.mjs ./scripts/hosting/verify-container.mjs
COPY deploy/fonts.conf /etc/fonts/conf.d/99-newbert.conf
COPY deploy/supabase-ca.crt ./deploy/supabase-ca.crt
RUN fc-cache -f && mkdir -p .local && chown -R node:node .local
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "scripts/hosting/pilot.mjs"]

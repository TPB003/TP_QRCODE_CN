FROM node:22-bookworm-slim AS source

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY infra ./infra
COPY tsconfig.base.json tsconfig.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM source AS api

ENV NODE_ENV=production
EXPOSE 8787
CMD ["npm", "run", "start:api"]

FROM caddy:2-alpine AS gateway
COPY --from=source /app/dist /srv
COPY infra/aliyun/Caddyfile /etc/caddy/Caddyfile

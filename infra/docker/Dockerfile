FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
FROM node:22-alpine AS api
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
CMD ["node","apps/api/dist/main.js"]
FROM api AS worker
CMD ["node","apps/worker/dist/main.js"]
FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf

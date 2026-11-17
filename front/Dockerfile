FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY front/package.json front/package.json

RUN pnpm install --frozen-lockfile --filter quick-type-frontend...

COPY front front

ARG VITE_API_URL=/quick-type
ARG VITE_SITE_URL=https://1996tsk.top/quick-type
ENV VITE_API_URL=$VITE_API_URL \
  VITE_SITE_URL=$VITE_SITE_URL

RUN pnpm --filter quick-type-frontend build

FROM nginx:1.27-alpine

COPY front/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/front/dist /usr/share/nginx/html/quick-type

EXPOSE 80

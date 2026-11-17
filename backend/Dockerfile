FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY front/package.json front/package.json

RUN pnpm install --frozen-lockfile --filter quick-type-backend...

COPY backend backend

RUN pnpm --filter quick-type-backend build \
  && pnpm --filter quick-type-backend --legacy deploy --prod /out \
  && cp -a backend/dist /out/dist

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
  HOME=/home/node \
  PORT=8787 \
  HOST=0.0.0.0

COPY --from=build /out ./

RUN mkdir -p /home/node/quick-type-types && chown -R node:node /app /home/node

USER node

EXPOSE 8787

CMD ["node", "dist/index.js"]

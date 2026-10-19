# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
RUN addgroup -S web && adduser -S web -G web
COPY --from=build --chown=web:web /app/dist ./dist
COPY --from=build --chown=web:web /app/server.mjs ./server.mjs
USER web
EXPOSE 8080
CMD ["node", "server.mjs"]

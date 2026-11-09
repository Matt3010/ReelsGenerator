# The front: the Svelte app built with Vite, served by nginx, which passes /api to the API container.

FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

# nginx as an unprivileged user (uid 101), listening on 8080: nothing in the container runs as root.
FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN apk add --no-cache openssl
COPY --chmod=755 docker/web/basic-auth.sh /docker-entrypoint.d/40-basic-auth.sh
USER 101
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/frontend/dist/ /usr/share/nginx/html/
EXPOSE 8080

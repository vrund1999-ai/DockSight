# Build the SPA, then serve the static bundle from nginx (which also reverse-proxies /api).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# The nginx image runs envsubst over /etc/nginx/templates/*.template at startup, substituting only
# variables that are set in the environment (so nginx's own $host, $uri etc. are left alone).
ENV API_UPSTREAM=http://api:8000
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

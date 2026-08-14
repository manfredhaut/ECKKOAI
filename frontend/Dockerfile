# Três estágios. "dev" é o ÚLTIMO de propósito: docker-compose.yml (dev,
# fora de escopo desta rodada) builda este arquivo sem `target`, e o Compose
# usa o último estágio como default — então o comportamento de hoje (npm run
# dev, bind mount por cima) continua intacto sem tocar naquele compose.
# docker-compose.prod.yml aponta explicitamente build.target: serve.

FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
RUN npm install
# Dockerfile e image-stamp.mjs entram na imagem por causa do carimbo de
# frescor: o hash cobre os arquivos COPIADOS e não montados, e o próprio
# Dockerfile é um deles — mudá-lo altera a imagem sem alterar nada que o bind
# mount mostre.
COPY tsconfig.json vite.config.ts index.html Dockerfile image-stamp.mjs ./
COPY src ./src
COPY public ./public

# ---------------------------------------------------------------------------
# estágio "build" — só é alcançado quando alguém pede target: build ou
# target: serve (que depende dele). Nada dele entra na imagem final.
# ---------------------------------------------------------------------------
FROM base AS build
# Cada ARG só existe DURANTE este estágio de build — nunca vira ENV, nunca
# aparece em `docker image inspect` da imagem final (Config.Env). Os DEV_* de
# credencial (DEV_ADMIN_PASSWORD, DEV_TENANT_PASSWORD, DEV_ADMIN_EMAIL,
# DEV_TENANT_EMAIL, DEV_AUTOFILL, DEV_GALLERY) de propósito NÃO entram aqui:
# com NODE_ENV=production o vite.config.ts já zera devCred() e as duas flags
# independente do valor recebido, então passá-los só criaria superfície de
# segredo sem mudar uma linha do bundle gerado.
ARG BASE_DOMAIN
ARG WHATSAPP_NUMBER
ARG REFERENCE_VIDEO_MAX_BYTES
ARG MAX_RECORDING_SECONDS
ARG IMAGE_UPLOAD_MAX_BYTES
ARG NODE_ENV=production
RUN npm run build && node image-stamp.mjs . > dist/__image-stamp

# ---------------------------------------------------------------------------
# estágio "serve" — o que sobe em PRODUÇÃO (docker-compose.prod.yml pede
# build.target: serve). Escuta na 5173 para não exigir mudança em
# traefik/dynamic.prod.yml nem no healthcheck do compose base.
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173

# ---------------------------------------------------------------------------
# estágio "dev" — idêntico em efeito ao Dockerfile original de um estágio só.
# É o único que docker-compose.yml (dev) constrói, por ser o último do
# arquivo.
# ---------------------------------------------------------------------------
FROM base AS dev
# Carimbo gravado FORA do bind mount, no momento do build. Em `/app` puro:
# gravá-lo em `src/` ou `public/` faria o host sobrescrevê-lo em runtime, e o
# carimbo passaria a comparar o repositório com ele mesmo — sempre igual,
# detectando nada. Ver frontend/image-stamp.mjs.
RUN node image-stamp.mjs . > .image-stamp

EXPOSE 5173

CMD ["npm", "run", "dev"]

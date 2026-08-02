FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

# `Dockerfile` e `image-stamp.mjs` entram na imagem por causa do carimbo de
# frescor: o hash cobre os arquivos COPIADOS e não montados, e o próprio
# Dockerfile é um deles — mudá-lo altera a imagem sem alterar nada que o bind
# mount mostre.
COPY tsconfig.json vite.config.ts index.html Dockerfile image-stamp.mjs ./
COPY src ./src
COPY public ./public

# Carimbo gravado FORA do bind mount, no momento do build. Em `/app` puro:
# gravá-lo em `src/` ou `public/` faria o host sobrescrevê-lo em runtime, e o
# carimbo passaria a comparar o repositório com ele mesmo — sempre igual,
# detectando nada. Ver frontend/image-stamp.mjs.
RUN node image-stamp.mjs . > .image-stamp

EXPOSE 5173

CMD ["npm", "run", "dev"]

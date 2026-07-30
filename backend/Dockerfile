FROM node:20-alpine

# Used by services/audioProcessing.ts to clean up and normalize synthesized
# speech before it's handed to the avatar/video provider.
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
# Ferramentas de linha de comando fora do build do tsc (rootDir/include = src),
# rodadas via tsx — hoje só o seed de acesso de dev (npm run dev:seed-access).
COPY scripts ./scripts

EXPOSE 4000

CMD ["npm", "run", "dev"]

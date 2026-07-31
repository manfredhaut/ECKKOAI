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
# Artefatos do modo fixture (PROVIDER_MODE=fixture). Versionados junto do
# código porque são parte do comportamento, não dado de ambiente — sem eles
# a simulação falha no meio do job, não no boot, que é o pior momento para
# descobrir que faltam.
COPY fixtures ./fixtures
COPY docker-entrypoint.sh ./
# chmod no build: o bit de execução não sobrevive de forma confiável a um
# checkout no Windows, e um entrypoint sem permissão faz o container morrer
# no boot com "permission denied" — falha barulhenta, mas fácil de perder.
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000

# Migrar e servir em dois passos, para que a falha de bootstrap saia pelo
# PID 1 e a política de restart consiga agir — ver docker-entrypoint.sh.
CMD ["./docker-entrypoint.sh"]

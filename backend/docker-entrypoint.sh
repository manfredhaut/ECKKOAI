#!/bin/sh
# Entrypoint do backend: migrar e servir são dois passos, de propósito.
#
# O problema que isto resolve: o container rodava `tsx watch src/index.ts`, e
# o watcher sobrevive à morte do processo que ele supervisiona. Quando o
# bootstrap falhava (Postgres fora do ar, por exemplo), o `process.exit(1)`
# de index.ts matava só o filho — o PID 1 continuava vivo, o container ficava
# `running` com o servidor sem nunca ter feito listen, `/api/health` devolvia
# 502, e a política de restart nunca disparava porque, do ponto de vista do
# Docker, nada tinha morrido. Nem quando o Postgres voltava o backend se
# recuperava: precisava de restart manual.
#
# `set -e` + `exec` são as duas metades da correção:
#   - `set -e` faz a falha do migrate encerrar este script com código != 0,
#     e como este script É o PID 1, o container morre e a política de
#     restart reinicia, tentando de novo até o banco aceitar conexão;
#   - `exec` substitui este shell pelo processo do servidor, para que ele
#     passe a SER o PID 1 — assim a morte do servidor é a morte do
#     container, e não algo que um supervisor intermediário engole.
#
# Consequência deliberada: sem `watch` aqui dentro. O hot reload já não era
# confiável através do bind mount (editar rota exigia restart manual de
# qualquer jeito — está registrado em CLAUDE.md), então ele cobrava o custo
# de esconder crashes sem entregar o benefício. Para hot reload local, fora
# do Docker, `npm run dev` continua existindo e continua usando watch.
set -e

echo "[entrypoint] aplicando migrations..."
npm run migrate

echo "[entrypoint] migrations ok; iniciando servidor"
exec npm run serve

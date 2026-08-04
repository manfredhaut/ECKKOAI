Always respond in Brazilian Portuguese.

# eckko.ai (antigo TWINAI)

SaaS multi-tenant de vídeo com avatar digital. Docker Compose: `traefik` (única porta, **8090**), `postgres`, `backend` (Fastify/TS), `frontend` (React/Vite). **HEAD `a4a3af0`** + o commit deste fechamento. Há uma **demo a apresentar**.

**1 · DESARME — confirme antes de tudo. Modo `live` gasta dinheiro real.** Exigido `fixture` + `len=0`, nos 5 critérios: `printenv` (o processo) · `docker compose config` (o arquivo — pode divergir, e um `up -d` transforma um no outro) · `StartedAt` · `RestartCount` · linha de boot `"billable":false`.

```bash
docker compose exec -T backend sh -c 'printf "%s len=%s\n" "$PROVIDER_MODE" "${#PROVIDER_LIVE_CONFIRM}"'
```

**2 · OS 3 GOTCHAS QUE CUSTARAM CONCLUSÕES ERRADAS**
1. **`docker compose logs` mente sobre o fim do log — use `--tail 500`.** Sem isso (ou com `--tail`>~1000, ou `--since`) devolve arquivo rotacionado e congelado, internamente coerente. Já fez uma requisição bem-sucedida parecer inexistente. **Nunca conclua ausência de evidência com ele.**
2. **Código novo não entra sozinho:** backend roda sem watch (`restart backend`), Vite serve bundle velho (`restart frontend`), e `vite.config.ts`/`package.json`/`Dockerfile`/entrypoint estão fora do bind mount (`build`).
3. **`restart` não recarrega `.env`** (só `up -d`); **`ps` esconde parado** (use `-a`). `running` não é saúde — `/api/health` é.

**3 · DINHEIRO — não reabrir**
- Vídeo: **3 unidades por segundo INTEIRO TRUNCADO**, 60 un/dólar ⇒ **US$ 0,05/s**. 4 medições exatas. A régua é a duração do **fornecedor**, não o nosso `ffprobe`.
- Voz: **por CARACTERE**, US$ 0,018 por roteiro de 180 — **2,5%** do custo. Encurtar roteiro para economizar é esforço mal empregado.
- **Avatar novo custa US$ 1,00**, ~6× um vídeo de 15 s — é o botão "Novo avatar" do passo 1. **Na demo, clicar só no card.**
- Débito vem **antes** da chamada e estorna **só antes do aceite**. **Nunca reinicie com geração em andamento** — o polling roda fora do orçamento e o vídeo trava em `queued` para sempre.

**4 · ABERTO, COM DONO**

| O quê | Dono |
|---|---|
| Chaves de plataforma (Anthropic, Google, embedding) pelo painel | **usuário** |
| Rotacionar chave Google de dev e senhas de demo — passaram por chat | **usuário** |
| `user_read` no ElevenLabs; saldo HeyGen (US$ 13,85 ⇒ ~19 vídeos de 15 s) | **usuário** |
| Backup de `uploads/_prova/` — `uploads/*` é ignorado pelo git | **usuário** |
| Autostart do Docker Desktop | **usuário** |
| Bloco 2B (documentação nova) · RAG bloqueado por chave de embedding | próxima sessão |

**5 · O RESTO ESTÁ EM `docs/historico/`** — nada foi apagado; cada arquivo diz de que linhas do original veio.
[00 referência](docs/historico/00-referencia-do-projeto.md) · [01 handoff e decisões](docs/historico/01-handoff-e-decisoes.md) · [02 ambiente e demo](docs/historico/02-ambiente-e-demo.md) · [03 blocos fechados](docs/historico/03-blocos-fechados.md) · [04 demos e estorno](docs/historico/04-demos-e-estorno.md) · [05 formatos e derivação](docs/historico/05-formatos-e-derivacao.md) · [06 TELA-1 e passadas live](docs/historico/06-tela1-e-passadas-live.md) · [07 voz e passo 1](docs/historico/07-voz-e-passo-1.md)

Gate: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check` · Arnês: `npm run check:mutants` · **mutante se identifica por NOME, nunca por posição.**

---

## 6 · Bloco de retomada — cole numa sessão nova

> **eckko.ai, diretório `TWINAI`. HEAD `a4a3af0` + commit de fechamento de 04/08, árvore limpa, `fixture` com `PROVIDER_LIVE_CONFIRM` vazia.** Confirme os 5 critérios do desarme antes de tocar em nada: `printenv` e `docker compose config` podem divergir, e um `up -d` arma o modo pago sem nova pergunta.
>
> **Gotchas:** (1) `docker compose logs` sem `--tail 500` devolve log rotacionado e congelado — nunca conclua ausência de evidência com ele; (2) código novo exige `restart backend`/`restart frontend`, e `vite.config.ts`/`package.json`/`Dockerfile` exigem `build`; (3) `restart` não recarrega `.env`.
>
> **Dinheiro:** vídeo US$ 0,05 por segundo inteiro truncado; voz por caractere (2,5% do total); avatar novo US$ 1,00. Nunca reinicie com geração em andamento.
>
> **Aberto (dono: usuário):** chaves de plataforma pelo painel, rotação da chave Google e das senhas de demo, `user_read` no ElevenLabs, saldo HeyGen, backup de `uploads/_prova/`, autostart do Docker.
>
> **O único NÃO VERIFICADO que bloqueia um tiro real da voz nova: se o ElevenLabs aceita o mp3 transcodificado.** O transcode está provado (webm/opus mono 48 kHz → mp3 mono 44,1 kHz 128 kbps em 983 ms, md5 registrado); o **aceite do fornecedor, não** — nenhuma clonagem real passou por esse caminho. Fechá-lo consome um slot de voz **irreversível**: este produto não exclui vozes, e liberar slot exige o painel do fornecedor.
>
> Detalhe em `docs/historico/`. Gate: `docker compose exec -T -e PROVIDER_MODE=fixture backend npm run check`.

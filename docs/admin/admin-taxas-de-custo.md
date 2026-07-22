# Painel admin — Taxas de custo

> **Este arquivo é interno.** Só é lido pelo copiloto do admin — ver a nota
> em [admin-tenants.md](admin-tenants.md).

Acessível pela aba **"Taxas de custo"** do painel admin (`/admin`).

## O que é

Uma tabela de taxas — uma linha por combinação de provedor (Avatar, Voz,
Roteiro) + vendor (HeyGen, D-ID, ElevenLabs, Anthropic, Gemini, OpenAI) +
tipo de unidade (segundos, caracteres, tokens de entrada, tokens de
saída) — usada para **estimar** o custo real de cada chamada de provedor
que um tenant faz. É essa tabela que alimenta o painel de "Uso e custo por
provedor" no detalhe de cada tenant (ver
[admin-tenants.md](admin-tenants.md)).

## Colunas

- **Provedor / Vendor / Unidade** — identificam a linha, não são
  editáveis aqui.
- **Custo por unidade (centavos)** — o valor usado no cálculo. Editável,
  com botão **Salvar** por linha (só fica habilitado quando algo muda).
- **Conferido** — checkbox. Começa **desmarcado** para toda taxa recém
  criada (valor é só uma estimativa inicial, nunca validada contra o
  preço público de verdade do vendor).

## Regra importante

Só marque **"Conferido"** depois de checar o valor contra a tabela de
preços pública real do vendor correspondente. Enquanto uma taxa não está
conferida, qualquer custo calculado a partir dela é tratado como
estimativa em todo o resto do painel (banner de aviso no detalhe do
tenant) — marcar sem checar de verdade quebra essa garantia silenciosamente.

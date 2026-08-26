-- OS QUATRO AJUSTES DE SÍNTESE DO ELEVENLABS, POR AVATAR (25/08).
--
-- ┌─ Os defaults são MEDIDOS, não escolhidos ────────────────────────────────┐
-- │ Em 25/08/2026, `GET /v1/voices/0hQuq0q2JEk1SY4lZaM9/settings` respondeu   │
-- │ HTTP 200 com o corpo:                                                     │
-- │   {"stability":0.5,"use_speaker_boost":true,"similarity_boost":0.75,      │
-- │    "style":0.0,"speed":0.9}                                               │
-- │ A voz é a do avatar "TESTE REAL 15:40 01/08" (tenant c77a5b8a…), a única  │
-- │ voz real do banco local. Os quatro valores abaixo são exatamente os que   │
-- │ o fornecedor tinha guardado — copiá-los é o que torna esta migration      │
-- │ INAUDÍVEL: hoje nenhum dos quatro é enviado, então o fornecedor já aplica │
-- │ estes mesmos números. Nenhum avatar muda de som ao aplicá-la.             │
-- │                                                                           │
-- │ Escolher outros valores aqui mudaria o timbre de TODOS os avatares de uma │
-- │ vez, num campo que ninguém consegue julgar sem gerar — por isso o default │
-- │ é a leitura, e não a opinião.                                             │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ Por que em `avatars`, e não por vídeo ──────────────────────────────────┐
-- │ Decisão do operador, 25/08: a voz é configuração do AVATAR, e vive no    │
-- │ Passo 1. O precedente é a migration 017 (`audio_treatment_enabled` /     │
-- │ `audio_treatment_target_lufs`), que segue o mesmo caminho ponta a ponta: │
-- │ coluna → `PUT /avatars/:id` com COALESCE → leitura em routes/videos.ts   │
-- │ → uso na geração.                                                        │
-- │                                                                          │
-- │ Consequência boa e deliberada: a PRÉVIA pós-clonagem (`/avatars/:id/     │
-- │ voice-sample`) passa a refletir o ajuste. É o único ponto do produto em  │
-- │ que se ouve a voz sem pagar um vídeo.                                    │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- `numeric` acompanha `audio_treatment_target_lufs`, e traz o mesmo gotcha
-- conhecido: o driver `pg` devolve `numeric` como STRING. Quem lê estas três
-- colunas precisa de `Number()`, exatamente como routes/videos.ts já faz com
-- o LUFS. O boolean não precisa.
--
-- NOT NULL com DEFAULT: toda linha existente nasce com os valores do
-- fornecedor, e nenhum caminho precisa tratar `null` — os quatro campos vão
-- SEMPRE no corpo da síntese (decisão do operador, 25/08), então um `null`
-- aqui viraria um campo ausente lá, que é o caso que o envio explícito existe
-- para eliminar.
ALTER TABLE avatars
  ADD COLUMN IF NOT EXISTS voice_stability numeric NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS voice_similarity_boost numeric NOT NULL DEFAULT 0.75,
  ADD COLUMN IF NOT EXISTS voice_style numeric NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS voice_speaker_boost boolean NOT NULL DEFAULT true;

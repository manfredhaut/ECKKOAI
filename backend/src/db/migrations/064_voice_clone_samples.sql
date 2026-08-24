-- OS ÁUDIOS DE ORIGEM DA CLONAGEM, amarrados ao tenant e à voz (R6.1, 24/08).
--
-- ┌─ Por que o vínculo precisa existir DESTE lado ───────────────────────────┐
-- │ DOCUMENTADO pelo operador, conferido na doc do fornecedor: no IVC        │
-- │ (instant voice cloning) o áudio de origem NÃO é recuperável por nenhum   │
-- │ caminho documentado — só o PVC guarda as amostras, e o PVC exige plano   │
-- │ Creator (a conta é `starter`, `can_use_professional_voice_cloning:       │
-- │ false`, MEDIDO em 24/08). Se nós não guardarmos, ninguém guarda.         │
-- │                                                                          │
-- │ E os arquivos JÁ ERAM salvos: `saveUpload` grava o original e o          │
-- │ convertido no storage do tenant desde o HIGIENE-1. O que nunca existiu   │
-- │ foi o VÍNCULO — nada dizia qual arquivo produziu qual `voice_id`. Sem    │
-- │ ele, "reclonar a partir da amostra guardada" é uma frase sem alvo: o     │
-- │ storage tem os bytes e nenhuma resposta sobre quais são os certos.       │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ O que isto destrava, e o que NÃO destrava ──────────────────────────────┐
-- │ DESTRAVA o slot rotativo: com a amostra guardada, apagar uma voz deixa   │
-- │ de ser perda definitiva — dá para reclonar depois. É o que torna a       │
-- │ exclusão uma decisão reversível o bastante para existir no produto.      │
-- │                                                                          │
-- │ NÃO destrava reprodutibilidade garantida. O operador conferiu na doc que │
-- │ o IVC não treina modelo, então reclonar dos MESMOS áudios TENDE a        │
-- │ reproduzir o resultado — "tende", não "reproduz". Nenhuma reclonagem     │
-- │ real foi comparada com o original aqui: NÃO VERIFICADO.                  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- HISTÓRICO, nunca sobrescrito: uma linha por clonagem, inclusive as várias
-- do mesmo avatar. É o oposto de `avatars.voice_id`, que guarda um valor só e
-- já apagou a ponte para a voz anterior toda vez que uma substituição
-- aconteceu — o log de `voice_id_replaced` existe justamente porque a coluna
-- não preserva. Aqui a substituição não perde nada.
CREATE TABLE IF NOT EXISTS voice_clone_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- ON DELETE SET NULL, e não CASCADE: se o avatar for apagado, a amostra
  -- CONTINUA valendo. Ela é do tenant e prova o que foi enviado ao
  -- fornecedor; apagá-la junto destruiria a única cópia de um áudio que o
  -- fornecedor não devolve.
  avatar_id uuid REFERENCES avatars(id) ON DELETE SET NULL,
  -- O `voice_id` que ESTA amostra produziu. Sem FK: ele vive na conta do
  -- fornecedor, não neste banco, e pode ser apagado lá.
  voice_id text NOT NULL,
  -- O que a pessoa gravou ou enviou, byte a byte.
  original_url text NOT NULL,
  -- O que o fornecedor REALMENTE recebeu (WAV PCM 16 bit mono 24 kHz). Os
  -- dois, e não um: o original prova o que foi gravado, o normalizado prova o
  -- que saiu daqui, e é o normalizado que uma reclonagem fiel precisa reenviar.
  normalized_url text NOT NULL,
  duration_seconds numeric,
  -- A opção com que a clonagem foi feita — R6.4. Guardada porque muda o
  -- RESULTADO: reclonar com o valor diferente do original produz outra voz, e
  -- sem este registro não haveria como reproduzir a escolha.
  remove_background_noise boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_clone_samples_tenant_idx
  ON voice_clone_samples (tenant_id, created_at DESC);
-- Por voz: é a pergunta da exclusão ("esta voz tem amostra guardada, dá para
-- reclonar depois?") e a da reclonagem ("qual áudio gerou esta voz?").
CREATE INDEX IF NOT EXISTS voice_clone_samples_voice_idx
  ON voice_clone_samples (voice_id);

COMMENT ON TABLE voice_clone_samples IS
  'Audios de origem de cada clonagem de voz (IVC), amarrados ao tenant e ao voice_id gerado. Existe porque o ElevenLabs nao devolve a amostra no IVC (so no PVC, que exige plano Creator). Historico: uma linha por clonagem, nunca sobrescrita.';

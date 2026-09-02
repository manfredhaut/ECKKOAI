-- Contador de recusas CONSECUTIVAS da guarda de folga de sincronizacao --
-- o video mudo entregue pelo Wan saiu mais curto que a fala real, e
-- sync_mode=cut_off cortaria o FIM da narracao em silencio se a corrida
-- seguisse. Usado para escalonar MARGEM_DURACAO_WAN3_SEGUNDOS no proximo
-- "Refazer video" (/redo-video) em vez de repetir cegamente o mesmo
-- deficit -- ver FolgaDeSincronizacaoInsuficienteError, falPipeline.ts.
-- Reseta para 0 quando a etapa passa (o video chega a 'ready').
ALTER TABLE videos
  ADD COLUMN sync_folga_recusas integer NOT NULL DEFAULT 0;

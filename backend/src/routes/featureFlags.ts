/**
 * Estado das flags e do modo de provedor, para a UI do tenant.
 *
 * Somente leitura: quem alterna é o admin (routes/adminPanel.ts). O motivo
 * de cada flag vem junto do estado porque a UI precisa dos dois ao mesmo
 * tempo — o contrato é "indisponível COM explicação", nunca um dos dois
 * sozinho.
 *
 * `providerMode` viaja no mesmo payload porque a tela precisa saber se deve
 * marcar o resultado como simulado, e pedir isso num segundo endpoint só
 * criaria um instante em que a tela mostra vídeo simulado sem a marca.
 */
import type { FastifyInstance } from "fastify";
import { getFeatureFlags } from "../services/featureFlagStore.js";
import { config } from "../config.js";

export async function featureFlagRoutes(app: FastifyInstance): Promise<void> {
  app.get("/feature-flags", async () => ({
    flags: await getFeatureFlags(),
    providerMode: config.providerMode,
  }));
}

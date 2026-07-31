import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";

export interface FeatureFlagState {
  key: string;
  label: string;
  enabled: boolean;
  /** Sempre presente. É o texto que o cliente lê quando o recurso não está disponível. */
  reason: string;
}

export type ProviderMode = "fixture" | "live";

interface FeatureFlagContextValue {
  flags: FeatureFlagState[];
  providerMode: ProviderMode;
  loading: boolean;
  refresh: () => Promise<void>;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

/**
 * Estado das flags e do modo de provedor, carregado uma vez por sessão.
 *
 * `providerMode` vem no mesmo payload das flags de propósito: a tela
 * precisa saber se deve marcar o resultado como simulado no mesmo instante
 * em que decide o que renderizar. Pedir isso num segundo endpoint criaria
 * uma janela — curta, mas real — em que um vídeo de fixture aparece sem a
 * marca, que é justamente o que a marca existe para impedir.
 *
 * O padrão enquanto carrega é `live`: se algo falhar, é melhor NÃO exibir
 * uma marca de simulação sobre um vídeo real do que o contrário. Errar
 * dizendo "isto é simulado" sobre algo que o cliente pagou seria pior.
 */
export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlagState[]>([]);
  const [providerMode, setProviderMode] = useState<ProviderMode>("live");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ flags: FeatureFlagState[]; providerMode: ProviderMode }>(
        "/feature-flags",
      );
      setFlags(res.flags);
      setProviderMode(res.providerMode);
    } catch {
      // Silencioso: sem flags, todo recurso atrás de flag aparece
      // indisponível com o motivo padrão — o caminho de falha continua
      // sendo "explica", nunca "some".
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  return (
    <FeatureFlagContext.Provider value={{ flags, providerMode, loading, refresh }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagContextValue {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error("useFeatureFlags must be used within FeatureFlagProvider");
  return ctx;
}

/**
 * Estado de um recurso: ligado, ou desligado COM motivo.
 *
 * Devolve sempre um motivo quando `enabled` é falso — inclusive se a flag
 * não veio da API. Um recurso indisponível sem explicação é o modo de
 * falha que este contrato existe para tornar impossível.
 */
export function useFeature(key: string): { enabled: boolean; reason: string } {
  const { flags } = useFeatureFlags();
  const flag = flags.find((f) => f.key === key);
  if (!flag) {
    return { enabled: false, reason: "Recurso ainda não disponível." };
  }
  return { enabled: flag.enabled, reason: flag.reason };
}

export function useIsSimulated(): boolean {
  return useFeatureFlags().providerMode === "fixture";
}

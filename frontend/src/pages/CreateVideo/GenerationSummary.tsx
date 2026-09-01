import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Avatar, AvatarLooksResponse } from "../../types";
import { PUBLISH_PLATFORMS } from "./publishPlatforms";
import type { WizardState } from "./types";
import { corpoDaGeracao } from "./steps/GenerateStep";

/**
 * O QUE VAI SER ENVIADO, na última tela antes de o dinheiro sair.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA
 *
 * Dois vídeos pagos saíram com campos vazios sem que o operador tivesse como
 * perceber antes de clicar. Nenhum dos dois deu erro: o corpo era válido, o
 * fornecedor respondeu 200, e a ausência só apareceu no vídeo pronto — depois
 * de cobrado. Um deles saiu sem traje porque o traje nunca chegou a ser
 * escolhido, e a única testemunha disso era `avatar_look_id: NULL` no banco.
 *
 * O passo Cena mostra cada controle na hora de preenchê-lo, mas ninguém volta
 * três telas para conferir o que ficou. O momento em que conferir importa é o
 * único em que a tela não mostrava nada.
 *
 * ---------------------------------------------------------------------------
 * DUAS DECISÕES DE DESENHO, e as duas são o que faz isto valer alguma coisa
 *
 * 1. **O resumo é DERIVADO de `corpoDaGeracao(wizard)`**, o mesmo objeto que
 *    vai no `POST /videos` — não do estado do formulário. Ler o formulário
 *    mostraria o que a pessoa escolheu; ler o corpo mostra o que o servidor vai
 *    receber. Quando os dois divergem — que é exatamente o defeito de origem,
 *    campo coletado que não chega — só a segunda leitura acusa.
 *
 * 2. **Campo ausente é escrito, não omitido.** A linha aparece com a palavra
 *    "nenhum" em vez de sumir. Uma lista que encolhe não chama atenção; uma
 *    linha que diz "Traje: nenhum" chama. Foi a ausência silenciosa que custou
 *    os dois vídeos.
 *
 * Os nomes de avatar e traje são resolvidos por leitura (GET, não tarifado) e
 * caem para o id quando a leitura falha: um id é feio e é verdade, e é melhor
 * que uma linha em branco no lugar onde se confere o que vai ser cobrado.
 */

/**
 * Os SETE campos, nesta ordem — a do passo Cena, de cima para baixo.
 *
 * Eram seis até 28/08: Cenário tinha rastreio próprio (`defaults.scenarioName`,
 * um nome de arquivo — ver o histórico abaixo), ele foi removido quando
 * Cenário virou campo por vídeo (27/08) na Cena, e NINGUÉM o substituiu — a
 * linha "Cenário" simplesmente sumiu do resumo, o mesmo defeito de origem que
 * este componente existe para impedir (campo coletado que não chega à tela de
 * conferência, ver o cabeçalho do arquivo). Achado numa varredura completa
 * (28/08) e fechado aqui, no MESMO padrão de leitura que a linha de Traje
 * logo abaixo já usa: o texto do prompt vence a URL do arquivo, quando os
 * dois existem.
 *
 * ⚠️ Este comentário evita citar os dois nomes de campo lado a lado com
 * `corpo.` na frente: uma guarda deste próprio arquivo
 * (`checkPreflightSummaryPolicy.ts`) procura a string exata em TODO o
 * arquivo, não só no código — citá-la aqui faria um mutante que apaga a
 * leitura real do campo passar batido, com a prova morando só no comentário.
 *
 * `campo`, e não `key`: a guarda de feature flags conta como referência a flag
 * qualquer `key: "..."` no código do frontend (foi assim que ela passou a
 * enxergar `dev/galleryFetch.ts`, que ela não via). Sete linhas com `key:` aqui
 * fariam o gate acusar sete flags inexistentes. Renomear o nosso campo é mais
 * barato que afrouxar o padrão dela.
 */
export interface SummaryRow {
  campo: string;
  value: string | null;
}

/**
 * O resumo como DADO, separado do JSX de propósito: assim a guarda consegue
 * conferir os sete campos sem subir um componente React inteiro — que é o mesmo
 * motivo pelo qual `lookSelection.ts` saiu de dentro do handler.
 */
export function resumoDaGeracao(
  wizard: WizardState,
  nomes: { avatar?: string | null; look?: string | null },
): SummaryRow[] {
  // O locale entra só para satisfazer a assinatura: nenhuma linha deste resumo
  // depende dele. E é isso que se quer — o que o passo 4 mostra é o texto do
  // usuário, o mesmo em qualquer idioma de interface. A versão que vai ao
  // fornecedor não passa por aqui e nunca chega ao navegador.
  const corpo = corpoDaGeracao(wizard, "pt-BR");
  const plataforma = PUBLISH_PLATFORMS.find((p) => p.id === corpo.publish_platform);
  return [
    { campo: "avatar", value: corpo.avatar_id ? (nomes.avatar ?? corpo.avatar_id) : null },
    // CENÁRIO — 28/08. `scenario_prompt` (texto legível) tem prioridade sobre
    // `scenario` (URL do arquivo), mesmo padrão de `outfit`/`background`
    // logo abaixo. Campo por vídeo desde 27/08 (Cena) — não vem mais de
    // nenhum padrão do Passo 1.
    { campo: "scenario", value: corpo.scenario_prompt || corpo.scenario || null },
    // TRAJE — Fase A, item 3 (25/08): o dropdown "Traje" (avatar_look_id) saiu
    // da tela em 25/08 — ler esse campo aqui mostrava "Traje: nenhum" mesmo
    // quando o traje estava sendo enviado de verdade. Campo por vídeo desde
    // 28/08 (Cena) — mesmo padrão do Cenário acima. `outfit_prompt` (texto
    // legível) tem prioridade sobre `outfit` (URL do arquivo).
    { campo: "outfit", value: corpo.outfit_prompt || corpo.outfit || null },
    {
      campo: "background",
      value: corpo.background
        ? corpo.background.type === "color"
          ? `${corpo.background.value}`
          : corpo.background.value
        : null,
    },
    { campo: "motionPrompt", value: corpo.motion_prompt },
    { campo: "expressiveness", value: corpo.expressiveness },
    { campo: "format", value: plataforma ? plataforma.aspectRatio : null },
  ];
}

export function GenerationSummary({ wizard }: { wizard: WizardState }) {
  const { t } = useTranslation();
  const [avatarName, setAvatarName] = useState<string | null>(null);
  const [lookName, setLookName] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    if (!wizard.avatarId) {
      setAvatarName(null);
      setLookName(null);
      return;
    }
    api
      .get<Avatar[]>("/avatars")
      .then((lista) => {
        if (!cancelado) setAvatarName(lista.find((a) => a.id === wizard.avatarId)?.name ?? null);
      })
      // Falhar em ler o nome não pode esconder o resumo: sem isto a linha cai
      // para o id, que continua identificando o que vai ser enviado.
      .catch(() => {});
    if (wizard.avatarLookId) {
      api
        .get<AvatarLooksResponse>(`/avatars/${wizard.avatarId}/looks`)
        .then((info) => {
          if (!cancelado) {
            setLookName(info.looks.find((l) => l.id === wizard.avatarLookId)?.name ?? null);
          }
        })
        .catch(() => {});
    } else {
      setLookName(null);
    }
    return () => {
      cancelado = true;
    };
  }, [wizard.avatarId, wizard.avatarLookId]);

  const linhas = resumoDaGeracao(wizard, { avatar: avatarName, look: lookName });

  return (
    <div className="generation-summary" style={{ marginTop: 16, marginBottom: 16 }}>
      <div className="card-title" style={{ fontSize: 14 }}>
        {t("createVideo.generate.summaryTitle")}
      </div>
      <dl style={{ margin: 0, fontSize: 13 }}>
        {linhas.map((l) => (
          <div key={l.campo} style={{ display: "flex", gap: 8, padding: "3px 0" }}>
            <dt className="text-muted" style={{ minWidth: 140 }}>
              {t(`createVideo.generate.summary.${l.campo}`)}
            </dt>
            <dd
              style={{ margin: 0, fontStyle: l.value === null ? "italic" : undefined }}
              className={l.value === null ? "text-muted" : undefined}
            >
              {l.value ?? t("createVideo.generate.summaryNone")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

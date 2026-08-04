import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";

/**
 * Avisa que o avatar escolhido tem pendências — e NÃO impede de avançar.
 *
 * A distinção é o desenho inteiro deste componente. Quem está no passo 1
 * costuma estar explorando: escolher um avatar pela metade para ver as
 * próximas telas é uso legítimo, e travar isso transformaria o passo 1 num
 * portão. O que não é legítimo é descobrir a pendência no passo 6, depois de
 * escrever roteiro, escolher cenário e clicar em gerar — que é exatamente o
 * percurso que os avatares `teste 12` e `teste` produzem hoje na base de
 * desenvolvimento: cinco passos até a recusa.
 *
 * OS MOTIVOS VÊM DO SERVIDOR, e nenhum é recalculado aqui. A tela chama
 * `POST /videos/readiness` e exibe `blockers[].message` como veio. Uma segunda
 * checagem no cliente é precisamente a família de defeito que o predicado
 * único fechou no bloco 5D: o botão conhecia três condições e a rota recusava
 * por sete, e as duas listas divergiram sem que nada acusasse.
 *
 * POR QUE FILTRAR por `avatar_*`: no passo 1 o roteiro ainda não foi escrito,
 * então `empty_script` viria SEMPRE. Mostrá-lo aqui seria ruído que ensina a
 * ignorar o aviso — e é o roteiro do passo 2, não uma pendência do avatar.
 * Filtrar por prefixo de código é seleção de exibição, não regra nova: os
 * códigos continuam sendo os do backend, e um blocker novo de avatar aparece
 * aqui sozinho, sem ninguém tocar neste arquivo.
 */

interface Blocker {
  code: string;
  message: string;
  status: number;
}

export function AvatarReadinessNotice({ avatarId }: { avatarId: string }) {
  const { t } = useTranslation();
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    // Script vazio de propósito: aqui a pergunta é sobre o AVATAR, e o
    // roteiro é do passo 2. O `empty_script` que isso produz é descartado no
    // filtro abaixo.
    api
      .post<{ ready: boolean; blockers: Blocker[] }>("/videos/readiness", {
        avatar_id: avatarId,
        script: "",
      })
      .then((r) => {
        if (!cancelado) setBlockers(r.blockers ?? []);
      })
      .catch(() => {
        // Falha de rede não vira aviso: um alerta que aparece porque a
        // consulta caiu diria que o avatar tem problema quando não se sabe.
        if (!cancelado) setBlockers(null);
      });
    return () => {
      cancelado = true;
    };
  }, [avatarId]);

  const doAvatar = (blockers ?? []).filter((b) => b.code.startsWith("avatar_"));
  if (doAvatar.length === 0) return null;

  return (
    <div className="avatar-readiness" role="status">
      <strong>{t("createVideo.avatarSetup.readinessTitle")}</strong>
      <ul>
        {doAvatar.map((b) => (
          <li key={b.code}>{b.message}</li>
        ))}
      </ul>
      <p className="avatar-readiness__note">{t("createVideo.avatarSetup.readinessCanProceed")}</p>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/ui/PageHeader";
import { KnowledgeMediaTab } from "../Content/KnowledgeMediaTab";

export function RagPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageHeader title={t("rag.title")} subtitle={t("rag.subtitle")} />
      <KnowledgeMediaTab />
    </>
  );
}

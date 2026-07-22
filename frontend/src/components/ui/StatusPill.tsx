import { useTranslation } from "react-i18next";

export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  return <span className={`status-pill status-${status}`}>{t(`common.status.${status}`)}</span>;
}

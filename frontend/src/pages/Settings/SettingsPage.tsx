import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Credential } from "../../types";
import { PageHeader } from "../../components/ui/PageHeader";
import { CredentialCard } from "./CredentialCard";
import { StorageProviderCard } from "./StorageProviderCard";

export function SettingsPage() {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<Credential[]>([]);

  useEffect(() => {
    api.get<Credential[]>("/credentials").then(setCredentials);
  }, []);

  const find = (provider: Credential["provider"]) =>
    credentials.find((c) => c.provider === provider);

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="grid grid-cols-3">
        <CredentialCard
          provider="avatar"
          title={t("settings.avatarProviderTitle")}
          description={t("settings.avatarProviderDesc")}
          credential={find("avatar")}
        />
        <CredentialCard
          provider="voice"
          title={t("settings.voiceProviderTitle")}
          description={t("settings.voiceProviderDesc")}
          credential={find("voice")}
        />
        <CredentialCard
          provider="script"
          title={t("settings.scriptProviderTitle")}
          description={t("settings.scriptProviderDesc")}
          credential={find("script")}
        />
      </div>

      <div className="section-heading">
        <h2>{t("settings.storageTitle")}</h2>
      </div>
      <div className="grid grid-cols-3">
        <StorageProviderCard />
      </div>
    </>
  );
}

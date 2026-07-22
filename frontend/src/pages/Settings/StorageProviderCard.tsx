import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { StorageProviderId } from "../../types";

const OPTIONS: StorageProviderId[] = ["drive", "platform_hosted"];

export function StorageProviderCard() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<StorageProviderId | null>(null);

  useEffect(() => {
    api.get<{ provider: StorageProviderId }>("/storage-provider").then((r) => setProvider(r.provider));
  }, []);

  return (
    <div className="card">
      <div className="card-title">{t("settings.storageProviderTitle")}</div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        {t("settings.storageProviderDesc")}
      </p>

      <div className="chip-group">
        {OPTIONS.map((option) => (
          <button
            key={option}
            className={`chip${provider === option ? " selected" : ""}`}
            disabled
          >
            {t(`settings.storageProviderOptions.${option}`)}
          </button>
        ))}
      </div>

      <p className="text-muted" style={{ fontSize: 13, marginTop: 12 }}>
        {t("settings.managedByPlatform")}
      </p>
    </div>
  );
}

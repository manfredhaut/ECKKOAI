import { useTranslation } from "react-i18next";
import type { Credential, CredentialProviderId } from "../../types";
import { StatusPill } from "../../components/ui/StatusPill";
import { Field } from "../../components/ui/Field";
import { VENDORS_BY_PROVIDER } from "./providerVendors";

export function CredentialCard({
  provider,
  title,
  description,
  credential,
}: {
  provider: CredentialProviderId;
  title: string;
  description: string;
  credential: Credential | undefined;
}) {
  const { t } = useTranslation();
  const vendors = VENDORS_BY_PROVIDER[provider];
  const activeVendor = vendors.find((v) => v.id === credential?.vendor) ?? vendors[0];

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <div className="card-title">{title}</div>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {description}
          </p>
        </div>
        <StatusPill status={credential?.connected ? "connected" : "disconnected"} />
      </div>

      <Field label={t("settings.vendorLabel")} helpPrompt={t("settings.vendorHelpPrompt")}>
        <select value={activeVendor.id} disabled>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {t(v.labelKey)}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t(activeVendor.keyLabelKey)}>
        <input
          type="password"
          value={credential?.masked_key ? `••••${credential.masked_key}` : ""}
          placeholder={t("settings.apiKeyPlaceholder")}
          disabled
        />
      </Field>

      <p className="text-muted" style={{ fontSize: 13 }}>
        {t("settings.managedByPlatform")}
      </p>
    </div>
  );
}

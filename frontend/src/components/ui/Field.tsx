import type { ReactNode } from "react";
import { FieldHelpIcon } from "./FieldHelpIcon";

export function Field({
  label,
  help,
  helpPrompt,
  children,
}: {
  label?: string;
  help?: string;
  helpPrompt?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {label && (
        <label>
          {label}
          {helpPrompt && <FieldHelpIcon prompt={helpPrompt} />}
        </label>
      )}
      {children}
      {help && <p className="field-help">{help}</p>}
    </div>
  );
}

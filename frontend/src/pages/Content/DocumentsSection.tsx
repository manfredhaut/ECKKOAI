import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { KnowledgeDocument } from "../../types";
import { StatusPill } from "../../components/ui/StatusPill";

export function DocumentsSection() {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  function refresh() {
    api.get<KnowledgeDocument[]>("/documents").then(setDocuments);
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, []);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.upload<KnowledgeDocument>("/documents", file, file.name);
      refresh();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleDelete(id: string, filename: string) {
    if (!window.confirm(t("knowledge.confirmDelete", { name: filename }))) return;
    await api.delete(`/documents/${id}`);
    refresh();
  }

  return (
    <div className="card">
      <div className="section-heading">
        <h2>{t("knowledge.documents.title")}</h2>
      </div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        {t("knowledge.documents.description")}
      </p>

      <label className="upload-zone">
        {uploading ? t("knowledge.documents.uploading") : t("knowledge.documents.upload")}
        <input
          ref={fileInput}
          type="file"
          accept=".docx,.xlsx,.pdf"
          hidden
          onChange={handleFileChange}
        />
      </label>

      {documents.length === 0 ? (
        <div className="empty-state">{t("knowledge.documents.empty")}</div>
      ) : (
        <table style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>{t("knowledge.documents.colName")}</th>
              <th>{t("knowledge.documents.colStatus")}</th>
              <th>{t("knowledge.documents.colCreated")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.filename}</td>
                <td>
                  <StatusPill status={doc.status} />
                  {doc.status === "error" && doc.error_message && (
                    <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                      {doc.error_message}
                    </div>
                  )}
                </td>
                <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-outline" onClick={() => handleDelete(doc.id, doc.filename)}>
                    {t("knowledge.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

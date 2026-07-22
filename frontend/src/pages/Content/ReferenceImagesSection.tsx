import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { ReferenceImage } from "../../types";

export function ReferenceImagesSection() {
  const { t } = useTranslation();
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  function refresh() {
    api.get<ReferenceImage[]>("/reference-images").then(setImages);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.upload<ReferenceImage>("/reference-images", file, file.name);
      refresh();
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleDelete(id: string, filename: string) {
    if (!window.confirm(t("knowledge.confirmDelete", { name: filename }))) return;
    await api.delete(`/reference-images/${id}`);
    refresh();
  }

  return (
    <div className="card">
      <div className="section-heading">
        <h2>{t("knowledge.referenceImages.title")}</h2>
      </div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        {t("knowledge.referenceImages.description")}
      </p>

      <label className="upload-zone">
        {uploading ? t("knowledge.referenceImages.uploading") : t("knowledge.referenceImages.upload")}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={handleFileChange} />
      </label>

      {images.length === 0 ? (
        <div className="empty-state">{t("knowledge.referenceImages.empty")}</div>
      ) : (
        <div className="thumbnail-grid">
          {images.map((image) => (
            <div key={image.id} className="thumbnail">
              <img src={image.file_url} alt={image.filename} />
              <button
                className="thumbnail-delete"
                title={t("knowledge.delete")}
                onClick={() => handleDelete(image.id, image.filename)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

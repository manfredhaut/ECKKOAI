import { DocumentsSection } from "./DocumentsSection";
import { ReferenceImagesSection } from "./ReferenceImagesSection";

export function KnowledgeMediaTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <DocumentsSection />
      <ReferenceImagesSection />
    </div>
  );
}

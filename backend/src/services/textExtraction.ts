import mammoth from "mammoth";
import * as XLSX from "xlsx";
import pdfParse from "pdf-parse";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PDF_MIME = "application/pdf";

function extractDocx(buffer: Buffer): Promise<string> {
  return mammoth.extractRawText({ buffer }).then((result) => result.value);
}

function extractXlsx(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  return workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join(
    "\n\n",
  );
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

export async function extractText(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  const extension = filename.split(".").pop()?.toLowerCase();

  if (mimeType === DOCX_MIME || extension === "docx") return extractDocx(buffer);
  if (mimeType === XLSX_MIME || extension === "xlsx") return extractXlsx(buffer);
  if (mimeType === PDF_MIME || extension === "pdf") return extractPdf(buffer);

  throw new Error(`Unsupported document type: ${mimeType || extension}`);
}

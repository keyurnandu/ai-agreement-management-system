import mammoth from "mammoth";
import { pdfEngine } from "@/lib/services/client";

const DOCX_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export function isDocx(bytes: Buffer): boolean {
  return bytes.length >= 4 && DOCX_MAGIC.every((b, i) => bytes[i] === b);
}

export function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Convert Word (.docx) to PDF via HTML → pdf-engine. */
export async function docxToPdf(bytes: Buffer, title: string): Promise<Buffer> {
  const { value: html } = await mammoth.convertToHtml({ buffer: bytes });
  const wrapped = `<h1>${title.replace(/</g, "&lt;")}</h1>${html}`;
  const { pdf } = await pdfEngine.fromHtml(wrapped, title);
  return pdf;
}

/** Normalize uploaded template file to PDF bytes. */
export async function templateFileToPdf(bytes: Buffer, filename: string, title: string): Promise<Buffer> {
  if (isPdf(bytes)) return bytes;
  if (isDocx(bytes) || filename.toLowerCase().endsWith(".docx")) {
    return docxToPdf(bytes, title);
  }
  throw new Error("Unsupported format — upload PDF or Word (.docx)");
}

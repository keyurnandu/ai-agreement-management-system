import { prisma } from "@/lib/db";
import { pdfEngine, intelligence } from "@/lib/services/client";
import { latestVersion, loadVersionBytes } from "@/lib/documents";
import { encodeAttributeSource, findAttributeSource, findAttributeSourceInForm } from "@/lib/attribute-source";
import { attributeAppliesToDocument } from "@/lib/attribute-document-filter";

export type ExtractionResult = {
  extracted: number;
  provider?: string;
  keys?: string[];
  chunked?: boolean;
  error?: string;
};

/**
 * Run AI attribute extraction on a document's latest version and persist the
 * values (with PDF source locations). Shared by the extract route and the agent.
 */
export async function runExtraction(documentId: string, keys?: string[]): Promise<ExtractionResult> {
  const version = await latestVersion(documentId);
  if (!version) return { extracted: 0, error: "not found" };

  const docMeta = await prisma.document.findUnique({
    where: { id: documentId },
    select: { commercialType: { select: { key: true, prefix: true } } },
  });

  const bytes = await loadVersionBytes(version.storageKey);
  const filename = version.originalFilename ?? undefined;
  const extracted = await pdfEngine.extractText(bytes, filename);
  const pages = extracted.pages;
  const text = pages.map((p) => p.text).join("\n");

  let formFields: { page: number; name: string | null; value: string | null; rect: number[] }[] = [];
  let pageSizes: { page: number; width: number; height: number }[] = [];
  try {
    const [formRes, info] = await Promise.all([pdfEngine.formFields(bytes, filename), pdfEngine.info(bytes, filename)]);
    formFields = formRes.fields;
    pageSizes = info.page_sizes;
  } catch {
    /* optional */
  }

  async function enrichSource(value: string | null | undefined, loc: ReturnType<typeof findAttributeSource>) {
    if (!value?.trim()) return loc;
    let out = loc;
    const needle = value.trim();
    if (loc && !loc.rect) {
      try {
        const { hits } = await pdfEngine.searchText(bytes, filename, needle.slice(0, 120), loc.page);
        if (hits[0]) out = { ...loc, rect: hits[0] };
      } catch {
        /* optional */
      }
    }
    if (!out) out = findAttributeSourceInForm(value, formFields, pageSizes);
    if (out && !out.rect) {
      try {
        const { hits } = await pdfEngine.searchText(bytes, filename, needle.slice(0, 120), out.page);
        if (hits[0]) out = { ...out, rect: hits[0] };
      } catch {
        /* optional */
      }
    }
    return out;
  }

  let defs = await prisma.attributeDefinition.findMany({ where: { active: true, scope: { in: ["DOCUMENT", "BOTH"] } } });
  const docKey = docMeta?.commercialType?.key ?? null;
  const docPrefix = docMeta?.commercialType?.prefix ?? null;
  defs = defs.filter((d) => attributeAppliesToDocument(d.documentType, docKey, docPrefix));
  if (keys?.length) {
    const allowed = new Set(keys);
    defs = defs.filter((d) => allowed.has(d.key));
    if (defs.length === 0) return { extracted: 0, error: "unknown attribute key(s)" };
  }
  if (defs.length === 0) return { extracted: 0 };

  const { provider, values } = await intelligence.extract(
    text,
    defs.map((d) => ({
      key: d.key,
      label: d.label,
      type: d.type,
      prompt: d.prompt,
      mode: d.mode,
      inclusion: (d.inclusionExamples as string[] | null) ?? [],
      exclusion: (d.exclusionExamples as string[] | null) ?? [],
    })),
  );
  const byKey = new Map(values.map((v) => [v.key, v]));

  for (const d of defs) {
    const v = byKey.get(d.key);
    const loc = await enrichSource(v?.value ?? null, findAttributeSource(v?.value ?? null, pages));
    const replaceAll = Boolean(keys?.length);
    await prisma.attributeValue.deleteMany({
      where: { definitionId: d.id, documentId, ...(replaceAll ? {} : { method: "AI" }) },
    });
    await prisma.attributeValue.create({
      data: {
        definitionId: d.id,
        documentId,
        value: v?.value ?? null,
        confidence: v?.confidence ?? null,
        method: "AI",
        source: encodeAttributeSource(provider, loc),
      },
    });
  }

  return { extracted: defs.length, provider, keys: defs.map((d) => d.key), chunked: text.length > 8000 };
}

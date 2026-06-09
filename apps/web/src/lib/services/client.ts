import { SignJWT } from "jose";
import { env } from "@/env";

/**
 * Service-to-service auth: the web app mints a short-lived HS256 token for each
 * outbound call. The Python services verify it (shared secret now; swap to
 * asymmetric keys / JWKS later in the same verification seam).
 */
async function serviceToken(subject: string, scope: string): Promise<string> {
  const secret = new TextEncoder().encode(env.SERVICE_JWT_SECRET);
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuer("contract-platform-web")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(secret);
}

interface CallOpts {
  method?: string;
  body?: unknown;
  actor?: string;
  scope?: string;
}

async function call<T>(baseUrl: string, path: string, opts: CallOpts = {}): Promise<T> {
  const token = await serviceToken(opts.actor ?? "system", opts.scope ?? "default");
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`service call ${baseUrl}${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** POST multipart/form-data (file uploads to the PDF engine). */
async function postForm(baseUrl: string, path: string, form: FormData, scope: string): Promise<Response> {
  const token = await serviceToken("system", scope);
  // NOTE: do not set content-type — fetch adds the multipart boundary itself.
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`pdf-engine ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

function pdfForm(bytes: Buffer | Uint8Array, filename = "document.pdf"): FormData {
  const form = new FormData();
  // Copy into a plain ArrayBuffer to satisfy DOM BlobPart typing (Node Buffer's
  // backing store is ArrayBufferLike, which the lib types reject directly).
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  form.append("file", new Blob([ab], { type: "application/pdf" }), filename);
  return form;
}

export interface HealthResponse {
  status: string;
  service: string;
  [k: string]: unknown;
}

export interface PdfInfo {
  filename: string | null;
  pages: number;
  metadata: Record<string, unknown>;
  page_sizes: { page: number; width: number; height: number }[];
  is_encrypted: boolean;
}

export interface ExtractedText {
  pages: { page: number; text: string }[];
  char_count: number;
}

export interface PageOp {
  op: "rotate" | "delete" | "reorder";
  pages?: number[];
  degrees?: number;
  order?: number[];
}

export interface FormField {
  page: number;
  name: string | null;
  type: string;
  value: string | null;
  rect: number[];
}

export interface StampItem {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  label?: string;
}

export const pdfEngine = {
  health: () => call<HealthResponse>(env.PDF_ENGINE_URL, "/health", { method: "GET", scope: "health" }),

  async info(bytes: Buffer | Uint8Array, filename?: string): Promise<PdfInfo> {
    const res = await postForm(env.PDF_ENGINE_URL, "/pdf/info", pdfForm(bytes, filename), "pdf.info");
    return (await res.json()) as PdfInfo;
  },

  async extractText(bytes: Buffer | Uint8Array, filename?: string): Promise<ExtractedText> {
    const res = await postForm(env.PDF_ENGINE_URL, "/pdf/extract-text", pdfForm(bytes, filename), "pdf.extract");
    return (await res.json()) as ExtractedText;
  },

  async render(
    bytes: Buffer | Uint8Array,
    filename: string | undefined,
    page: number,
    dpi = 144,
  ): Promise<{ png: Buffer; pageCount: number }> {
    const res = await postForm(
      env.PDF_ENGINE_URL,
      `/pdf/render?page=${page}&dpi=${dpi}`,
      pdfForm(bytes, filename),
      "pdf.render",
    );
    return {
      png: Buffer.from(await res.arrayBuffer()),
      pageCount: Number(res.headers.get("X-Page-Count") ?? 0),
    };
  },

  async pageOps(
    bytes: Buffer | Uint8Array,
    filename: string | undefined,
    ops: PageOp | PageOp[],
  ): Promise<{ pdf: Buffer; pageCount: number }> {
    const form = pdfForm(bytes, filename);
    form.append("ops", JSON.stringify(ops));
    const res = await postForm(env.PDF_ENGINE_URL, "/pdf/page-ops", form, "pdf.pageops");
    return {
      pdf: Buffer.from(await res.arrayBuffer()),
      pageCount: Number(res.headers.get("X-Page-Count") ?? 0),
    };
  },

  async formFields(bytes: Buffer | Uint8Array, filename?: string): Promise<{ count: number; fields: FormField[] }> {
    const res = await postForm(env.PDF_ENGINE_URL, "/pdf/form-fields", pdfForm(bytes, filename), "pdf.formfields");
    return (await res.json()) as { count: number; fields: FormField[] };
  },

  async fillForm(
    bytes: Buffer | Uint8Array,
    filename: string | undefined,
    values: Record<string, string>,
  ): Promise<{ pdf: Buffer; fieldsFilled: number }> {
    const form = pdfForm(bytes, filename);
    form.append("values", JSON.stringify(values));
    const res = await postForm(env.PDF_ENGINE_URL, "/pdf/fill-form", form, "pdf.fillform");
    return {
      pdf: Buffer.from(await res.arrayBuffer()),
      fieldsFilled: Number(res.headers.get("X-Fields-Filled") ?? 0),
    };
  },

  async merge(
    parts: { bytes: Buffer | Uint8Array; filename?: string }[],
  ): Promise<{ pdf: Buffer; pageCount: number }> {
    const form = new FormData();
    for (const p of parts) {
      const ab = new ArrayBuffer(p.bytes.byteLength);
      new Uint8Array(ab).set(p.bytes);
      form.append("files", new Blob([ab], { type: "application/pdf" }), p.filename ?? "part.pdf");
    }
    const res = await postForm(env.PDF_ENGINE_URL, "/pdf/merge", form, "pdf.merge");
    return { pdf: Buffer.from(await res.arrayBuffer()), pageCount: Number(res.headers.get("X-Page-Count") ?? 0) };
  },

  async split(
    bytes: Buffer | Uint8Array,
    filename: string | undefined,
    ranges: string,
  ): Promise<{ pdf: Buffer; pageCount: number }> {
    const form = pdfForm(bytes, filename);
    form.append("ranges", ranges);
    const res = await postForm(env.PDF_ENGINE_URL, "/pdf/split", form, "pdf.split");
    return { pdf: Buffer.from(await res.arrayBuffer()), pageCount: Number(res.headers.get("X-Page-Count") ?? 0) };
  },

  async stamp(
    bytes: Buffer | Uint8Array,
    filename: string | undefined,
    stamps: StampItem[],
  ): Promise<{ pdf: Buffer; pageCount: number }> {
    const form = pdfForm(bytes, filename);
    form.append("stamps", JSON.stringify(stamps));
    const res = await postForm(env.PDF_ENGINE_URL, "/pdf/stamp", form, "pdf.stamp");
    return { pdf: Buffer.from(await res.arrayBuffer()), pageCount: Number(res.headers.get("X-Page-Count") ?? 0) };
  },

  async textPage(title: string, lines: string[]): Promise<{ pdf: Buffer }> {
    const token = await serviceToken("system", "pdf.textpage");
    const res = await fetch(`${env.PDF_ENGINE_URL}/pdf/text-page`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, lines }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`pdf-engine /pdf/text-page failed: ${res.status} ${await res.text()}`);
    return { pdf: Buffer.from(await res.arrayBuffer()) };
  },
};

export interface ExtractedAttribute {
  key: string;
  value: string | null;
  confidence: number | null;
}

export interface AnalyzeResult {
  summary: string;
  risks: { title: string; severity: string; note: string }[];
  obligations: string[];
  key_dates: string[];
  provider: string;
}

export interface AskResult {
  answer: string;
  citations: { n: number; score: number; text: string }[];
  provider: string;
}

export const intelligence = {
  health: () => call<HealthResponse>(env.INTELLIGENCE_URL, "/health", { method: "GET", scope: "health" }),
  extract: (
    text: string,
    attributes: {
      key: string;
      label?: string;
      type?: string;
      prompt?: string;
      mode?: string;
      inclusion?: string[];
      exclusion?: string[];
    }[],
  ) =>
    call<{ provider: string; values: ExtractedAttribute[] }>(env.INTELLIGENCE_URL, "/ai/extract", {
      method: "POST",
      body: { text, attributes },
      scope: "extract",
    }),
  analyze: (text: string) =>
    call<AnalyzeResult>(env.INTELLIGENCE_URL, "/ai/analyze", { method: "POST", body: { text }, scope: "analyze" }),
  ask: (text: string, question: string, docId?: string) =>
    call<AskResult>(env.INTELLIGENCE_URL, "/ai/ask", {
      method: "POST",
      body: { text, question, doc_id: docId },
      scope: "ask",
    }),
  classify: (text: string) =>
    call<{ provider: string; clauses: { title: string; category: string; risk: string; text: string }[] }>(
      env.INTELLIGENCE_URL,
      "/ai/clauses",
      { method: "POST", body: { text }, scope: "classify" },
    ),
  redline: (text: string, standards: { title: string; text: string }[]) =>
    call<{ provider: string; findings: { clause: string; status: string; note: string; suggestion: string }[] }>(
      env.INTELLIGENCE_URL,
      "/ai/redline",
      { method: "POST", body: { text, standards }, scope: "redline" },
    ),
  diff: (before: string, after: string) =>
    call<{ provider: string; summary: string }>(env.INTELLIGENCE_URL, "/ai/diff", {
      method: "POST",
      body: { before, after },
      scope: "diff",
    }),
};

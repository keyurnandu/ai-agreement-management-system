import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { intelligence } from "@/lib/services/client";
import { roleAtLeast } from "@/lib/rbac";
import { getDocumentText } from "@/lib/documents";

export const dynamic = "force-dynamic";

// Test a single attribute definition against sample text or a document, returning the value.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json()) as {
    label?: string;
    type?: string;
    prompt?: string;
    mode?: string;
    inclusionExamples?: string[];
    exclusionExamples?: string[];
    sampleText?: string;
    documentId?: string;
  };

  let text = (b.sampleText ?? "").trim();
  if (!text && b.documentId) text = (await getDocumentText(b.documentId)) ?? "";
  if (!text) return NextResponse.json({ error: "provide sample text or a documentId" }, { status: 400 });

  const { provider, values } = await intelligence.extract(text, [
    {
      key: "test",
      label: b.label ?? "value",
      type: b.type ?? "TEXT",
      prompt: b.prompt ?? "",
      mode: b.mode ?? "STRICT",
      inclusion: b.inclusionExamples ?? [],
      exclusion: b.exclusionExamples ?? [],
    },
  ]);
  return NextResponse.json({ provider, value: values[0]?.value ?? null });
}

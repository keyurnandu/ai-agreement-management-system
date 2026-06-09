import { NextResponse } from "next/server";
import { env } from "@/env";
import { API_SCOPES } from "@/lib/apikey";

export const dynamic = "force-dynamic";

// Published OpenAPI 3.0 spec for the external API. Public (discovery).
export function GET() {
  const listOp = (tag: string, summary: string, scope: string) => ({
    tags: [tag],
    summary,
    security: [{ apiKey: [] }],
    "x-required-scope": scope,
    responses: { "200": { description: "OK" }, "401": { description: "Invalid/missing API key" }, "403": { description: "Missing scope" } },
  });
  const idParam = [{ name: "id", in: "path", required: true, schema: { type: "string" } }];

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "contract-platform API",
      version: "1.0.0",
      description:
        "External read API. Authenticate with `Authorization: Bearer cpk_...`. Keys and scopes are managed in the Developer settings. Webhooks deliver events with an `X-CP-Signature: sha256=<HMAC>` header.",
    },
    servers: [{ url: `${env.APP_BASE_URL}/api/v1` }],
    security: [{ apiKey: [] }],
    "x-scopes": API_SCOPES,
    "x-webhook-events": ["agreement.completed", "attribute.extracted", "document.uploaded", "contract.generated"],
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "API key: cpk_<prefix>.<secret>" },
      },
    },
    paths: {
      "/documents": { get: listOp("documents", "List documents", "documents:read") },
      "/documents/{id}": { get: { ...listOp("documents", "Get a document + versions", "documents:read"), parameters: idParam } },
      "/documents/{id}/attributes": {
        get: { ...listOp("documents", "Get extracted attribute values", "attributes:read"), parameters: idParam },
      },
      "/agreements": { get: listOp("agreements", "List agreements", "agreements:read") },
      "/agreements/{id}": { get: { ...listOp("agreements", "Get an agreement + recipients", "agreements:read"), parameters: idParam } },
    },
  };
  return NextResponse.json(spec);
}

import { formatClauseBodyToHtml } from "@/lib/clause-format";

export function ClauseBody({ text }: { text: string }) {
  return <div className="clause-body" dangerouslySetInnerHTML={{ __html: formatClauseBodyToHtml(text) }} />;
}

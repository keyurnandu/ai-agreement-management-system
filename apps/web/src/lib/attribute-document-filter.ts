/** Match attribute documentType against a document's commercial type key/prefix. */
export function attributeAppliesToDocument(
  attributeDocumentType: string | null | undefined,
  docTypeKey: string | null | undefined,
  docTypePrefix: string | null | undefined,
): boolean {
  if (!attributeDocumentType?.trim()) return true;
  const needle = attributeDocumentType.trim().toLowerCase();
  const key = docTypeKey?.toLowerCase() ?? "";
  const prefix = docTypePrefix?.toLowerCase() ?? "";
  return key.includes(needle) || prefix.includes(needle) || needle === key || needle === prefix;
}

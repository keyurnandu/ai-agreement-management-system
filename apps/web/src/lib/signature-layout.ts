/** Normalized field placement for one signatory (DocuSign-style block). */
export type SignatureBlockField = {
  recipientId: string;
  type: "SIGNATURE" | "TEXT" | "DATE";
  label: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
};

type Signer = { id: string; name: string | null; email: string; routingOrder: number };

const ROW = {
  signature: { dy: 0.05, h: 0.048 },
  name: { dy: 0.115, h: 0.034 },
  title: { dy: 0.165, h: 0.034 },
  date: { dy: 0.215, h: 0.034 },
};

/** Industry-standard dual-column signature block on the signature page. */
export function layoutSignatureBlocks(page: number, signers: Signer[]): SignatureBlockField[] {
  const sorted = [...signers].sort((a, b) => a.routingOrder - b.routingOrder);
  const cols = sorted.length === 1 ? 1 : 2;
  const colWidth = 0.4;
  const colX = cols === 1 ? [0.3] : [0.07, 0.53];
  const rowStride = 0.34;
  const baseY = sorted.length <= 2 ? 0.52 : 0.38;

  const out: SignatureBlockField[] = [];

  sorted.forEach((signer, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = colX[col] ?? 0.07;
    const y0 = baseY + row * rowStride;
    const party = signer.name?.trim() || signer.email;

    out.push(
      {
        recipientId: signer.id,
        type: "SIGNATURE",
        label: "Signature",
        page,
        x,
        y: y0 + ROW.signature.dy,
        width: colWidth,
        height: ROW.signature.h,
        required: true,
      },
      {
        recipientId: signer.id,
        type: "TEXT",
        label: "Name",
        page,
        x,
        y: y0 + ROW.name.dy,
        width: colWidth,
        height: ROW.name.h,
        required: true,
      },
      {
        recipientId: signer.id,
        type: "TEXT",
        label: "Title",
        page,
        x,
        y: y0 + ROW.title.dy,
        width: colWidth,
        height: ROW.title.h,
        required: true,
      },
      {
        recipientId: signer.id,
        type: "DATE",
        label: "Date",
        page,
        x,
        y: y0 + ROW.date.dy,
        width: 0.2,
        height: ROW.date.h,
        required: true,
      },
    );

    // Static party heading is stamped via signature-page PDF text, not a field.
    void party;
  });

  return out;
}

type SendField = { recipientId: string | null; type: string; label: string | null; required: boolean };
type SendRecipient = { id: string; email: string; role: string };

export function signerHasStandardBlock(fields: SendField[], recipientId: string): boolean {
  const mine = fields.filter((f) => f.recipientId === recipientId);
  const has = (type: string, label: string) =>
    mine.some((f) => f.type === type && f.label === label && f.required);
  return has("SIGNATURE", "Signature") && has("TEXT", "Name") && has("TEXT", "Title") && has("DATE", "Date");
}

export function agreementSendReadiness(recipients: SendRecipient[], fields: SendField[]) {
  const signers = recipients.filter((r) => r.role !== "CC");
  const signersMissing = signers.filter((r) => !signerHasStandardBlock(fields, r.id));
  const ready = signers.length > 0 && signersMissing.length === 0;
  let blocker: string | null = null;
  if (recipients.length === 0) blocker = "Add a recipient to begin";
  else if (signers.length === 0) blocker = "Add at least one signer";
  else if (signersMissing.length) {
    blocker = `Signature blocks missing for ${signersMissing.map((r) => r.email).join(", ")}`;
  }
  return { ready, blocker, signers, signersMissing };
}

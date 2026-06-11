"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  isProcurementBuying,
  procurementExpectsVendorPaper,
  procurementMayAuthorOwnPaper,
} from "@/lib/deal-paper-path";
import { withReturnTo } from "@/lib/record-nav";

type Linked = { contractId: string | null; commercialId: string | null; title?: string };
type Candidate = { id: string; commercialId: string | null; title: string };

export function LinkContractPanel({
  dealId,
  commercialId,
  direction,
  commercialTypeKey,
  status,
}: {
  dealId: string;
  commercialId?: string | null;
  direction: "ORG_SELLING" | "ORG_BUYING";
  commercialTypeKey?: string | null;
  status?: string;
}) {
  const router = useRouter();
  const [linked, setLinked] = useState<Linked | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showOwnPaper, setShowOwnPaper] = useState(false);

  const procurement = isProcurementBuying(direction);
  const vendorPaperDefault = procurement && procurementExpectsVendorPaper(commercialTypeKey);
  const canAuthorOwn = !procurement || procurementMayAuthorOwnPaper(commercialTypeKey);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}/linked-contract`);
    if (r.ok) {
      const j = (await r.json()) as Linked & { title?: string };
      setLinked(j);
    } else {
      setLinked({ contractId: null, commercialId: null });
    }
    const c = await fetch(`/api/deals/${dealId}/link-candidates`);
    if (c.ok) setCandidates(((await c.json()) as { contracts: Candidate[] }).contracts ?? []);
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function linkExisting() {
    if (!pick || busy) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/deals/${dealId}/linked-contract`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contractId: pick }),
    });
    setBusy(false);
    if (r.ok) {
      router.refresh();
      await load();
    } else {
      setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Link failed");
    }
  }

  if (!linked) return <p className="muted" style={{ fontSize: 13 }}>Checking contract link…</p>;

  if (linked.contractId) {
    return null;
  }

  if (procurement && vendorPaperDefault && !showOwnPaper) {
    return (
      <div className="card link-contract-panel">
        <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>Vendor contract</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          For this deal, the <strong>vendor sends their paper</strong>. Use{" "}
          <strong>{status === "DRAFT" ? "Send to counterparty" : "the vendor portal"}</strong> so they can upload their PDF.
          You do not need to create a contract from the clause library.
        </p>
        <ol className="muted" style={{ fontSize: 13, margin: "0 0 12px", paddingLeft: 18 }}>
          <li>Send the deal (if not sent yet)</li>
          <li>Vendor uploads their contract in the portal</li>
          <li>Run compliance check and add issues as needed</li>
          <li>Approve and start signing when ready</li>
        </ol>
        {canAuthorOwn ? (
          <button type="button" className="btn secondary" onClick={() => setShowOwnPaper(true)}>
            Author our own paper instead (clause library)
          </button>
        ) : null}
      </div>
    );
  }

  if (procurement && !showOwnPaper && canAuthorOwn) {
    return (
      <div className="card link-contract-panel">
        <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>Vendor or own paper</h2>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
          <strong>Vendor paper:</strong> send this deal — the vendor uploads their MSA or order PDF in the portal.
          <br />
          <strong>Our paper:</strong> only if legal is drafting the master from your clause library.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn secondary" onClick={() => setShowOwnPaper(true)}>
            Author / link our contract (clause library)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card link-contract-panel">
      <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>
        {procurement ? "Our paper (clause library)" : "Contract (clause library)"}
      </h2>
      {procurement ? (
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          Optional — use when <strong>your organization</strong> is issuing the legal text from templates, not when the vendor
          sends their PDF. Separate from <strong>child deals</strong> in your hierarchy (PCW, POR, etc.).
        </p>
      ) : (
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
          Link or create a <strong>contract</strong> to edit clauses and regenerate the PDF. This is separate from{" "}
          <strong>child deals</strong> in your commercial hierarchy (SCW, SOR, etc.).
        </p>
      )}
      {procurement && vendorPaperDefault ? (
        <button
          type="button"
          className="btn secondary"
          style={{ marginBottom: 10, fontSize: 12, padding: "4px 10px" }}
          onClick={() => setShowOwnPaper(false)}
        >
          ← Back to vendor upload flow
        </button>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <Link
          className="btn"
          href={withReturnTo(
            `/contracts/new?dealId=${dealId}&direction=${direction}`,
            `/deals/${dealId}`,
          )}
        >
          Create contract for this deal
        </Link>
      </div>
      {candidates.length > 0 ? (
        <div>
          <label className="label" style={{ marginTop: 0 }}>
            Or link an existing contract
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="input" style={{ flex: "1 1 200px" }} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Select contract…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.commercialId ?? "(no id)"} — {c.title}
                </option>
              ))}
            </select>
            <button type="button" className="btn secondary" disabled={!pick || busy} onClick={() => void linkExisting()}>
              {busy ? "Linking…" : "Link"}
            </button>
          </div>
        </div>
      ) : null}
      {err ? <p className="error" style={{ marginTop: 8 }}>{err}</p> : null}
    </div>
  );
}

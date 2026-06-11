import Link from "next/link";

export default function WorkflowsHelpPage() {
  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
        ← Home
      </Link>
      <h1 style={{ marginTop: 8 }}>Workflow guide</h1>
      <p className="lead" style={{ marginBottom: 24 }}>
        How deals, contracts, documents, and signing fit together — for sales and procurement teams.
      </p>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Core objects</h2>
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
          <li>
            <strong>Deal</strong> — live workflow with a counterparty (portal, compliance, issues, e-sign).
          </li>
          <li>
            <strong>Contract</strong> — clause library record; edit clauses and generate PDFs.
          </li>
          <li>
            <strong>Document</strong> — PDF file (versions, attributes, Ask AI).
          </li>
          <li>
            <strong>Agreement</strong> — e-sign ceremony; starts from an approved deal.
          </li>
        </ul>
        <p className="muted" style={{ fontSize: 13, marginBottom: 0, marginTop: 12 }}>
          Signing always starts from an approved <strong>Deal</strong>, not from Documents alone.
        </p>
      </section>

      <div className="grid grid-2" style={{ gap: 16, marginBottom: 16 }}>
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Sales cycle</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Org selling to customers — hierarchy SMCW → SCW → SOR (SAM on master or SCW).
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
            <li>Create deal under <Link href="/deals/sales">Sales deals</Link> or link from a contract.</li>
            <li>Send customer portal invite — they can upload or review paper.</li>
            <li>Run compliance, resolve issues, approve document.</li>
            <li>Start signing on the deal page — send for signature in place.</li>
          </ol>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Procurement cycle</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Org buying from vendors — PMCW → PCW → POR. Tail spend = standalone POR (no master).
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
            <li>
              Full cycle: <Link href="/deals/procurement">Procurement deals</Link> → New procurement deal.
            </li>
            <li>
              Tail spend: <Link href="/deals/tail-spend">Quick tail spend order</Link> — vendor uploads first.
            </li>
            <li>Parent link and file template are optional on the new-deal form.</li>
            <li>Approve → Start signing → send from the deal page.</li>
          </ol>
        </section>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Deal status flow</h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>
          <span className="pill">DRAFT</span> →{" "}
          <span className="pill">WITH_VENDOR</span> →{" "}
          <span className="pill">VENDOR_SUBMITTED</span> →{" "}
          <span className="pill">UNDER_REVIEW</span> →{" "}
          <span className="pill">ISSUES_OPEN</span> (loop) →{" "}
          <span className="pill">APPROVED</span> →{" "}
          <span className="pill">SIGNING</span> →{" "}
          <span className="pill">COMPLETED</span>
        </p>
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
          <li>Counterparties use a secret portal URL — no login account.</li>
          <li>Vendor can upload from DRAFT once the portal link is shared.</li>
          <li>Issues raised by your team appear in the portal; fixes show in <strong>What changed</strong>.</li>
        </ul>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Vendor portal</h2>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65 }}>
          <li>Upload PDF or respond to issues on linked contract clauses.</li>
          <li>Direction-aware copy — vendor for procurement, customer for sales.</li>
          <li>After approval, signing links go by email; links can be copied from the deal page.</li>
        </ul>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Demo &amp; roles</h2>
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0 }}>
          Seed demo data with <code>npm run db:seed</code> in <code>apps/web</code>. Sign in as{" "}
          <code>manager@local.test</code> / <code>Manager123!</code>. Set <code>EMAIL_PROVIDER=console</code> to
          print portal and signing emails in the terminal. Full scenario reference:{" "}
          <code>docs/WORKFLOWS_AND_SCENARIOS.md</code> in the repo.
        </p>
      </section>
    </div>
  );
}

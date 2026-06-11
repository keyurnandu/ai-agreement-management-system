import Link from "next/link";

function HubColumn({
  title,
  subtitle,
  direction,
  area,
}: {
  title: string;
  subtitle: string;
  direction: "ORG_SELLING" | "ORG_BUYING";
  area: "deals" | "contracts" | "analytics";
}) {
  const tab = direction === "ORG_BUYING" ? "procurement" : "sales";
  const href = `/${area}/${tab}`;
  const newHref =
    area === "deals"
      ? `/deals/new?direction=${direction}&from=${href}`
      : area === "contracts"
        ? `/contracts/new?direction=${direction}&from=${href}`
        : href;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div>
        <strong>{title}</strong>
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          {subtitle}
        </p>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
        <Link className="btn secondary" href={href} style={{ fontSize: 13 }}>
          Open {tab}
        </Link>
        {area !== "analytics" ? (
          <Link className="btn" href={newHref} style={{ fontSize: 13 }}>
            New {area === "deals" ? "deal" : "contract"}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function CycleHub() {
  return (
    <div className="grid" style={{ gap: 24 }}>
      <section>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Sales cycle</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          Org selling to customers — SMCW → SCW → SOR, customer portal, compliance, e-sign.
        </p>
        <div className="grid grid-3">
          <HubColumn
            title="Deals"
            subtitle="Live negotiation with customers — portal, review, approve, sign."
            direction="ORG_SELLING"
            area="deals"
          />
          <HubColumn
            title="Contracts"
            subtitle="Clause library (CSMCW, CSCW, CSOR) — generate PDFs for deals."
            direction="ORG_SELLING"
            area="contracts"
          />
          <HubColumn
            title="Analytics"
            subtitle="Portfolio — value, dates, draft vs executing vs completed."
            direction="ORG_SELLING"
            area="analytics"
          />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Procurement cycle</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          Org buying from vendors — PMCW → PCW → POR, vendor upload, compliance, e-sign. Tail spend: standalone POR.
        </p>
        <div className="grid grid-3">
          <HubColumn
            title="Deals"
            subtitle="Vendor portal, paper upload, issue loop, approve, sign."
            direction="ORG_BUYING"
            area="deals"
          />
          <HubColumn
            title="Contracts"
            subtitle="Clause library (CPMCW, CPCW, CPOR) — optional parent link."
            direction="ORG_BUYING"
            area="contracts"
          />
          <HubColumn
            title="Analytics"
            subtitle="Vendor spend portfolio and contract phases."
            direction="ORG_BUYING"
            area="analytics"
          />
        </div>
      </section>
    </div>
  );
}

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
          Selling to your customers — from master agreement to order form, with a customer portal, compliance checks, and e-signature.
        </p>
        <div className="grid grid-3">
          <HubColumn
            title="Deals"
            subtitle="Negotiate live with customers — share a portal, review changes, approve, and sign."
            direction="ORG_SELLING"
            area="deals"
          />
          <HubColumn
            title="Contracts"
            subtitle="Build from your clause library and generate deal-ready PDFs."
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
          Buying from your vendors — vendor portal, paper upload, compliance checks, and e-signature. Quick one-off orders supported too.
        </p>
        <div className="grid grid-3">
          <HubColumn
            title="Deals"
            subtitle="Invite vendors to a portal, upload their paper, resolve issues, approve, and sign."
            direction="ORG_BUYING"
            area="deals"
          />
          <HubColumn
            title="Contracts"
            subtitle="Build from your clause library, optionally linked to a master agreement."
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

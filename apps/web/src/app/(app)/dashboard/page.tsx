import Link from "next/link";
import { env } from "@/env";
import { pdfEngine, intelligence } from "@/lib/services/client";

async function checkHealth(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

function StatusPill({ label, up }: { label: string; up: boolean }) {
  return (
    <span className="pill">
      <span className={`dot ${up ? "up" : "down"}`} />
      {label} {up ? "up" : "down"}
    </span>
  );
}

const PHASES: { name: string; desc: string }[] = [
  { name: "Documents & PDF", desc: "Upload, view, annotate, forms, page ops, extraction" },
  { name: "Agreements & e-sign", desc: "Recipients, routing, fields, signing ceremony" },
  { name: "Intelligence", desc: "Summaries, clause/risk extraction, RAG Q&A, redlines" },
  { name: "Analytics", desc: "Cycle time, funnel, renewals, value-at-risk" },
];

export default async function DashboardPage() {
  const [pdfUp, aiUp] = await Promise.all([
    checkHealth(() => pdfEngine.health()),
    checkHealth(() => intelligence.health()),
  ]);

  return (
    <div className="container">
      <h1>Documents &amp; PDF core is live</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Auth, RBAC, audit, the adapter seams, and all three services are wired. Upload a contract to
        view, extract text, and edit pages — every action is versioned and audited.
      </p>
      <div style={{ marginBottom: 24 }}>
        <Link href="/documents" className="btn">
          Open Documents →
        </Link>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Services</h2>
          <div className="grid" style={{ gap: 8 }}>
            <StatusPill label="web gateway" up={true} />
            <StatusPill label="pdf-engine" up={pdfUp} />
            <StatusPill label="intelligence" up={aiUp} />
          </div>
        </div>

        <div className="card">
          <h2>Active adapters</h2>
          <div className="grid" style={{ gap: 8 }}>
            <span className="pill">storage · {env.STORAGE_PROVIDER}</span>
            <span className="pill">auth · {env.AUTH_PROVIDER}</span>
            <span className="pill">db · {process.env.DATABASE_URL?.startsWith("file:") ? "sqlite" : "postgres"}</span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            Flip any of these to cloud in <code>.env</code> — no code changes.
          </p>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Roadmap</h2>
      <div className="grid grid-2">
        {PHASES.map((p) => {
          const href: Record<string, string> = {
            "Documents & PDF": "/documents",
            "Agreements & e-sign": "/agreements",
            "Analytics": "/analytics",
          };
          const link = href[p.name];
          const active = !!link;
          const card = (
            <div className={active ? "card" : "card phase"}>
              <div className="row">
                <strong>{p.name}</strong>
                <span className="pill">{active ? "active" : "planned"}</span>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                {p.desc}
              </p>
            </div>
          );
          return active ? (
            <Link key={p.name} href={link} style={{ color: "inherit" }}>
              {card}
            </Link>
          ) : (
            <div key={p.name}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}

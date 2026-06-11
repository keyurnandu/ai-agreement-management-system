const PHASES = [
  { key: "intake", label: "Create & send", statuses: ["DRAFT", "WITH_VENDOR"] },
  { key: "negotiate", label: "Negotiate", statuses: ["VENDOR_SUBMITTED", "UNDER_REVIEW", "ISSUES_OPEN"] },
  { key: "approve", label: "Approve", statuses: ["APPROVED"] },
  { key: "sign", label: "Sign", statuses: ["SIGNING"] },
  { key: "done", label: "Complete", statuses: ["COMPLETED"] },
] as const;

export function DealPhaseBar({ status }: { status: string }) {
  const activeIdx = PHASES.findIndex((p) => (p.statuses as readonly string[]).includes(status));
  const current = activeIdx >= 0 ? activeIdx : 0;

  return (
    <div className="phase-bar" role="list" aria-label="Deal progress">
      {PHASES.map((phase, i) => {
        const state = i < current ? "done" : i === current ? "active" : "upcoming";
        return (
          <div key={phase.key} className={`phase-bar-step phase-bar-step--${state}`} role="listitem">
            <span className="phase-bar-dot" aria-hidden />
            <span className="phase-bar-label">{phase.label}</span>
          </div>
        );
      })}
    </div>
  );
}

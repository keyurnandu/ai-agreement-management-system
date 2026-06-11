export type ComplianceFinding = {
  id: string;
  title: string;
  severity: string;
  description: string;
};

export type ComplianceStatus =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; count: number; message: string; findings?: ComplianceFinding[] }
  | { phase: "error"; message: string };

const EVENT = "compliance-status";

export function emitComplianceStatus(status: ComplianceStatus) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: status }));
}

export function onComplianceStatus(handler: (status: ComplianceStatus) => void) {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => handler((e as CustomEvent<ComplianceStatus>).detail);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

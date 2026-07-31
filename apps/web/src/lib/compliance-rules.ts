/**
 * Structured, deterministic compliance evaluation.
 *
 * A rule pack's `rulesText` may be either:
 *   - JSON: { version, rules: ComplianceRule[] }  → evaluated locally, deterministically
 *   - free text (legacy)                          → caller falls back to the AI redline path
 *
 * Local evaluation is preferred: it is explainable ("required term X was not found"),
 * repeatable, and needs no model — so the demo always tells the same, clear story.
 */

export type RuleSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface ComplianceRule {
  id: string;
  title: string;
  severity: RuleSeverity;
  /** Passes if AT LEAST ONE of these phrases appears in the document (case-insensitive). */
  requireAny?: string[];
  /** Fails if ANY of these phrases appears (non-standard / disallowed language). */
  forbidAny?: string[];
  /** Plain-language explanation of what the rule requires and how to fix a failure. */
  guidance: string;
}

export interface RulePack {
  version: number;
  rules: ComplianceRule[];
}

export type RuleStatus = "PASS" | "MISSING" | "DEVIATES";

export interface RuleFinding {
  ruleId: string;
  title: string;
  severity: RuleSeverity;
  status: RuleStatus;
  /** Human-readable reason + fix. */
  detail: string;
  /** The disallowed phrase that matched, for DEVIATES findings. */
  matched?: string;
}

/** Parse a rule pack's stored text. Returns null when it isn't structured JSON. */
export function parseRulePack(rulesText: string | null | undefined): RulePack | null {
  if (!rulesText) return null;
  const trimmed = rulesText.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as RulePack;
    if (Array.isArray(parsed.rules) && parsed.rules.length) return parsed;
    return null;
  } catch {
    return null;
  }
}

function contains(haystack: string, needle: string): boolean {
  return haystack.includes(needle.toLowerCase());
}

/** Evaluate every rule against the document text. Deterministic and order-stable. */
export function evaluateCompliance(documentText: string, rules: ComplianceRule[]): RuleFinding[] {
  const text = (documentText || "").toLowerCase();
  const findings: RuleFinding[] = [];

  for (const rule of rules) {
    // A forbidden phrase present → deviation (takes priority — it's an active red flag).
    const bad = (rule.forbidAny ?? []).find((p) => contains(text, p));
    if (bad) {
      findings.push({
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        status: "DEVIATES",
        matched: bad,
        detail: `Found non-standard language "${bad}". ${rule.guidance}`,
      });
      continue;
    }

    // A required phrase missing → gap.
    if (rule.requireAny?.length) {
      const hit = rule.requireAny.some((p) => contains(text, p));
      if (!hit) {
        findings.push({
          ruleId: rule.id,
          title: rule.title,
          severity: rule.severity,
          status: "MISSING",
          detail: `Required clause not found in the document. ${rule.guidance}`,
        });
        continue;
      }
    }

    findings.push({
      ruleId: rule.id,
      title: rule.title,
      severity: rule.severity,
      status: "PASS",
      detail: "Requirement satisfied.",
    });
  }

  return findings;
}

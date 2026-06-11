/** Safe internal paths for ?from= navigation (prevents open redirects). */
export function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.startsWith("/login") || path.startsWith("/sign/") || path.startsWith("/vendor/")) return false;
  return true;
}

export function withReturnTo(href: string, returnTo?: string | null): string {
  if (!returnTo || !isSafeReturnPath(returnTo)) return href;
  const q = href.includes("?") ? "&" : "?";
  return `${href}${q}from=${encodeURIComponent(returnTo)}`;
}

export function backLabelForPath(path: string): string {
  if (path === "/deals/procurement" || path === "/deals/sales") return "deals";
  if (path.startsWith("/deals/")) return "deal";
  if (path === "/contracts/procurement" || path === "/contracts/sales") return "contracts";
  if (path.startsWith("/contracts/")) return "contract";
  if (path === "/documents") return "documents";
  if (path.startsWith("/documents/")) return "document";
  return "back";
}

export function resolveBack(from: string | undefined, fallback: { href: string; label: string }) {
  if (from && isSafeReturnPath(from)) {
    return { href: from, label: backLabelForPath(from) };
  }
  return fallback;
}

export function contractsListHref(direction: string | null | undefined): string {
  return direction === "ORG_BUYING" ? "/contracts/procurement" : "/contracts/sales";
}

export function dealsListHref(direction: string | null | undefined): string {
  return direction === "ORG_BUYING" ? "/deals/procurement" : "/deals/sales";
}

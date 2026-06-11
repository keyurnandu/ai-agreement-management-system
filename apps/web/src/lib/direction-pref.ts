export type CommercialDirection = "ORG_SELLING" | "ORG_BUYING";

const STORAGE_KEY = "commercial-direction";

export function setPreferredDirection(direction: CommercialDirection) {
  try {
    localStorage.setItem(STORAGE_KEY, direction);
  } catch {
    /* ignore */
  }
}

export function getPreferredDirection(): CommercialDirection {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "ORG_BUYING") return "ORG_BUYING";
  } catch {
    /* ignore */
  }
  return "ORG_SELLING";
}

export function areaPath(
  area: "deals" | "contracts" | "analytics" | "agreements",
  direction?: CommercialDirection,
): string {
  const d = direction ?? getPreferredDirection();
  const tab = d === "ORG_BUYING" ? "procurement" : "sales";
  return `/${area}/${tab}`;
}

/** Default paper path for procurement deals (vendor upload vs org clause library). */

const VENDOR_PAPER_TYPE_KEYS = new Set(["por", "pam"]);

const OWN_PAPER_TYPE_KEYS = new Set(["pmcw", "pcw"]);

export function isProcurementBuying(direction: string): boolean {
  return direction === "ORG_BUYING";
}

/** Order forms & amendments — vendor paper is the normal path. */
export function procurementExpectsVendorPaper(commercialTypeKey: string | null | undefined): boolean {
  if (!commercialTypeKey) return true;
  return VENDOR_PAPER_TYPE_KEYS.has(commercialTypeKey);
}

/** Master / wrapper — org may author from clause library or receive vendor MSA. */
export function procurementMayAuthorOwnPaper(commercialTypeKey: string | null | undefined): boolean {
  if (!commercialTypeKey) return true;
  return OWN_PAPER_TYPE_KEYS.has(commercialTypeKey) || !VENDOR_PAPER_TYPE_KEYS.has(commercialTypeKey);
}

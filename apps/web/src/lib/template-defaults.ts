/** Maps contract commercial type keys to authoring template keys. */
export const TEMPLATE_KEY_BY_TYPE: Record<string, string> = {
  csmcw: "sales-master-agreement",
  cscw: "sales-master-agreement",
  cpmcw: "procurement-master-agreement",
  cpcw: "procurement-master-agreement",
  csor: "sales-order-form",
  cpor: "procurement-order-form",
  csam: "sales-amendment",
  cpam: "procurement-amendment",
};

export type DefaultContext = {
  orgName?: string;
  customerName?: string;
  customerAddress?: string;
  vendorName?: string;
  vendorAddress?: string;
  masterReference?: string;
  amendmentNumber?: string;
};

export function defaultVariablesForType(typeKey: string, ctx: DefaultContext = {}): Record<string, string> {
  const today = new Date().toISOString().slice(0, 10);
  const org = ctx.orgName ?? "Demo Corp Inc.";
  const orgAddr = "548 Market Street, San Francisco, CA 94104";

  const base: Record<string, string> = {
    provider: org,
    provider_address: orgAddr,
    customer: ctx.customerName ?? "",
    customer_address: ctx.customerAddress ?? "",
    effective_date: today,
    governing_law: "State of Delaware, USA",
    master_reference: ctx.masterReference ?? `Master Agreement dated ${today}`,
    services_description: "",
    order_total: "",
    billing_frequency: "Annual in advance",
    subscription_term: "12 months",
    renewal_notice_days: "30",
    renewal_period: "12-month",
    support_tier: "Business",
    special_terms: "None.",
    amendment_number: ctx.amendmentNumber ?? "1",
    amendment_date: today,
    amended_provisions: "",
  };

  if (typeKey === "cpmcw" || typeKey === "cpcw" || typeKey === "cpor" || typeKey === "cpam") {
    base.provider = ctx.vendorName ?? "Vendor Legal Name";
    base.provider_address = ctx.vendorAddress ?? "Vendor address";
    base.customer = org;
    base.customer_address = orgAddr;
  }

  return base;
}

export function templateKeyForType(typeKey: string): string | undefined {
  return TEMPLATE_KEY_BY_TYPE[typeKey];
}

export function templatesForCommercialType<T extends { key: string }>(
  typeKey: string,
  templates: T[],
): T[] {
  const tplKey = templateKeyForType(typeKey);
  if (!tplKey) return [];
  return templates.filter((t) => t.key === tplKey);
}

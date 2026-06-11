import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine } from "@/lib/services/client";

export async function getOrgSettings() {
  let row = await prisma.organizationSettings.findUnique({ where: { id: "default" } });
  if (!row) {
    row = await prisma.organizationSettings.create({ data: { id: "default", orgName: "Your Organization" } });
  }
  return row;
}

/** Apply org header, footer, and logo to a PDF. Uses org name as header when header text is empty. */
export async function applyOrgBrandingToPdf(
  pdf: Buffer,
  filename?: string,
): Promise<{ pdf: Buffer; pageCount: number; applied: boolean }> {
  const org = await getOrgSettings();
  const header = (org.headerText?.trim() || org.orgName?.trim() || "") || undefined;
  const footer = org.footerText?.trim() || undefined;

  if (!header && !footer && !org.logoStorageKey) {
    return { pdf, pageCount: 0, applied: false };
  }

  let logoB64: string | undefined;
  if (org.logoStorageKey) {
    const logoBytes = await storage().get(org.logoStorageKey);
    logoB64 = logoBytes.toString("base64");
  }

  const out = await pdfEngine.applyBranding(pdf, filename, {
    header,
    footer,
    logoB64,
  });

  return { pdf: out.pdf, pageCount: out.pageCount, applied: true };
}

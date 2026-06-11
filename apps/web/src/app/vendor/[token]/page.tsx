import { VendorWorkspace } from "@/components/VendorWorkspace";

export const dynamic = "force-dynamic";

export default async function VendorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 0" }}>
      <VendorWorkspace token={token} />
    </div>
  );
}

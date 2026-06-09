import { SigningCeremony } from "@/components/SigningCeremony";

export const dynamic = "force-dynamic";

// Public signing ceremony — no login required (token-gated). Allowed by middleware
// via the "/sign" public prefix in auth config.
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="container">
      <SigningCeremony token={token} />
    </div>
  );
}

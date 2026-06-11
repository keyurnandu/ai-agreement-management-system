import Link from "next/link";
import { NewDealForm } from "@/components/NewDealForm";
import { VendorWorkflowGuide } from "@/components/VendorWorkflowGuide";
import { dealsListHref, resolveBack } from "@/lib/record-nav";

export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string; typeId?: string; direction?: string; from?: string }>;
}) {
  const { parentId, typeId, direction, from } = await searchParams;
  const dir =
    direction === "ORG_BUYING" || direction === "ORG_SELLING" ? direction : undefined;
  const listHref = dealsListHref(dir);
  const back = resolveBack(from, { href: listHref, label: "deals" });

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <Link href={back.href} className="muted" style={{ fontSize: 13 }}>
        ← {back.label}
      </Link>
      <h1 style={{ marginTop: 8 }}>New deal</h1>
      {dir === "ORG_BUYING" ? (
        <p className="lead" style={{ marginBottom: 16 }}>
          Procurement deal — master, PCW, order, or amendment with a vendor.
        </p>
      ) : dir === "ORG_SELLING" ? (
        <p className="lead" style={{ marginBottom: 16 }}>
          Sales deal — master, SCW, order, or amendment with a customer.
        </p>
      ) : null}
      {dir ? (
        <div style={{ marginBottom: 16 }}>
          <VendorWorkflowGuide direction={dir} />
        </div>
      ) : null}
      <NewDealForm parentId={parentId} typeId={typeId} direction={dir} />
    </div>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import { UploadButton } from "@/components/UploadButton";
import { CreateCollectionButton } from "@/components/CreateCollectionButton";

export function DocumentsPageActions() {
  const params = useSearchParams();
  const uploadTo = params.get("uploadTo") ?? undefined;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <CreateCollectionButton parentId={uploadTo} />
      <UploadButton collectionParentId={uploadTo} />
    </div>
  );
}

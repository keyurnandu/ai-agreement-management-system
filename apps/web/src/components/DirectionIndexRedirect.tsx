"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { areaPath, type CommercialDirection } from "@/lib/direction-pref";

export function DirectionIndexRedirect({
  area,
  fallback = "ORG_SELLING",
}: {
  area: "deals" | "contracts" | "analytics" | "agreements";
  fallback?: CommercialDirection;
}) {
  const router = useRouter();
  useEffect(() => {
    router.replace(areaPath(area, fallback));
  }, [router, area, fallback]);
  return <p className="muted">Loading…</p>;
}

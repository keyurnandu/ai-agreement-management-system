"use client";

import Link from "next/link";
import { setPreferredDirection } from "@/lib/direction-pref";

type Tab = { id: string; label: string; href: string; direction?: "ORG_SELLING" | "ORG_BUYING" };

export function DirectionTabs({ tabs, activeId }: { tabs: Tab[]; activeId: string }) {
  return (
    <nav className="direction-tabs" aria-label="Sales or procurement">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={`direction-tab${t.id === activeId ? " active" : ""}`}
          aria-current={t.id === activeId ? "page" : undefined}
          onClick={() => {
            if (t.direction) setPreferredDirection(t.direction);
          }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/attributes", label: "Attributes" },
  { href: "/contracts", label: "Contracts" },
  { href: "/agreements", label: "Agreements" },
  { href: "/analytics", label: "Analytics" },
  { href: "/developer", label: "Developer" },
];

export function NavLinks() {
  const path = usePathname() ?? "";
  return (
    <div className="links">
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/");
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}

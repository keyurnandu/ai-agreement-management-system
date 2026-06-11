"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_SECTIONS } from "@/lib/settings-nav";

export function SettingsNav() {
  const path = usePathname() ?? "";

  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {SETTINGS_SECTIONS.map((s) => {
        const active = path === s.href || path.startsWith(s.href + "/");
        return (
          <Link key={s.href} href={s.href} className={`settings-nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="settings-nav-label">{s.label}</span>
            <span className="settings-nav-desc">{s.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}

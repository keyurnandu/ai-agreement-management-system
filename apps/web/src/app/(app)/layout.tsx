import type { ReactNode } from "react";
import { TopNav } from "@/components/TopNav";

// Wraps all authenticated app pages with the global navigation.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopNav />
      {children}
    </>
  );
}

import type { ReactNode } from "react";
import { TopNav } from "@/components/TopNav";
import { AssistantDock } from "@/components/AssistantDock";

// Wraps all authenticated app pages with the global navigation.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopNav />
      {children}
      <AssistantDock />
    </>
  );
}

"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { AttributeSource } from "@/lib/attribute-source";

export type AttributeHighlight = AttributeSource & { key: string };

type Ctx = {
  highlight: AttributeHighlight | null;
  setHighlight: (h: AttributeHighlight | null) => void;
};

const AttributeHighlightContext = createContext<Ctx | null>(null);

export function AttributeHighlightProvider({ children }: { children: ReactNode }) {
  const [highlight, setHighlight] = useState<AttributeHighlight | null>(null);
  return (
    <AttributeHighlightContext.Provider value={{ highlight, setHighlight }}>
      {children}
    </AttributeHighlightContext.Provider>
  );
}

export function useAttributeHighlight() {
  const ctx = useContext(AttributeHighlightContext);
  if (!ctx) throw new Error("useAttributeHighlight must be used within AttributeHighlightProvider");
  return ctx;
}

/** Non-throwing variant for components that may render outside the provider
 *  (e.g. the collection chat, where citations link out instead of highlighting). */
export function useOptionalAttributeHighlight(): Ctx | null {
  return useContext(AttributeHighlightContext);
}

export type SettingsSection = {
  href: string;
  label: string;
  description: string;
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    href: "/settings/branding",
    label: "Organization",
    description: "Name, header, and footer on generated PDFs",
  },
  {
    href: "/settings/attributes",
    label: "Document attributes",
    description: "Fields extracted from PDFs — dates, value, parties",
  },
  {
    href: "/settings/hierarchy",
    label: "Commercial hierarchy",
    description: "Master, PCW/SCW, order, and amendment types",
  },
  {
    href: "/settings/templates",
    label: "Deal templates",
    description: "PDF or Word templates for new deals",
  },
  {
    href: "/settings/compliance",
    label: "Compliance rules",
    description: "Rule packs for vendor document review",
  },
];

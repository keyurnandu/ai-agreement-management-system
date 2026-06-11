import { redirect } from "next/navigation";

export default function LegacyOrgSettingsPage() {
  redirect("/settings/branding");
}

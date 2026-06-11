import { SettingsNav } from "@/components/SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container settings-layout">
      <h1>Settings</h1>
      <p className="lead" style={{ maxWidth: 640, marginBottom: 20 }}>
        Organization defaults, extracted document fields, commercial types, and deal templates.
      </p>
      <div className="settings-shell">
        <SettingsNav />
        <div className="settings-main">{children}</div>
      </div>
    </div>
  );
}

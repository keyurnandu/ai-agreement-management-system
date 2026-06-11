import Link from "next/link";

export function HelpLink({ style }: { style?: React.CSSProperties }) {
  return (
    <Link href="/help/workflows" className="muted" style={{ fontSize: 12, ...style }}>
      Workflow help →
    </Link>
  );
}

export function Spinner({ size = 14, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <span
      className="ui-spinner"
      style={{ width: size, height: size, ...style }}
      role="status"
      aria-label="Loading"
    />
  );
}

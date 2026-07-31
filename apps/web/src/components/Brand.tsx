import Link from "next/link";

/**
 * ContractIQ logo mark — a rounded document tile with a signature stroke and an
 * "intelligence" spark. Uses currentColor for the spark so it can inherit accent.
 */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="url(#ciq-g)" />
      <path
        d="M9 11.5h9M9 16h7"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path
        d="M9 20.5c2.2 1.7 4.2 1.7 6.4 0 2.2-1.7 4.2-1.7 6.6 0"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="9.5" r="3" fill="#fff" />
      <circle cx="23" cy="9.5" r="1.3" fill="url(#ciq-g)" />
      <defs>
        <linearGradient id="ciq-g" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b93ff" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Brand({
  href = "/dashboard",
  size = 26,
}: {
  href?: string;
  size?: number;
}) {
  return (
    <Link href={href} className="brand-lockup" aria-label="ContractIQ home">
      <BrandMark size={size} />
      <span className="brand-name">
        Contract<span className="brand-iq">IQ</span>
      </span>
    </Link>
  );
}

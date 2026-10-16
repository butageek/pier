/**
 * The Pier mark: The Monogram P-Dock — an architectural 'P' formed by
 * an arched mooring deck and pilings standing over a calm tide wave.
 */
export function Logo({
  className,
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "mark";
}) {
  if (variant === "mark") {
    return (
      <svg
        viewBox="0 0 64 64"
        className={className}
        aria-hidden="true"
        focusable="false"
        fill="none"
      >
        <rect x="17" y="18" width="6" height="28" rx="3" fill="currentColor" />
        <path
          d="M 17 21 H 36 C 43 21 47 25 47 31 C 47 37 43 41 36 41 H 17"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="34" cy="31" r="3" fill="var(--color-primary, #0284c7)" />
        <rect x="37" y="41" width="5" height="6" rx="2.5" fill="currentColor" />
        <path
          d="M 14 51 Q 23 46 32 51 T 50 51"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      <defs>
        <linearGradient id="pier-sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--logo-1, #22d3ee)" />
          <stop offset="100%" stopColor="var(--logo-2, #0284c7)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#pier-sea)" />
      {/* Left Piling / Stem of 'P' */}
      <rect x="17" y="18" width="6" height="28" rx="3" fill="#ffffff" />
      {/* Arched Mooring Deck (P-loop) */}
      <path
        d="M 17 21 H 36 C 43 21 47 25 47 31 C 47 37 43 41 36 41 H 17"
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Mooring Bollard Dot */}
      <circle cx="34" cy="31" r="3" fill="url(#pier-sea)" />
      {/* Right Supporting Piling */}
      <rect x="37" y="41" width="5" height="6" rx="2.5" fill="#ffffff" />
      {/* Wave */}
      <path
        d="M 14 51 Q 23 46 32 51 T 50 51"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

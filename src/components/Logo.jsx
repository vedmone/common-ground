export function LogoMark({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className="logo-mark"
    >
      <rect width="40" height="40" rx="12" fill="currentColor" />
      <path
        d="M12 10.5h9a6.25 6.25 0 0 1 3.2 11.6A5.5 5.5 0 0 1 21 32h-9V10.5Z"
        fill="#fbf7ed"
      />
      <path
        d="M17 15h3.5a2.5 2.5 0 0 1 0 5H17v-5Zm0 9h4a2 2 0 0 1 0 4h-4v-4Z"
        fill="currentColor"
      />
      <path
        d="m26.5 23 7 3.5-3.5 1-1.5 3.5-2-8Z"
        fill="#d6a85e"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The two-cursor glyph: "You" (green) and "Baat" (violet). */
export function CursorGlyph({ who = 'you', size = 16 }) {
  const fill = who === 'ground' ? 'var(--ground)' : 'var(--you)';
  return (
    <svg width={size} height={size + 2} viewBox="0 0 22 24" aria-hidden="true">
      <path
        d="M2 1.8 19 10.6l-7.4 1.9-3.5 7.2L2 1.8Z"
        fill={fill}
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

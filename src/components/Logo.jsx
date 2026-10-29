export function LogoMark({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="logo-mark">
      <circle cx="9" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="15" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 6.4a7 7 0 0 1 0 11.2 7 7 0 0 1 0-11.2Z" fill="currentColor" />
    </svg>
  );
}

/** The two-cursor glyph used in onboarding: "You" (forest) and "Ground" (lilac). */
export function CursorGlyph({ who = 'you', size = 16 }) {
  const fill = who === 'ground' ? 'var(--lilac)' : 'var(--forest)';
  return (
    <svg width={size} height={size + 2} viewBox="0 0 22 24" aria-hidden="true">
      <path d="M2 1.8 19 10.6l-7.4 1.9-3.5 7.2L2 1.8Z" fill={fill} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

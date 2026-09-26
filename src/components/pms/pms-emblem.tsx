import { useId } from "react";

// The Plix PMS monogram: a gold "P" whose bowl holds a keyhole. Same artwork
// as public/pms-icon.svg, inlined so it can sit on any background.
export function PmsEmblem({ className, framed = true }: { className?: string; framed?: boolean }) {
  const id = useId();
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Plix PMS">
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DE9A" />
          <stop offset="0.35" stopColor="#D4AF37" />
          <stop offset="0.65" stopColor="#E6C766" />
          <stop offset="1" stopColor="#A88427" />
        </linearGradient>
      </defs>
      {framed && (
        <>
          <rect width="512" height="512" rx="112" fill="#0E231D" />
          <rect x="14" y="14" width="484" height="484" rx="100" fill="none" stroke="#D4AF37" strokeOpacity="0.35" strokeWidth="3" />
        </>
      )}
      <path d="M188 398V114H292a82 82 0 0 1 0 164H188" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="46" strokeLinejoin="round" />
      <path d="M282 168a24 24 0 1 1 0 48 24 24 0 0 1 0-48Zm-10 40h20l12 46h-44Z" fill={`url(#${id}-gold)`} />
      <circle cx="282" cy="192" r="10" fill="#0E231D" />
      <path d="M277 200h10l6 28h-22Z" fill="#0E231D" />
    </svg>
  );
}

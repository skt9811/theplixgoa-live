import { useState, type CSSProperties } from "react";

const USER = "reservations";
const DOMAIN = "theplixgoa";
const TLD = "com";

function buildHref(): string {
  return `mailto:${USER}@${DOMAIN}.${TLD}`;
}

function buildLabel(): string {
  return `${USER}@${DOMAIN}.${TLD}`;
}

type ObfuscatedEmailProps = {
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  children?: React.ReactNode;
};

export function ObfuscatedEmail({ className, style, ariaLabel, children }: ObfuscatedEmailProps) {
  const [hovered, setHovered] = useState(false);
  const label = children ?? buildLabel();
  return (
    <a
      href={hovered ? buildHref() : "#"}
      onClick={(e) => {
        if (!hovered) {
          e.preventDefault();
          window.location.href = buildHref();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onFocus={() => setHovered(true)}
      aria-label={ariaLabel ?? "Email us"}
      className={className}
      style={style}
    >
      {label}
    </a>
  );
}

export { buildHref as emailHref, buildLabel as emailLabel };

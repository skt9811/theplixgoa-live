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

// Every character as a numeric character reference (&#114;&#101;…). Browsers
// render it as the ordinary address, but the server-rendered HTML never
// contains the address as a literal string, so a scraper (or audit) that
// regex-matches the raw source doesn't find one. It is NOT protection
// against a scraper that parses the DOM — the click target is what does
// that: href stays "#" until the link is hovered, focused or clicked.
function encodeAsEntities(text: string): string {
  return Array.from(text)
    .map((char) => `&#${char.codePointAt(0)};`)
    .join("");
}

export function ObfuscatedEmailText() {
  // Same string on server and client, so hydration sees identical markup.
  return <span dangerouslySetInnerHTML={{ __html: encodeAsEntities(buildLabel()) }} />;
}

type ObfuscatedEmailProps = {
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  children?: React.ReactNode;
};

export function ObfuscatedEmail({ className, style, ariaLabel, children }: ObfuscatedEmailProps) {
  const [hovered, setHovered] = useState(false);
  const label = children ?? <ObfuscatedEmailText />;
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

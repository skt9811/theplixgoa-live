import type { CSSProperties } from "react";

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
// contains the address as a literal string in the visible text, so a
// scraper that regex-matches raw source text for an "@…" pattern doesn't
// find one there. It is NOT protection against a scraper that specifically
// parses mailto: href attributes — ObfuscatedEmail's own href is a plain,
// real mailto: link (see its comment below for why).
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
  const label = children ?? <ObfuscatedEmailText />;
  // A real mailto: href from first paint — the previous hover/focus/click-
  // gated href="#" meant no href attribute ever reached the server-rendered
  // HTML, which broke right-click "copy email address", open-in-new-tab,
  // and read it as a dead link to anything checking href values rather than
  // simulating a click. React has no way to emit raw HTML entities inside an
  // attribute value (dangerouslySetInnerHTML only covers element content),
  // so the href itself can't carry the same entity-reference obfuscation the
  // visible text still does — this trades some protection against a scraper
  // that specifically parses mailto: hrefs for a link that behaves like a
  // real link. The visible text stays obfuscated against plain-text scraping.
  return (
    <a href={buildHref()} aria-label={ariaLabel ?? "Email us"} className={className} style={style}>
      {label}
    </a>
  );
}

export { buildHref as emailHref, buildLabel as emailLabel };

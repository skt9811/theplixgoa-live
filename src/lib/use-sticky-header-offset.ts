import { useEffect, useState } from "react";

/**
 * Live-measures the site's own sticky/fixed <header> height so sticky
 * elements further down the page (the property sub-nav, the booking
 * sidebar) can dock directly beneath it instead of guessing a fixed pixel
 * value — the header's height isn't constant (it wraps differently at
 * different breakpoints).
 */
export function useStickyHeaderOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    function measure() {
      const header = document.querySelector("header");
      setOffset(header ? header.getBoundingClientRect().height : 0);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return offset;
}

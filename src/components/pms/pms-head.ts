import { useEffect } from "react";

export const PMS_TITLE = "Plix PMS — Operations Hub";

// Route-level head() metadata for every /pms page: title, icons, manifest.
export const pmsHead = {
  meta: [
    { title: PMS_TITLE },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#0E231D" },
  ],
  links: [
    { rel: "icon", href: "/pms-icon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", href: "/pms-icon.svg" },
    { rel: "manifest", href: "/pms-manifest.json" },
  ],
};

// The site-wide layout declares its own favicon, touch icon and manifest, and
// head tags from nested routes are added alongside them rather than replacing
// them, so the browser could still pick the public site's. While a /pms page
// is mounted, set those aside and restore them when leaving.
export function usePmsBrandedHead(): void {
  useEffect(() => {
    const removed: { node: Element; parent: Node; next: Node | null }[] = [];
    document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], meta[name="theme-color"]').forEach((node) => {
      const href = node.getAttribute("href") ?? "";
      const isPms = href.startsWith("/pms-") || node.getAttribute("name") === "theme-color" && node.getAttribute("content") === "#0E231D";
      if (isPms) return;
      removed.push({ node, parent: node.parentNode!, next: node.nextSibling });
      node.remove();
    });
    const previousTitle = document.title;
    document.title = PMS_TITLE;
    return () => {
      document.title = previousTitle;
      for (const { node, parent, next } of removed) parent.insertBefore(node, next && next.parentNode === parent ? next : null);
    };
  }, []);
}

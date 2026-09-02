import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";

import { SiteHeader } from "@/components/plix/site-header";
import { SiteFooter } from "@/components/plix/site-footer";
import { Toaster } from "@/components/ui/sonner";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import { SITE_NAME, websiteJsonLd, localBusinessJsonLd, lodgingBusinessJsonLd, organizationJsonLd, jsonLdScript } from "@/lib/seo";
import { chicoHeroImageDesktopWebp, chicoHeroImageMobileWebp } from "@/lib/plix";

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&display=swap";

function loadDeferredAnalytics() {
  const inlineScript = document.createElement("script");
  inlineScript.textContent = `
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "y5emlw3hfs");
  `;
  document.head.appendChild(inlineScript);
}


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              try {
                reset();
              } catch {
                /* ignore */
              }
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "The Plix Goa" },
      { name: "theme-color", content: "#0f172a" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@theplixgoa" },
      { property: "og:site_name", content: SITE_NAME },
      // Ensures mobile browsers/dialers and Googlebot recognize the phone
      // numbers in the LodgingBusiness/Organization schema below as
      // click-to-call, rather than skipping auto-detection.
      { name: "format-detection", content: "telephone=yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preload",
        as: "image",
        type: "image/webp",
        href: chicoHeroImageMobileWebp,
        media: "(max-width: 768px)",
        fetchPriority: "high",
      },
      {
        rel: "preload",
        as: "image",
        type: "image/webp",
        href: chicoHeroImageDesktopWebp,
        media: "(min-width: 769px)",
        fetchPriority: "high",
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preload", as: "style", href: GOOGLE_FONTS_HREF },
      { rel: "icon", href: "/Plix_Transparent_(1)%20copy.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.json" },
      {
        rel: "apple-touch-icon",
        href: "/icon-192.png",
      },
      { rel: "preconnect", href: "https://checkout.razorpay.com" },
    ],
    scripts: [
      { src: "https://www.googletagmanager.com/gtag/js?id=G-98T2N1CNMW", async: true },
      {
        type: "text/javascript",
        // AW-18001047926 (Google Ads) is intentionally NOT configured here —
        // it's hardcoded directly into the static <head> in RootShell below
        // so it's present on every response body regardless of this dynamic
        // head-config mechanism. Configuring it in both places would fire
        // `gtag('config', 'AW-18001047926')` twice per page load, double
        // counting conversions.
        children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-98T2N1CNMW');`,
      },
      { type: "application/ld+json", children: jsonLdScript(websiteJsonLd()) },
      { type: "application/ld+json", children: jsonLdScript(localBusinessJsonLd()) },
      { type: "application/ld+json", children: jsonLdScript(lodgingBusinessJsonLd()) },
      { type: "application/ld+json", children: jsonLdScript(organizationJsonLd()) },
      {
        type: "text/javascript",
        children: `(function() {
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = ${JSON.stringify(GOOGLE_FONTS_HREF)};
  link.media = 'print';
  link.onload = function() { this.media = 'all'; };
  document.head.appendChild(link);
})();`,
      },
      {
        type: "text/javascript",
        children: `if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}`,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Ads Tag — hardcoded directly in the static shell (not via
            the dynamic head() scripts config below) so it's present on the
            raw response body of every GET request, independent of the
            per-route head-config mechanism. See the note next to
            G-98T2N1CNMW in the route's head() for why it's deliberately
            only configured once, here. */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=AW-18001047926" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'AW-18001047926');`,
          }}
        />
        <HeadContent />
        <noscript>
          <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        </noscript>
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (document.readyState === "complete") {
      loadDeferredAnalytics();
      return;
    }
    window.addEventListener("load", loadDeferredAnalytics, { once: true });
    return () => window.removeEventListener("load", loadDeferredAnalytics);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col overflow-x-hidden bg-background">
        <SiteHeader />
        <main className="flex-1 overflow-x-hidden">
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </main>
        <SiteFooter />
      </div>
      <Toaster position="top-center" richColors />
      <SpeedInsights />
      <Analytics />
    </QueryClientProvider>
  );
}


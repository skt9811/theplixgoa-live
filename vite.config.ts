// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Hard-pin the Vercel preset rather than relying on Nitro's platform
  // auto-detection (NITRO_PRESET / Vercel env vars) — this repo is
  // hosted on Vercel (confirmed via `server: Vercel` response headers on
  // theplixgoa.com), so this removes any ambiguity about which deploy
  // target a given build run resolves to. Local builds outside Vercel's
  // own CI will now also produce Vercel-shaped output instead of the
  // Cloudflare default.
  nitro: {
    preset: "vercel",
  },
});

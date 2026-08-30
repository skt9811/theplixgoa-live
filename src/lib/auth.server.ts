// Server-only. The Auth.js configuration shared by:
//  - src/server.ts's /api/auth/* route (Google OAuth sign-in/callback/session/signout)
//  - password-auth.server.ts (the hand-written email+password flow, which
//    issues session cookies using the same JWT secret/salt convention as
//    Auth.js itself — see that file for why Credentials-provider isn't used)
//
// Session strategy is JWT everywhere, not database-backed: Auth.js forces
// JWT-only sessions the moment a Credentials-style provider is present in a
// config, and session strategy is global to the whole config (not
// per-provider) — so there's no way to have Google use database sessions
// while password login uses JWT in one Auth.js instance. The `sessions`
// table in Neon exists (see the schema script) for adapter completeness but
// isn't read at runtime.
import PostgresAdapter from "@auth/pg-adapter";
import Google from "@auth/core/providers/google";
import type { AuthConfig } from "@auth/core/types";
import { Pool } from "pg";

let pool: Pool | null = null;

export function getAuthPool(): Pool | null {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!pool) {
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env["AUTH_GOOGLE_ID"] && process.env["AUTH_GOOGLE_SECRET"]);
}

export function getAuthConfig(): AuthConfig {
  const pgPool = getAuthPool();

  return {
    secret: process.env["AUTH_SECRET"] ?? "",
    // Vercel (and localhost) terminate/forward correctly, and this app has
    // no single fixed AUTH_URL across preview/prod deployments — trusting
    // the request's own Host header is the standard way to handle that.
    trustHost: true,
    session: { strategy: "jwt" },
    ...(pgPool ? { adapter: PostgresAdapter(pgPool) } : {}),
    providers: isGoogleAuthConfigured() ? [Google] : [],
    pages: {
      // Avoid Auth.js's built-in HTML error/signin pages — this app renders
      // its own AuthModal; errors come back as a `?error=` query param on
      // the callbackUrl redirect, which the client reads the same way it
      // already reads other search params.
      error: "/",
    },
  };
}

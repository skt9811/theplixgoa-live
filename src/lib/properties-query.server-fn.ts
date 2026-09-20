// Backs properties-data.ts — createServerFn splits each `.handler(...)`
// body into a server-only bundle, so the Neon connection string never
// reaches the client bundle. This file itself IS imported by properties-
// data.ts (which is in turn imported by properties-manager.tsx, the admin
// dashboard's client-side property editor), so it must never import
// `postgres` directly — all the actual DB logic lives in
// properties-core.server.ts instead; see that file's header comment.
import { createServerFn } from "@tanstack/react-start";
import { fetchActivePropertiesCore, savePropertyCore, type SavePropertyInput } from "@/lib/properties-core.server";

export type { JsonValue, PropertyDbRow } from "@/lib/properties-core.server";

export const fetchActivePropertiesServerFn = createServerFn({ method: "GET" }).handler(fetchActivePropertiesCore);

function isSavePropertyInput(data: unknown): data is SavePropertyInput {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d["slug"] === "string" && typeof d["name"] === "string";
}

export const savePropertyServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isSavePropertyInput(data)) throw new Error("Invalid property payload");
    return data;
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => savePropertyCore(data));

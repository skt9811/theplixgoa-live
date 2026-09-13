// Server-only. Never import this from client-reachable code — it's kept in
// its own .server.ts file specifically so Vite's server-fn split keeps
// these PINs out of the client bundle entirely (unlike VITE_ADMIN_PIN,
// which is deliberately client-visible for the existing /admin gate).
export const PORTAL_PROPERTY_PINS: Record<string, string> = {
  "harbor-court": "1001",
  "the-plix-villa": "1002",
  "casa-marina": "1003",
  "casa-moana": "1004",
  "casa-meadows": "1005",
  "vivenda-chico": "1006",
  "the-plix-resort-morjim": "1007",
  "morjim-pride": "1008",
  "villa-madera": "1009",
  "casa-serenita": "1010",
};

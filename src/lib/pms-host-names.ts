// Shared (server + client) friendly-name mapping for the host Gmail inboxes
// Airbnb inquiry emails get forwarded to. No server-only imports so the
// inquiries route can use it directly for the card badge, alongside
// pms-inquiries.server.ts using it for push/notes text.
export const HOST_NAME_MAP: Record<string, string> = {
  "sandeepkumarbnb@gmail.com": "Sandeep",
  "backupid9968@gmail.com": "Shalini",
  "harborcourt03@gmail.com": "Ghanshyam",
  "kanhaiharborcourt@gmail.com": "Kanhai",
  "skt9811@gmail.com": "Rohit",
};

export function getHostDisplayName(email: string | null | undefined): string | null {
  if (!email) return null;
  return HOST_NAME_MAP[email.toLowerCase()] ?? null;
}

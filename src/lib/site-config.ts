import { supabase, notifyDataChange } from "@/lib/rates";

export type SiteConfig = {
  hero_heading: string;
  hero_subtitle: string;
  hero_image_url: string;
  hero_cta_text: string;
  hero_cta_link: string;
  about_bio: string;
  contact_phone1: string;
  contact_phone2: string;
  contact_email: string;
  contact_address: string;
  whatsapp_number: string;
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  section_locations_visible: boolean;
  section_perks_visible: boolean;
  section_reviews_visible: boolean;
  section_faqs_visible: boolean;
};

const DEFAULT_CONFIG: SiteConfig = {
  hero_heading: "An Exclusive Collection of Luxury Private Pool Villas in Goa",
  hero_subtitle:
    "Handpicked coastal sanctuaries across Anjuna, Vagator, Assagao, Morjim, and Candolim — designed for slow living, effortless luxury, and group escapes.",
  hero_image_url: "",
  hero_cta_text: "Book Your Stay",
  hero_cta_link: "/contact",
  about_bio:
    "Plix Hospitality is a small, Goa-based team of hosts, caretakers and chefs looking after a tightly curated set of villas in the north. We started with a single villa in Morjim and a simple belief: a great Goan holiday is made by the people looking after you, not by a listing page.",
  contact_phone1: "+91-9009800809",
  contact_phone2: "+91-9009800895",
  contact_email: "stay@theplixgoa.com",
  contact_address: "Pequen, Chivar, 1561/3A, Anjuna, Vagator, Goa 403413",
  whatsapp_number: "919009800809",
  social_facebook: "https://facebook.com/theplixgoa",
  social_instagram: "https://instagram.com/theplixgoa",
  social_twitter: "https://x.com/theplixgoa",
  section_locations_visible: true,
  section_perks_visible: true,
  section_reviews_visible: true,
  section_faqs_visible: true,
};

const LS_KEY = "plix_site_config";

function readLocalConfig(): SiteConfig {
  if (typeof localStorage === "undefined") return { ...DEFAULT_CONFIG };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeLocalConfig(config: SiteConfig): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
  } catch {
    // storage full or unavailable
  }
}

export async function fetchSiteConfig(): Promise<SiteConfig> {
  try {
    const { data, error } = await supabase
      .from("site_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (!error && data) {
      const merged = { ...DEFAULT_CONFIG, ...data } as SiteConfig;
      writeLocalConfig(merged);
      return merged;
    }
  } catch {
    // network error — fall through to localStorage
  }
  return readLocalConfig();
}

export async function saveSiteConfig(
  config: Partial<SiteConfig>,
): Promise<{ error: string | null }> {
  const current = readLocalConfig();
  const updated = { ...current, ...config };

  try {
    const { error } = await supabase
      .from("site_config")
      .upsert({ id: 1, ...updated, updated_at: new Date().toISOString() });

    if (error) throw error;
  } catch {
    // Supabase failed — continue to localStorage
  }

  writeLocalConfig(updated);
  notifyDataChange();
  return { error: null };
}

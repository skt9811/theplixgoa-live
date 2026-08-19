import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader as Loader2, Save } from "lucide-react";
import {
  fetchSiteConfig,
  saveSiteConfig,
  type SiteConfig,
} from "@/lib/site-config";

type SectionKey = "section_locations_visible" | "section_perks_visible" | "section_reviews_visible" | "section_faqs_visible";

const SECTION_LABELS: Record<SectionKey, string> = {
  section_locations_visible: "Locations Grid (homepage)",
  section_perks_visible: "Perks / Why Us (homepage)",
  section_reviews_visible: "Guest Reviews (homepage)",
  section_faqs_visible: "FAQ Section (homepage)",
};

export function PageContentEditor() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchSiteConfig().then(setConfig);
  }, []);

  function update<K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    const { error } = await saveSiteConfig(config);
    setSaving(false);
    if (error) {
      toast.error("Failed to save");
      return;
    }
    toast.success("Site content updated");
  }

  if (!config) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-bronze" />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {/* Hero Section */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <h3 className="text-sm font-semibold text-white">Homepage Hero</h3>
        <div className="mt-3 grid gap-3">
          <label className="text-xs text-white/60">
            Main Heading
            <textarea
              value={config.hero_heading}
              onChange={(e) => update("hero_heading", e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <label className="text-xs text-white/60">
            Subtitle
            <textarea
              value={config.hero_subtitle}
              onChange={(e) => update("hero_subtitle", e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-white/60">
              CTA Button Text
              <input
                type="text"
                value={config.hero_cta_text}
                onChange={(e) => update("hero_cta_text", e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
              />
            </label>
            <label className="text-xs text-white/60">
              CTA Button Link
              <input
                type="text"
                value={config.hero_cta_link}
                onChange={(e) => update("hero_cta_link", e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
              />
            </label>
          </div>
          <label className="text-xs text-white/60">
            Hero Image URL (leave empty to use default)
            <input
              type="url"
              value={config.hero_image_url}
              onChange={(e) => update("hero_image_url", e.target.value)}
              placeholder="https://example.com/hero.jpg"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
            />
          </label>
        </div>
      </div>

      {/* About Section */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <h3 className="text-sm font-semibold text-white">About Page Bio</h3>
        <label className="mt-3 block text-xs text-white/60">
          Hotel Bio / Story
          <textarea
            value={config.about_bio}
            onChange={(e) => update("about_bio", e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
          />
        </label>
      </div>

      {/* Contact & Social */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <h3 className="text-sm font-semibold text-white">Contact Details & Social Links</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-white/60">
            Phone 1
            <input
              type="text"
              value={config.contact_phone1}
              onChange={(e) => update("contact_phone1", e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <label className="text-xs text-white/60">
            Phone 2
            <input
              type="text"
              value={config.contact_phone2}
              onChange={(e) => update("contact_phone2", e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <label className="text-xs text-white/60">
            Email
            <input
              type="email"
              value={config.contact_email}
              onChange={(e) => update("contact_email", e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <label className="text-xs text-white/60">
            WhatsApp Number
            <input
              type="text"
              value={config.whatsapp_number}
              onChange={(e) => update("whatsapp_number", e.target.value)}
              placeholder="919009800809"
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <label className="text-xs text-white/60 sm:col-span-2">
            Address
            <input
              type="text"
              value={config.contact_address}
              onChange={(e) => update("contact_address", e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <label className="text-xs text-white/60">
            Facebook URL
            <input
              type="url"
              value={config.social_facebook}
              onChange={(e) => update("social_facebook", e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <label className="text-xs text-white/60">
            Instagram URL
            <input
              type="url"
              value={config.social_instagram}
              onChange={(e) => update("social_instagram", e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
          <label className="text-xs text-white/60 sm:col-span-2">
            Twitter / X URL
            <input
              type="url"
              value={config.social_twitter}
              onChange={(e) => update("social_twitter", e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
            />
          </label>
        </div>
      </div>

      {/* Section Visibility Toggles */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <h3 className="text-sm font-semibold text-white">Homepage Section Visibility</h3>
        <p className="mt-1 text-xs text-white/50">Toggle sections on or off across the homepage</p>
        <div className="mt-3 grid gap-2">
          {(Object.keys(SECTION_LABELS) as SectionKey[]).map((key) => (
            <label
              key={key}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
            >
              <span className="text-sm text-white/80">{SECTION_LABELS[key]}</span>
              <button
                onClick={() => update(key, !config[key])}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  config[key] ? "bg-bronze" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
                    config[key] ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-bronze px-5 py-3.5 text-sm font-semibold text-bronze-foreground transition-transform active:scale-95 disabled:opacity-40"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Save All Content
      </button>
    </div>
  );
}

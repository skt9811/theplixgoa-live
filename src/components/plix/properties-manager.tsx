import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Loader as Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { PROPERTIES, formatINR, type Property } from "@/lib/plix";
import { savePropertyOverride } from "@/lib/properties-data";

type EditState = {
  slug: string;
  name: string;
  tagline: string;
  base_price: string;
  location: string;
  max_guests: string;
  bedrooms: string;
  bathrooms: string;
  description: string;
  amenity_tags: string[];
  newAmenity: string;
};

function toEditState(p: Property): EditState {
  return {
    slug: p.slug,
    name: p.name,
    tagline: p.tagline ?? "",
    base_price: String(p.base_price),
    location: p.location,
    max_guests: String(p.max_guests),
    bedrooms: String(p.bedrooms),
    bathrooms: String(p.bathrooms),
    description: p.description,
    amenity_tags: [...p.amenity_tags],
    newAmenity: "",
  };
}

export function PropertiesManager() {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const initial: Record<string, EditState> = {};
    for (const p of PROPERTIES) {
      initial[p.slug] = toEditState(p);
    }
    setEdits(initial);
  }, []);

  function updateField(slug: string, field: keyof EditState, value: string | string[]) {
    setEdits((prev) => ({
      ...prev,
      [slug]: { ...prev[slug], [field]: value },
    }));
  }

  function addAmenity(slug: string) {
    const edit = edits[slug];
    if (!edit || !edit.newAmenity.trim()) return;
    if (edit.amenity_tags.includes(edit.newAmenity.trim())) {
      toast.error("Amenity already exists");
      return;
    }
    setEdits((prev) => ({
      ...prev,
      [slug]: {
        ...edit,
        amenity_tags: [...edit.amenity_tags, edit.newAmenity.trim()],
        newAmenity: "",
      },
    }));
  }

  function removeAmenity(slug: string, amenity: string) {
    const edit = edits[slug];
    if (!edit) return;
    setEdits((prev) => ({
      ...prev,
      [slug]: {
        ...edit,
        amenity_tags: edit.amenity_tags.filter((a) => a !== amenity),
      },
    }));
  }

  async function save(slug: string) {
    const edit = edits[slug];
    if (!edit) return;
    if (!edit.name.trim()) {
      toast.error("Property name is required");
      return;
    }
    const price = Number(edit.base_price);
    if (Number.isNaN(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }

    setSaving(true);
    const { error } = await savePropertyOverride(slug, {
      name: edit.name.trim(),
      tagline: edit.tagline.trim(),
      base_price: price,
      location: edit.location.trim(),
      max_guests: Number(edit.max_guests) || 1,
      bedrooms: Number(edit.bedrooms) || 1,
      bathrooms: Number(edit.bathrooms) || 1,
      description: edit.description.trim(),
      amenity_tags: edit.amenity_tags,
    });
    setSaving(false);

    if (error) {
      toast.error("Failed to save");
      return;
    }
    toast.success(`${edit.name} updated`);
    setExpandedSlug(null);
  }

  return (
    <div className="grid gap-3">
      {PROPERTIES.map((property) => {
        const edit = edits[property.slug];
        if (!edit) return null;
        const isExpanded = expandedSlug === property.slug;

        return (
          <div
            key={property.slug}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
          >
            <button
              onClick={() => setExpandedSlug(isExpanded ? null : property.slug)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-3">
                <img
                  src={property.image_keys[0] ? undefined : undefined}
                  alt=""
                  className="hidden"
                />
                <div>
                  <p className="text-sm font-semibold text-white">{edit.name}</p>
                  <p className="text-xs text-white/50">
                    {edit.location} · {formatINR(Number(edit.base_price))}/night · {edit.bedrooms} BHK
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`size-4 shrink-0 text-white/40 transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {isExpanded && (
              <div className="border-t border-white/10 p-4">
                <div className="grid gap-4">
                  {/* Name & Tagline */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-white/60">
                      Property Name
                      <input
                        type="text"
                        value={edit.name}
                        onChange={(e) => updateField(property.slug, "name", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                      />
                    </label>
                    <label className="text-xs text-white/60">
                      Location
                      <input
                        type="text"
                        value={edit.location}
                        onChange={(e) => updateField(property.slug, "location", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                      />
                    </label>
                  </div>

                  <label className="text-xs text-white/60">
                    Tagline
                    <input
                      type="text"
                      value={edit.tagline}
                      onChange={(e) => updateField(property.slug, "tagline", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                    />
                  </label>

                  {/* Price, Guests, Beds, Baths */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <label className="text-xs text-white/60">
                      Price / night (₹)
                      <input
                        type="number"
                        min={0}
                        value={edit.base_price}
                        onChange={(e) => updateField(property.slug, "base_price", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                      />
                    </label>
                    <label className="text-xs text-white/60">
                      Max Guests
                      <input
                        type="number"
                        min={1}
                        value={edit.max_guests}
                        onChange={(e) => updateField(property.slug, "max_guests", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                      />
                    </label>
                    <label className="text-xs text-white/60">
                      Bedrooms
                      <input
                        type="number"
                        min={1}
                        value={edit.bedrooms}
                        onChange={(e) => updateField(property.slug, "bedrooms", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                      />
                    </label>
                    <label className="text-xs text-white/60">
                      Bathrooms
                      <input
                        type="number"
                        min={1}
                        value={edit.bathrooms}
                        onChange={(e) => updateField(property.slug, "bathrooms", e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                      />
                    </label>
                  </div>

                  {/* Description */}
                  <label className="text-xs text-white/60">
                    Description
                    <textarea
                      value={edit.description}
                      onChange={(e) => updateField(property.slug, "description", e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                    />
                  </label>

                  {/* Amenities */}
                  <div>
                    <p className="text-xs font-medium text-white/70">Amenities</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {edit.amenity_tags.map((amenity) => (
                        <span
                          key={amenity}
                          className="inline-flex items-center gap-1.5 rounded-full border border-bronze/30 bg-bronze/10 px-3 py-1.5 text-xs text-bronze"
                        >
                          {amenity}
                          <button
                            onClick={() => removeAmenity(property.slug, amenity)}
                            className="text-bronze/60 hover:text-red-400"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                      {edit.amenity_tags.length === 0 && (
                        <span className="text-xs text-white/40">No amenities yet</span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={edit.newAmenity}
                        onChange={(e) => updateField(property.slug, "newAmenity", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addAmenity(property.slug);
                          }
                        }}
                        placeholder="Add amenity (e.g., Chef on Request)"
                        className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
                      />
                      <button
                        onClick={() => addAmenity(property.slug)}
                        disabled={!edit.newAmenity.trim()}
                        className="shrink-0 rounded-lg bg-white/15 px-3 py-2 text-white transition-colors hover:bg-white/25 disabled:opacity-30"
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* Save */}
                  <button
                    onClick={() => void save(property.slug)}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-bronze px-5 py-3 text-sm font-semibold text-bronze-foreground transition-transform active:scale-95 disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Save Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

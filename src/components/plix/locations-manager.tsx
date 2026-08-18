import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, GripVertical, Loader as Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import {
  fetchLocationGrids,
  saveLocationGrid,
  deleteLocationGrid,
  type LocationGrid,
} from "@/lib/locations-data";

export function LocationsManager() {
  const [locations, setLocations] = useState<LocationGrid[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LocationGrid | null>(null);

  // New location form
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newImage, setNewImage] = useState("");
  const [newProps, setNewProps] = useState<string[]>([]);

  // Edit form
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editImage, setEditImage] = useState("");
  const [editProps, setEditProps] = useState<string[]>([]);

  async function load() {
    const data = await fetchLocationGrids();
    setLocations(data);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  function startEdit(loc: LocationGrid) {
    setEditingId(loc.id);
    setEditTitle(loc.title);
    setEditDesc(loc.description);
    setEditImage(loc.image_url);
    setEditProps(loc.property_ids);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const { error } = await saveLocationGrid({
      id,
      title: editTitle.trim(),
      description: editDesc.trim(),
      image_url: editImage.trim(),
      property_ids: editProps,
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to save");
      return;
    }
    toast.success("Location updated");
    setEditingId(null);
    void load();
  }

  async function addLocation() {
    if (!newTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const { error } = await saveLocationGrid({
      title: newTitle.trim(),
      description: newDesc.trim(),
      image_url: newImage.trim(),
      property_ids: newProps,
      is_active: true,
      sort_order: locations.length,
    });
    setSaving(false);
    if (error) {
      toast.error("Failed to add location");
      return;
    }
    toast.success("Location added");
    setNewTitle("");
    setNewDesc("");
    setNewImage("");
    setNewProps([]);
    setShowForm(false);
    void load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    const { error } = await deleteLocationGrid(deleteTarget.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Location deleted");
    setDeleteTarget(null);
    void load();
  }

  function toggleProperty(selectedList: string[], slug: string): string[] {
    return selectedList.includes(slug)
      ? selectedList.filter((s) => s !== slug)
      : [...selectedList, slug];
  }

  if (!loaded) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-bronze" />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Add new button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 py-4 text-sm text-white/50 transition-colors hover:border-bronze/50 hover:text-white/70"
        >
          <Plus className="size-4" />
          Add New Location
        </button>
      )}

      {/* New location form */}
      {showForm && (
        <div className="rounded-2xl border border-bronze/30 bg-bronze/[0.08] p-4">
          <h3 className="text-sm font-semibold text-white">New Location</h3>
          <div className="mt-3 grid gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Location title (e.g., Siolim)"
              className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short description"
              className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
            />
            <input
              type="url"
              value={newImage}
              onChange={(e) => setNewImage(e.target.value)}
              placeholder="Image URL (optional)"
              className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
            />
            <div>
              <p className="text-xs font-medium text-white/70">Attach Properties</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROPERTIES.map((p) => (
                  <button
                    key={p.slug}
                    onClick={() => setNewProps(toggleProperty(newProps, p.slug))}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      newProps.includes(p.slug)
                        ? "bg-bronze text-bronze-foreground"
                        : "border border-white/15 text-white/50 hover:bg-white/10"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void addLocation()}
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-bronze px-5 py-3 text-sm font-semibold text-bronze-foreground transition-transform active:scale-95 disabled:opacity-40"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add Location
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setNewTitle("");
                  setNewDesc("");
                  setNewImage("");
                  setNewProps([]);
                }}
                className="rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing locations */}
      {locations.map((loc) => {
        const isEditing = editingId === loc.id;
        return (
          <div
            key={loc.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]"
          >
            {!isEditing ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <GripVertical className="size-4 shrink-0 text-white/30" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">{loc.title}</p>
                  <p className="truncate text-xs text-white/50">
                    {loc.description || "No description"}
                    {loc.property_ids.length > 0 && ` · ${loc.property_ids.length} properties`}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(loc)}
                  className="rounded-lg border border-white/15 p-2 text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(loc)}
                  className="rounded-lg border border-red-500/30 p-2 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="border-t border-white/10 p-4">
                <div className="grid gap-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Location title"
                    className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                  />
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Short description"
                    className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                  />
                  <input
                    type="url"
                    value={editImage}
                    onChange={(e) => setEditImage(e.target.value)}
                    placeholder="Image URL (optional)"
                    className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-bronze/50"
                  />
                  <div>
                    <p className="text-xs font-medium text-white/70">Attached Properties</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {PROPERTIES.map((p) => (
                        <button
                          key={p.slug}
                          onClick={() => setEditProps(toggleProperty(editProps, p.slug))}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                            editProps.includes(p.slug)
                              ? "bg-bronze text-bronze-foreground"
                              : "border border-white/15 text-white/50 hover:bg-white/10"
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void saveEdit(loc.id)}
                      disabled={saving}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-bronze px-5 py-3 text-sm font-semibold text-bronze-foreground transition-transform active:scale-95 disabled:opacity-40"
                    >
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="rounded-full border border-white/20 px-5 py-3 text-sm font-medium text-white/70 hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {locations.length === 0 && !showForm && (
        <p className="py-6 text-center text-sm text-white/40">No locations yet</p>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-navy p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-center text-base font-semibold text-white">Delete this location?</h3>
            <p className="mt-1.5 text-center text-sm text-white/60">"{deleteTarget.title}" will be removed.</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 rounded-full border border-white/20 py-3 text-sm font-medium text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDelete()}
                className="flex-1 rounded-full bg-red-600 py-3 text-sm font-semibold text-white transition-transform active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

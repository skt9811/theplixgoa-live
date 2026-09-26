import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { COLOR_PALETTE, ICON_KEYS } from "@/lib/pms-categories";
import { pms } from "@/lib/pms-client";
import { CategoryBadge, iconFor } from "@/lib/pms-icons";
import { DARK } from "@/components/pms/expenses/tokens";
import { useBackDismiss } from "@/lib/pms-back-stack";

export function CategoryModal({ defaultType, onClose, onSaved }: { defaultType: "expense" | "income"; onClose: () => void; onSaved: () => void }) {
  useBackDismiss(true, onClose);
  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">(defaultType);
  const [icon, setIcon] = useState<string>(ICON_KEYS[0]);
  const [color, setColor] = useState<string>(COLOR_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter a category name");
    setSaving(true);
    try {
      await pms("categories", { method: "POST", body: JSON.stringify({ name, type, icon, color }) });
      toast.success("Category added");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save category");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className={`${DARK.card} ${DARK.border} max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 text-foreground sm:rounded-3xl`}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Category</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <CategoryBadge icon={icon} color={color} size="lg" />
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Category name" aria-label="Category name" className={`${DARK.input} flex-1`} autoFocus />
        </div>

        <div className="mt-4 flex gap-1 rounded-full bg-muted p-1">
          {(["expense", "income"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold capitalize ${type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">Icon</p>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {ICON_KEYS.map((key) => {
            const Icon = iconFor(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                aria-label={key}
                aria-pressed={icon === key}
                className={`flex size-11 items-center justify-center rounded-xl transition-colors ${icon === key ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
              >
                <Icon className="size-5" aria-hidden />
              </button>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">Colour</p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={`size-9 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-foreground" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-red-400">{error}</p>}
        <button type="submit" disabled={saving} className="mt-5 w-full rounded-full bg-emerald-500 py-3 font-semibold text-[#0B0F12] disabled:opacity-60">
          {saving ? "Saving..." : "Save Category"}
        </button>
      </form>
    </div>
  );
}

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { pms, type PmsCategory } from "@/lib/pms-client";
import { CategoryBadge } from "@/lib/pms-icons";
import { DARK } from "@/components/pms/expenses/tokens";

export function CategoriesTab({ categories, onAdd, onChanged }: { categories: PmsCategory[]; onAdd: (type: "expense" | "income") => void; onChanged: () => void }) {
  const [type, setType] = useState<"expense" | "income">("expense");
  const list = categories.filter((c) => c.type === type);

  async function remove(c: PmsCategory) {
    try {
      await pms(`categories?id=${c.id}`, { method: "DELETE" });
      toast.success(`Deleted "${c.name}"`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
        {(["expense", "income"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold capitalize ${type === t ? "bg-white/15 text-white" : "text-slate-400"}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {list.map((c) => (
          <div key={c.id} className={`${DARK.card} ${DARK.border} relative flex flex-col items-center gap-2 rounded-2xl px-3 py-4 text-center`}>
            <CategoryBadge icon={c.icon} color={c.color} size="lg" />
            <p className="text-sm font-medium leading-tight text-slate-100">{c.name}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{c.is_default ? "Default" : "Custom"}</p>
            {!c.is_default && (
              <button type="button" onClick={() => void remove(c)} aria-label={`Delete ${c.name}`} className="absolute right-2 top-2 rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-red-400">
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => onAdd(type)} className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 px-3 py-4 text-sm font-semibold text-emerald-400 hover:bg-white/5">
          <Plus className="size-6" aria-hidden />
          Add Category
        </button>
      </div>
    </div>
  );
}

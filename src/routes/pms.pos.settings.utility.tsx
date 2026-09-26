import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { posPost } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, PageTitle, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/utility")({ component: Utility });

function Row({ icon, title, sub, action, onClick, busy }: { icon: React.ReactNode; title: string; sub: string; action: string; onClick: () => void; busy?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">{icon}</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{title}</p><p className="text-[11px] text-slate-500">{sub}</p></div>
      <button type="button" disabled={busy} onClick={onClick} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">{action}</button>
    </div>
  );
}

function Utility() {
  const { state, property, propertyName, reload } = usePos();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function exportMenu() {
    if (!state) return;
    const data = {
      property, exportedAt: new Date().toISOString(),
      categories: state.categories.map((c) => ({ name: c.name, items: state.items.filter((i) => i.category_id === c.id).map((i) => ({ name: i.name, price: i.price, isVeg: i.is_veg, taxRate: i.tax_rate, brand: i.brand, printerDestination: i.printer_destination, stock: i.stock })) })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `pos-menu-${property}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importMenu(f: File) {
    setBusy(true);
    try {
      const parsed = JSON.parse(await f.text()) as { categories?: unknown };
      if (!Array.isArray(parsed.categories)) throw new Error("This file is not a POS menu export");
      const r = await posPost<{ count: number }>("menu-import", { property, categories: parsed.categories });
      toast.success(`Imported ${r.count} items`);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import that file");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Utility" />
      <div className="grid gap-2">
        <Row icon={<RefreshCw className="size-5" aria-hidden />} title="Refresh data" sub="Reload tables, menu and settings from the server" action="Refresh" onClick={() => void run(reload, "Data refreshed")} />
        <Row icon={<Trash2 className="size-5" aria-hidden />} title="Clear device cache" sub={`Forgets this device's saved station and reloads ${propertyName}`} action="Clear" onClick={() => { try { Object.keys(window.localStorage).filter((k) => k.startsWith("plix_pos_")).forEach((k) => window.localStorage.removeItem(k)); } catch { /* storage unavailable */ } void run(reload, "Device cache cleared"); }} />
        <Row icon={<Download className="size-5" aria-hidden />} title="Export menu" sub="Download categories and items as a JSON file" action="Export" onClick={exportMenu} />
        <Row icon={<Upload className="size-5" aria-hidden />} title="Import menu" sub="Add or update items from an exported JSON file" action="Choose file" busy={busy} onClick={() => file.current?.click()} />
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importMenu(f); }} />
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Import matches categories and items by name, so running it twice does not duplicate anything. Stock counts in the file are used only for new items.</p>
    </div>
  );
}

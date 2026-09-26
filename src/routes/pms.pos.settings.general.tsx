import { createFileRoute } from "@tanstack/react-router";
import { QrCode } from "lucide-react";
import { toast } from "sonner";
import { getStation, type PosGeneral } from "@/lib/pms-pos-client";
import { printersFor, toTransport, upiPayload } from "@/lib/pms-pos-printer";
import { printSlip } from "@/lib/pms-pos-print";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, SaveBar, Toggle, field, useConfigSave, useDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/general")({ component: General });

type BoolKey = { [K in keyof PosGeneral]: PosGeneral[K] extends boolean ? K : never }[keyof PosGeneral];
const PRINT: { key: BoolKey; label: string; hint?: string; off?: boolean }[] = [
  { key: "hideStoreName", label: "Hide store name", hint: "Leave the store name off bills" },
  { key: "printLogo", label: "Print logo", hint: "Logo printing is not available yet", off: true },
  { key: "printKotOnBillPrinter", label: "Print KOT on billing printer", hint: "Also send every KOT to the Bill printer" },
  { key: "defaultPrintKot", label: "Default print KOT", hint: "Off saves the KOT without printing" },
  { key: "printQr", label: "Print QR code", hint: "UPI payment QR on the bill (needs a UPI ID)" },
  { key: "printHsn", label: "Print HSN no.", hint: "Items have no HSN codes yet", off: true },
  { key: "printConfirmPopup", label: "Print confirmation popup", hint: "Ask before printing a KOT or bill" },
];
const OPS: typeof PRINT = [
  { key: "customerPhoneOptional", label: "Customer phone optional", hint: "Off requires a mobile number to bill" },
  { key: "allowEditAfterBilling", label: "Allow edit after billing", hint: "Not available yet", off: true },
  { key: "allowPaymentWithoutBilling", label: "Allow payment without billing", hint: "Not available yet", off: true },
  { key: "categoryAsMenu", label: "Category as menu", hint: "Not available yet", off: true },
  { key: "showTaxSeparately", label: "Show tax separately", hint: "SGST / CGST lines instead of one Tax line" },
  { key: "roundOff", label: "Auto round-off", hint: "Round bills to the nearest rupee when payment opens" },
];

function General() {
  const [d, setD] = useDraft((c) => c.general);
  const { save, saving } = useConfigSave();
  const { state, propertyName } = usePos();
  if (!d || !state) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  const set = (patch: Partial<PosGeneral>) => setD({ ...d, ...patch });
  const storeName = state.config.store?.store_name || propertyName;
  const payload = d.upiId.trim() ? upiPayload(d.upiId.trim(), storeName, 100) : "";

  async function testQr() {
    if (!payload) {
      toast.error("Enter a UPI ID first");
      return;
    }
    const printers = printersFor({ ...state!.config, general: d! }, "bill", getStation());
    const lines = [{ text: storeName.toUpperCase(), align: "center" as const, bold: true }, { text: "UPI QR TEST (Rs.100.00)", align: "center" as const }, { text: "", qr: payload, align: "center" as const }, { text: "" }];
    toast((await printSlip(lines, toTransport(printers[0], d!.leftMargin))).message);
  }
  const list = (items: typeof PRINT) => items.map((t) => <Toggle key={t.key} label={t.label} {...(t.hint ? { hint: t.hint } : {})} checked={d[t.key]} onChange={(v) => !t.off && set({ [t.key]: v } as Partial<PosGeneral>)} />);

  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="General Setup" />
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Printing</p>
      <div className="grid gap-2">{list(PRINT)}</div>

      <p className="mb-1.5 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">UPI QR</p>
      <Labeled label="UPI ID"><input className={field} value={d.upiId} onChange={(e) => set({ upiId: e.target.value.trim() })} placeholder="name@bank" autoCapitalize="none" /></Labeled>
      {payload && <p className="mt-1.5 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-500">{payload}</p>}
      <p className="mt-1 text-[11px] text-slate-400">The bill&apos;s QR uses the bill total as the amount. It is printed with the printer&apos;s built-in QR command; some very basic printers ignore it.</p>
      <button type="button" onClick={() => void testQr()} className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><QrCode className="size-4" aria-hidden /> Print test QR</button>

      <p className="mb-1.5 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Receipt text</p>
      <div className="grid gap-3">
        <Labeled label="Header"><textarea rows={2} className={field} value={d.header} onChange={(e) => set({ header: e.target.value })} placeholder="Printed under the store name" /></Labeled>
        <Labeled label="Footer"><textarea rows={2} className={field} value={d.footer} onChange={(e) => set({ footer: e.target.value })} /></Labeled>
        <Labeled label="Left margin (points)"><input className={field} type="number" min={0} max={20} value={d.leftMargin} onChange={(e) => set({ leftMargin: Math.max(0, Number(e.target.value) || 0) })} /></Labeled>
      </div>

      <p className="mb-1.5 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Operations</p>
      <div className="grid gap-2">{list(OPS)}</div>
      <SaveBar onSave={() => void save("general", { values: d }, "General settings saved")} saving={saving} />
    </div>
  );
}

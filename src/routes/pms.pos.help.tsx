import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pms/pos/help")({ component: Help });

const STEPS: [string, string][] = [
  ["Take an order", "Open Dine-in, tap an empty table, add items from the menu and tap Next. Use the pencil on an item for kitchen notes."],
  ["Save vs KOT", "Save keeps the order on the table without printing. KOT sends the new items to the kitchen printer and locks them; later changes to a sent item are done by voiding it."],
  ["Settle a bill", "Tap Settle in the order review, or Payment in a table's 3-dot menu. Cash, UPI, Card and Loyalty need the received amount. Account posts the bill to an in-house guest's draft invoice."],
  ["Move things around", "The 3-dot menu on a running table moves, merges or splits the order, moves a whole KOT, or transfers single dishes to another running table."],
  ["Printing", "Set up the printer under Manage, KOT Print Setup. Bluetooth printers connect from Chrome; on the Android app the slip is handed to the RawBT app. If nothing can print, the slip is shown on screen."],
  ["Menu and tables", "Managers and admins edit items, categories and tables under Manage. Prices and GST (5% by default) are set per item."],
];

function Help() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-lg font-bold text-slate-900">Help</h1>
      <div className="mt-3 grid gap-3">
        {STEPS.map(([t, d]) => (
          <div key={t} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-bold text-slate-900">{t}</p>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

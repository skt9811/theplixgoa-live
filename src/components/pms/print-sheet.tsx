import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Printer, X } from "lucide-react";
import { useBackDismiss } from "@/lib/pms-back-stack";
import { isNativeApp, saveAndSharePdf } from "@/lib/pms-native-file";

// The sheet is portalled straight into <body> so the print rules below can
// hide every other body child (the whole PMS app, toasts, scripts' output)
// and print only this document, at natural height across pages.
const PRINT_CSS = `
@media print {
  body > *:not(.pms-print-portal) { display: none !important; }
  .pms-print-portal { position: static !important; display: block !important; background: none !important; padding: 0 !important; overflow: visible !important; }
  .pms-print-card { max-width: none !important; box-shadow: none !important; border-radius: 0 !important; }
  .pms-no-print { display: none !important; }
  .pms-print-area { padding: 0 !important; }
  .pms-avoid-break, tr { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  html, body { background: #fff !important; }
  @page { size: A4; margin: 12mm; }
}`;

export function PrintSheet({
  title,
  docTitle,
  pdfHref,
  onClose,
  actions,
  children,
}: {
  title: string;
  docTitle: string;
  /** A same-origin PDF endpoint for this document, when one exists (see stay-voucher-modal.tsx). On the Android app, "Print / Save PDF" fetches this and hands it to the OS instead of calling window.print(), which does nothing there. Documents with no server PDF (e.g. the tax invoice) fall back to a native-aware notice instead of silently no-op'ing. */
  pdfHref?: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useBackDismiss(true, onClose);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function print() {
    if (isNativeApp()) {
      if (!pdfHref) {
        toast.error("Printing isn't available for this document in the app yet. Open theplixgoa.com/pms in your phone's browser to print it.");
        return;
      }
      try {
        await saveAndSharePdf(pdfHref, `${docTitle}.pdf`, title);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save the PDF");
      }
      return;
    }
    // The browser uses the page title as the default PDF file name.
    const previous = document.title;
    document.title = docTitle;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  return createPortal(
    <div className="pms-print-portal fixed inset-0 z-[80] overflow-y-auto bg-black/50 sm:p-6" onClick={onClose}>
      <style>{PRINT_CSS}</style>
      <div className="pms-print-card mx-auto w-full max-w-3xl bg-white text-slate-900 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="pms-no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white p-3 sm:rounded-t-2xl">
          <p className="font-bold">{title}</p>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={print}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Printer className="size-4" aria-hidden /> Print / Save PDF
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="pms-print-area pms-paper p-5 sm:p-8">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

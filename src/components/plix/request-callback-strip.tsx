import { useState } from "react";
import { CircleCheck, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SITE_PHONE_1 } from "@/lib/seo";

const TIMES = ["Any time", "Morning (9 AM – 12 PM)", "Afternoon (12 – 4 PM)", "Evening (4 – 8 PM)"];
const emptyForm = { name: "", phone: "", preferredTime: TIMES[0]!, note: "" };

// Strip under the homepage search bar: "we're here to help" + a callback form.
export function RequestCallbackStrip() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/40";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/callback-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await res.json()) as { success: boolean; reason?: string };
      if (result.success) {
        setSent(true);
        setForm(emptyForm);
      } else {
        toast.error(result.reason ?? "Could not send your request. Please try again.");
      }
    } catch {
      toast.error(`Could not send your request. Please call us on ${SITE_PHONE_1}.`);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="mt-3 flex flex-col items-start justify-between gap-2 rounded-2xl bg-gradient-to-r from-[#fbf3ea] to-[#f6e3e0] px-5 py-3.5 shadow-soft sm:flex-row sm:items-center">
        <p className="text-sm text-navy">Finding your ideal vacation spot should be easy, we're here to help!</p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setOpen(true);
          }}
          className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-primary underline underline-offset-4 hover:opacity-80"
        >
          <PhoneCall className="size-4" aria-hidden />
          Request Callback
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-normal text-navy">Request a callback</DialogTitle>
            <DialogDescription>Leave your number and our team will call you to help plan your stay.</DialogDescription>
          </DialogHeader>
          {sent ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>Thanks! Our team will call you back shortly.</p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4">
              <label className="block text-sm font-medium">
                Your name *
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} autoComplete="name" />
              </label>
              <label className="block text-sm font-medium">
                Phone number *
                <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} placeholder="+91 98765 43210" autoComplete="tel" />
              </label>
              <label className="block text-sm font-medium">
                Best time to call
                <select value={form.preferredTime} onChange={(e) => setForm({ ...form, preferredTime: e.target.value })} className={input}>
                  {TIMES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Anything we should know?
                <textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} placeholder="Dates, group size, preferred area…" />
              </label>
              <button
                type="submit"
                disabled={sending}
                className="rounded-full bg-navy px-6 py-3 text-sm font-semibold text-navy-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-60"
              >
                {sending ? "Sending…" : "Call me back"}
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

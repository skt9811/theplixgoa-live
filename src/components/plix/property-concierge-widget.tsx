import { useEffect, useState, type ComponentType, type FormEvent } from "react";
import {
  CalendarCheck,
  ChevronUp,
  Compass,
  MessageCircleQuestion,
  Mic,
  PawPrint,
  ScrollText,
  Send,
  Sofa,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { SITE_PHONE_1 } from "@/lib/seo";

type Props = { propertyName: string };

// PropertySubNav dispatches this when its "FAQ's" tab is clicked, so that
// click can both open this widget and (separately, in PropertySubNav itself)
// scroll to the on-page FAQ section — a plain window CustomEvent rather than
// prop-drilling/lifted state, matching the "plix-data-change" event this
// codebase already uses for the same kind of decoupled cross-component signal.
export const OPEN_CONCIERGE_EVENT = "plix-open-concierge";

// Matches the "lg" breakpoint the rest of this page already switches its
// layout on (e.g. the lg:col-span-8/4 split) — desktop gets the card
// expanded on landing per the design; mobile stays collapsed since an
// expanded card would cover most of a phone screen.
const DESKTOP_QUERY = "(min-width: 1024px)";

type QuickAction = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
};

// Same scrollIntoView pattern PropertySubNav and PropertyCheckinRulesCard
// already use for in-page navigation — kept consistent rather than adding a
// second way of doing the same thing.
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Minimal shape for the (non-standard, vendor-prefixed) Web Speech API —
// there's no lib.dom.d.ts type for this, and only Chromium browsers support
// it at all, hence the runtime feature-detection below rather than assuming
// it exists.
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionLike = {
  lang: string;
  onresult: ((event: { results: { 0: { 0: SpeechRecognitionResultLike } } }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

export function PropertyConciergeWidget({ propertyName }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [listening, setListening] = useState(false);

  // Auto-open on desktop landing. Starts closed (matching SSR, which has no
  // window to check) and flips open on mount if the viewport is desktop-
  // width — a normal post-hydration state update, not a hydration mismatch.
  useEffect(() => {
    if (window.matchMedia(DESKTOP_QUERY).matches) setOpen(true);
  }, []);

  // The property sub-nav's "FAQ's" tab fires this to open the card directly,
  // in addition to its own scroll to the on-page FAQ section.
  useEffect(() => {
    function handleOpenRequest() {
      setOpen(true);
    }
    window.addEventListener(OPEN_CONCIERGE_EVENT, handleOpenRequest);
    return () => window.removeEventListener(OPEN_CONCIERGE_EVENT, handleOpenRequest);
  }, []);

  const whatsappNumber = SITE_PHONE_1.replace(/\D/g, "");

  function openEnquiry(message: string) {
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  const actions: QuickAction[] = [
    { label: "View amenities", icon: Sparkles, onSelect: () => { scrollToSection("amenities"); setOpen(false); } },
    { label: "View spaces", icon: Sofa, onSelect: () => { scrollToSection("spaces"); setOpen(false); } },
    { label: "Explore dining", icon: UtensilsCrossed, onSelect: () => { scrollToSection("meals"); setOpen(false); } },
    { label: "Are pets allowed?", icon: PawPrint, onSelect: () => { scrollToSection("faqs"); setOpen(false); } },
    { label: "What's nearby?", icon: Compass, onSelect: () => { scrollToSection("experiences"); setOpen(false); } },
    { label: "House Rules", icon: ScrollText, onSelect: () => { scrollToSection("house-rules"); setOpen(false); } },
    { label: "Check availability and pricing", icon: CalendarCheck, onSelect: () => { scrollToSection("book"); setOpen(false); } },
    {
      label: "Make an Enquiry",
      icon: MessageCircleQuestion,
      onSelect: () => { openEnquiry(`Hi! I have a question about ${propertyName}.`); setOpen(false); },
    },
  ];

  function handleAsk(e: FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    openEnquiry(`Hi! Regarding ${propertyName}: ${trimmed}`);
    setQuestion("");
    setOpen(false);
  }

  function handleMicClick() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      toast.error("Voice input isn't supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-IN";
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuestion((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
      toast.error("Couldn't hear that — please try again or type your question.");
    };
    recognition.start();
  }

  return (
    // Lower-right per the reference design, z-50. Sits at bottom-36 rather
    // than the site-wide WhatsApp pill + back-to-top stack's own bottom-6 —
    // that stack (site-footer.tsx) already had one real overlap bug fixed
    // here before; bottom-36 clears its full height (pill + gap + back-to-
    // top button, ~144px) with room to spare instead of recreating it.
    <div className="fixed bottom-36 right-6 z-50">
      {open && (
        <div className="animate-rise mb-3 w-[calc(100vw-3rem)] max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
          <div className="flex items-start justify-between gap-3 bg-navy px-5 py-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-bronze">
                Your private concierge
              </p>
              <p className="mt-1 text-sm leading-snug text-navy-foreground/85">
                At your service, throughout your stay.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close concierge"
              className="shrink-0 rounded-full p-1 text-navy-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="max-h-[45vh] overflow-y-auto p-2">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onSelect}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
              >
                <action.icon className="size-4 shrink-0 text-primary" aria-hidden />
                {action.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleAsk} className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about this villa..."
              className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
            />
            <button
              type="button"
              aria-label="Ask by voice"
              onClick={handleMicClick}
              className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                listening ? "bg-red-100 text-red-600" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Mic className="size-4" aria-hidden />
            </button>
            <button
              type="submit"
              aria-label="Send"
              disabled={!question.trim()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-emerald text-primary-foreground disabled:opacity-50"
            >
              <Send className="size-4" aria-hidden />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-navy-foreground shadow-lg transition-transform hover:scale-105"
      >
        {open ? <ChevronUp className="size-4" aria-hidden /> : <MessageCircleQuestion className="size-4" aria-hidden />}
        Concierge
      </button>
    </div>
  );
}

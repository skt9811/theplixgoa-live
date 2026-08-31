import { useState, type ComponentType, type FormEvent } from "react";
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
    <div className="fixed bottom-6 left-6 z-40">
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

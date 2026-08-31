import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Languages, Mic, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { conciergeChatServerFn, type ConciergeCard } from "@/lib/concierge-chat.server-fn";

type Props = { propertyName: string; propertySlug: string };

type ConciergeMessage = {
  role: "user" | "assistant";
  content: string;
  cards?: ConciergeCard[];
};

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

// Same scrollIntoView pattern PropertySubNav and PropertyCheckinRulesCard
// already use for in-page navigation.
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

type Lang = "en" | "hi";

// The Language control switches this widget's own chrome (labels, chip
// text, placeholder) between English and Hindi. It does NOT translate the
// assistant's actual answers — those come from conciergeChatServerFn's
// rule-based matcher, which only understands English property data and
// English question phrasing. A full bilingual answer engine is out of
// scope here; this toggle is honest about covering UI text only.
const UI_STRINGS: Record<Lang, {
  subtitle: string;
  placeholder: string;
  greeting: (name: string) => string;
  reset: string;
  close: string;
  language: string;
  typing: string;
  chips: { nearby: string; rules: string; pricing: string; enquiry: string; maps: string };
}> = {
  en: {
    subtitle: "Your Personal Villa Concierge",
    placeholder: "Ask about this villa...",
    greeting: (name) =>
      `Hi! I'm Plix AI, here to help with anything about ${name}. Ask me about house rules, pricing, what's nearby, or tap a quick option below.`,
    reset: "Reset chat",
    close: "Close concierge",
    language: "Switch to Hindi",
    typing: "Plix AI is typing…",
    chips: {
      nearby: "What's nearby?",
      rules: "House Rules",
      pricing: "Check availability and pricing",
      enquiry: "Make an Enquiry",
      maps: "View on Google Maps",
    },
  },
  hi: {
    subtitle: "आपका निजी विला कंसीयज",
    placeholder: "इस विला के बारे में पूछें...",
    greeting: (name) =>
      `नमस्ते! मैं Plix AI हूं, ${name} के बारे में किसी भी सवाल में मदद के लिए यहां हूं। हाउस रूल्स, कीमत, या आस-पास की जगहों के बारे में पूछें।`,
    reset: "चैट रीसेट करें",
    close: "कंसीयज बंद करें",
    language: "Switch to English",
    typing: "Plix AI लिख रहा है…",
    chips: {
      nearby: "आस-पास क्या है?",
      rules: "हाउस रूल्स",
      pricing: "उपलब्धता और कीमत देखें",
      enquiry: "पूछताछ करें",
      maps: "गूगल मैप्स पर देखें",
    },
  },
};

// The chip's displayed label follows the language toggle; the query actually
// sent to the server is always this fixed English text, matching what
// concierge-chat.server-fn.ts's keyword patterns understand.
const CHIP_QUERIES = {
  nearby: "What's nearby?",
  rules: "What are the house rules?",
  pricing: "What's the availability and pricing?",
  enquiry: "I'd like to make an enquiry.",
  maps: "Show me on Google Maps.",
} as const;

function ConciergeCardView({ card }: { card: ConciergeCard }) {
  const [activeTab, setActiveTab] = useState(0);
  const bullets = card.tabs ? card.tabs[activeTab]?.bullets : card.bullets;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-border bg-background">
      <p className="border-b border-border px-3 py-2 text-xs font-semibold text-navy">{card.title}</p>

      {card.tabs && (
        <div className="flex gap-1 border-b border-border px-2 pt-2">
          {card.tabs.map((tab, i) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => setActiveTab(i)}
              className={`rounded-t-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === i ? "bg-accent text-navy" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {bullets && bullets.length > 0 && (
        <ul className="space-y-1.5 p-3 text-xs leading-relaxed text-muted-foreground">
          {bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="shrink-0 text-primary">•</span>
              {b}
            </li>
          ))}
        </ul>
      )}

      {card.link && (
        <a
          href={card.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="block border-t border-border px-3 py-2.5 text-center text-xs font-semibold text-primary hover:bg-accent"
        >
          {card.link.label}
        </a>
      )}

      {card.action && (
        <button
          type="button"
          onClick={() => scrollToSection(card.action!.sectionId)}
          className="block w-full border-t border-border px-3 py-2.5 text-center text-xs font-semibold text-primary hover:bg-accent"
        >
          {card.action.label}
        </button>
      )}
    </div>
  );
}

export function PropertyConciergeWidget({ propertyName, propertySlug }: Props) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [messages, setMessages] = useState<ConciergeMessage[]>(() => [
    { role: "assistant", content: UI_STRINGS.en.greeting(propertyName) },
  ]);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const t = UI_STRINGS[lang];

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

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  function handleReset() {
    setMessages([{ role: "assistant", content: t.greeting(propertyName) }]);
    setInput("");
  }

  function handleLanguageToggle() {
    setLang((prev) => (prev === "en" ? "hi" : "en"));
  }

  async function sendMessage(displayText: string, serverQuery?: string) {
    const trimmed = displayText.trim();
    if (!trimmed || sending) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setSending(true);
    try {
      const result = await conciergeChatServerFn({
        data: { property_slug: propertySlug, message: serverQuery ?? trimmed },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: result.content, cards: result.cards }]);
    } catch (err) {
      console.error("[PropertyConciergeWidget] chat request failed:", err instanceof Error ? err.message : err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong on our end — try again, or tap Make an Enquiry to reach our team directly." },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleChipClick(key: keyof typeof CHIP_QUERIES) {
    void sendMessage(t.chips[key], CHIP_QUERIES[key]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
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
    recognition.lang = lang === "hi" ? "hi-IN" : "en-IN";
    setListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      setListening(false);
    };
    recognition.onerror = () => {
      setListening(false);
      toast.error("Couldn't hear that — please try again or type your question.");
    };
    recognition.start();
  }

  // Collapsed trigger and expanded card occupy the exact same fixed slot —
  // right above the WhatsApp button (site-footer.tsx's pill sits at
  // bottom-6; bottom-20 clears it) — rendered mutually exclusively rather
  // than stacked, so there's never a second control floating below the open
  // card.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="fixed bottom-20 right-6 z-50 flex items-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-navy-foreground shadow-2xl transition-transform hover:scale-105"
      >
        <Bot className="size-4" aria-hidden />
        Plix AI
      </button>
    );
  }

  return (
    <div className="animate-rise fixed bottom-20 right-6 z-50 flex w-84 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between gap-2 bg-navy px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bronze/20 text-bronze">
            <Bot className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight text-white">Plix AI</p>
            <p className="mt-0.5 text-[11px] leading-snug text-navy-foreground/75">{t.subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={handleLanguageToggle}
            aria-label={t.language}
            title={t.language}
            className="rounded-full p-1.5 text-navy-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Languages className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleReset}
            aria-label={t.reset}
            title={t.reset}
            className="rounded-full p-1.5 text-navy-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t.close}
            title={t.close}
            className="rounded-full p-1.5 text-navy-foreground/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-muted/40 px-3 py-2.5">
        {(Object.keys(CHIP_QUERIES) as (keyof typeof CHIP_QUERIES)[]).map((key) => (
          <button
            key={key}
            type="button"
            disabled={sending}
            onClick={() => handleChipClick(key)}
            className="shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {t.chips[key]}
          </button>
        ))}
      </div>

      <div className="flex max-h-[380px] min-h-[220px] flex-col gap-3 overflow-y-auto p-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user" ? "bg-gradient-emerald text-primary-foreground" : "bg-muted text-foreground"
              }`}
            >
              <p>{msg.content}</p>
              {msg.cards?.map((card, ci) => <ConciergeCardView key={ci} card={card} />)}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">{t.typing}</div>
          </div>
        )}
        <div ref={streamEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t.placeholder}
          disabled={sending}
          className="min-w-0 flex-1 rounded-full border border-input bg-background px-4 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
        />
        <button
          type="button"
          aria-label="Ask by voice"
          onClick={handleMicClick}
          disabled={sending}
          className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${
            listening ? "bg-red-100 text-red-600" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          } disabled:opacity-50`}
        >
          <Mic className="size-4" aria-hidden />
        </button>
        <button
          type="submit"
          aria-label="Send"
          disabled={!input.trim() || sending}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-emerald text-primary-foreground disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BedDouble, Lock, Loader as Loader2, Save, Clock as Unlock, CalendarDays, FileText } from "lucide-react";
import { PROPERTIES, formatINR, todayISO } from "@/lib/plix";
import { supabase } from "@/lib/rates";
import { BlogManager } from "@/components/plix/blog-manager";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Plix Hospitality" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type DayCell = {
  date: string;
  rate: number | null;
  isCustom: boolean;
  isBlocked: boolean;
};

type RatesMap = Record<string, number>;
type BlockedMap = Record<string, boolean>;

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  function checkPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pinInput) return;

    const envPin = import.meta.env.VITE_ADMIN_PIN;
    const fallbackPin = "1234";
    const validPin = envPin || fallbackPin;

    if (pinInput === validPin) {
      setAuthed(true);
      setPinError("");
    } else {
      setPinError("Incorrect PIN. Please try again.");
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4">
        <div className="w-full rounded-3xl border border-border bg-card p-8 shadow-lift">
          <div className="flex flex-col items-center text-center">
            <img
              src="/Plix_Transparent_(1).png"
              alt="Plix Hospitality"
              className="h-12 w-auto object-contain"
            />
            <div className="mt-4 flex size-14 items-center justify-center rounded-2xl bg-navy/5">
              <Lock className="size-7 text-navy" aria-hidden />
            </div>
            <h1 className="mt-4 text-2xl font-semibold text-navy">Admin Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your PIN to manage rates and availability.
            </p>
          </div>
          <form onSubmit={checkPin} className="mt-6 grid gap-4">
            <input
              type="password"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter admin PIN"
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40 min-h-[44px]"
            />
            {pinError && <p className="text-xs text-red-600">{pinError}</p>}
            <button
              type="submit"
              className="w-full rounded-full bg-gradient-emerald px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] min-h-[44px]"
            >
              Unlock Dashboard
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-muted-foreground hover:text-primary">
              Back to website
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [tab, setTab] = useState<"rates" | "blogs">("rates");
  const [selectedPropertyId, setSelectedPropertyId] = useState(PROPERTIES[0].id);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [ratesMap, setRatesMap] = useState<RatesMap>({});
  const [blockedMap, setBlockedMap] = useState<BlockedMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedRange, setSelectedRange] = useState<string[]>([]);
  const [rateInput, setRateInput] = useState("");
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);

  const selectedProperty = PROPERTIES.find((p) => p.id === selectedPropertyId)!;

  const monthStart = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1),
    [currentMonth],
  );
  const monthEnd = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0),
    [currentMonth],
  );
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const monthEndStr = monthEnd.toISOString().slice(0, 10);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ratesRes, blockedRes] = await Promise.all([
      supabase
        .from("property_rates")
        .select("date, rate")
        .eq("property_id", selectedPropertyId)
        .gte("date", monthStartStr)
        .lte("date", monthEndStr),
      supabase
        .from("blocked_dates")
        .select("date")
        .eq("property_id", selectedPropertyId)
        .gte("date", monthStartStr)
        .lte("date", monthEndStr),
    ]);

    const rMap: RatesMap = {};
    if (ratesRes.data) {
      for (const r of ratesRes.data) {
        rMap[r.date] = Number(r.rate);
      }
    }
    setRatesMap(rMap);

    const bMap: BlockedMap = {};
    if (blockedRes.data) {
      for (const b of blockedRes.data) {
        bMap[b.date] = true;
      }
    }
    setBlockedMap(bMap);
    setLoading(false);
  }, [selectedPropertyId, monthStartStr, monthEndStr]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: (DayCell | null)[] = [];
    for (let i = 0; i < startWeekday; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d)
        .toISOString()
        .slice(0, 10);
      const customRate = ratesMap[dateStr];
      days.push({
        date: dateStr,
        rate: customRate ?? null,
        isCustom: customRate !== undefined,
        isBlocked: blockedMap[dateStr] ?? false,
      });
    }
    return days;
  }, [currentMonth, ratesMap, blockedMap]);

  function handleDayClick(date: string, e: React.MouseEvent) {
    if ((e.target as HTMLElement).dataset.action === "block") {
      void toggleBlock(date);
      return;
    }

    if (rangeMode) {
      if (!rangeStart) {
        setRangeStart(date);
        setSelectedRange([date]);
      } else {
        const start = rangeStart < date ? rangeStart : date;
        const end = rangeStart < date ? date : rangeStart;
        const range: string[] = [];
        const cursor = new Date(start);
        while (cursor.toISOString().slice(0, 10) <= end) {
          range.push(cursor.toISOString().slice(0, 10));
          cursor.setDate(cursor.getDate() + 1);
        }
        setSelectedRange(range);
        setRangeStart(null);
      }
    } else {
      setSelectedRange([date]);
      const existing = ratesMap[date];
      setRateInput(existing ? String(existing) : String(selectedProperty.base_price));
    }
  }

  async function toggleBlock(date: string) {
    if (blockedMap[date]) {
      const { error } = await supabase
        .from("blocked_dates")
        .delete()
        .eq("property_id", selectedPropertyId)
        .eq("date", date);
      if (error) {
        toast.error("Failed to unblock date");
        return;
      }
      setBlockedMap((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
      toast.success(`Unblocked ${date}`);
    } else {
      const { error } = await supabase
        .from("blocked_dates")
        .insert({ property_id: selectedPropertyId, date });
      if (error) {
        toast.error("Failed to block date");
        return;
      }
      setBlockedMap((prev) => ({ ...prev, [date]: true }));
      toast.success(`Blocked ${date}`);
    }
  }

  async function saveRates() {
    if (!rateInput || selectedRange.length === 0) return;
    const rate = Number(rateInput);
    if (Number.isNaN(rate) || rate <= 0) {
      toast.error("Please enter a valid rate");
      return;
    }

    setSaving(true);
    const rows = selectedRange.map((date) => ({
      property_id: selectedPropertyId,
      date,
      rate,
    }));

    const { error } = await supabase
      .from("property_rates")
      .upsert(rows, { onConflict: "property_id,date" });

    setSaving(false);
    if (error) {
      toast.error("Failed to save rates");
      return;
    }

    setRatesMap((prev) => {
      const next = { ...prev };
      for (const date of selectedRange) {
        next[date] = rate;
      }
      return next;
    });
    toast.success(`Updated ${selectedRange.length} date${selectedRange.length > 1 ? "s" : ""} to ${formatINR(rate)}/night`);
    setSelectedRange([]);
    setRateInput("");
  }

  async function resetRates() {
    if (selectedRange.length === 0) return;
    setSaving(true);
    const { error } = await supabase
      .from("property_rates")
      .delete()
      .eq("property_id", selectedPropertyId)
      .in("date", selectedRange);
    setSaving(false);
    if (error) {
      toast.error("Failed to reset rates");
      return;
    }
    setRatesMap((prev) => {
      const next = { ...prev };
      for (const date of selectedRange) {
        delete next[date];
      }
      return next;
    });
    toast.success(`Reset ${selectedRange.length} date${selectedRange.length > 1 ? "s" : ""} to default`);
    setSelectedRange([]);
  }

  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-navy md:text-3xl">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage nightly rates, block unavailable dates, and publish blog posts.
          </p>
        </div>
        <Link
          to="/"
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent"
        >
          Back to site
        </Link>
      </div>

      {/* Tab navigation */}
      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setTab("rates")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            tab === "rates"
              ? "bg-navy text-navy-foreground"
              : "border border-border bg-card text-foreground/80 hover:bg-accent"
          }`}
        >
          <CalendarDays className="size-4" />
          Rates & Availability
        </button>
        <button
          onClick={() => setTab("blogs")}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            tab === "blogs"
              ? "bg-navy text-navy-foreground"
              : "border border-border bg-card text-foreground/80 hover:bg-accent"
          }`}
        >
          <FileText className="size-4" />
          Blog Posts
        </button>
      </div>

      {tab === "blogs" ? (
        <BlogManager />
      ) : (
        <>

      <div className="mt-6 flex flex-wrap gap-2">
        {PROPERTIES.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              setSelectedPropertyId(p.id);
              setSelectedRange([]);
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selectedPropertyId === p.id
                ? "bg-navy text-navy-foreground"
                : "border border-border bg-card text-foreground/80 hover:bg-accent"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <BedDouble className="size-4 text-primary" aria-hidden />
          <span className="font-medium text-navy">{selectedProperty.name}</span>
          <span className="text-muted-foreground">· Default {formatINR(selectedProperty.base_price)}/night</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={rangeMode}
            onChange={(e) => {
              setRangeMode(e.target.checked);
              setSelectedRange([]);
              setRangeStart(null);
            }}
            className="size-4 rounded border-input"
          />
          <span className="text-muted-foreground">Range select mode</span>
        </label>
      </div>

      {/* Calendar */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-soft md:p-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="rounded-lg p-2 hover:bg-accent"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h2 className="text-lg font-semibold text-navy">{monthName}</h2>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="rounded-lg p-2 hover:bg-accent"
          >
            <ArrowRight className="size-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Weekday headers */}
            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground">
              {weekdays.map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, i) => {
                if (!cell) {
                  return <div key={`empty-${i}`} className="aspect-square" />;
                }
                const isSelected = selectedRange.includes(cell.date);
                const today = todayISO();
                const isPast = cell.date < today;

                return (
                  <div
                    key={cell.date}
                    onClick={(e) => !isPast && handleDayClick(cell.date, e)}
                    className={`group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border text-xs transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : cell.isBlocked
                          ? "border-red-300 bg-red-50"
                          : cell.isCustom
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-background hover:border-primary/30"
                    } ${isPast ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <span className={`font-medium ${cell.isBlocked ? "text-red-700" : "text-navy"}`}>
                      {Number(cell.date.slice(8))}
                    </span>
                    {cell.isBlocked ? (
                      <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-red-600">
                        <Lock className="size-2.5" /> Blocked
                      </span>
                    ) : cell.isCustom ? (
                      <span className="mt-0.5 text-[10px] text-primary">
                        {formatINR(cell.rate ?? 0)}
                      </span>
                    ) : (
                      <span className="mt-0.5 text-[10px] text-muted-foreground">
                        {formatINR(selectedProperty.base_price)}
                      </span>
                    )}
                    {!isPast && (
                      <button
                        data-action="block"
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleBlock(cell.date);
                        }}
                        className="absolute right-0.5 top-0.5 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                        title={cell.isBlocked ? "Unblock" : "Block date"}
                      >
                        {cell.isBlocked ? <Unlock className="size-3" /> : <Lock className="size-3" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded border border-primary/40 bg-primary/5" /> Custom rate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded border border-red-300 bg-red-50" /> Blocked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded border border-primary bg-primary/10" /> Selected
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded border border-border bg-background" /> Default rate
              </span>
            </div>
          </>
        )}
      </div>

      {/* Rate editor panel */}
      {selectedRange.length > 0 && !loading && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h3 className="text-sm font-semibold text-navy">
            {selectedRange.length === 1
              ? `Editing ${selectedRange[0]}`
              : `Editing ${selectedRange.length} dates (${selectedRange[0]} → ${selectedRange[selectedRange.length - 1]})`}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Nightly rate (₹):</label>
              <input
                type="number"
                min={0}
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                className="w-32 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                placeholder={String(selectedProperty.base_price)}
              />
            </div>
            <button
              onClick={saveRates}
              disabled={saving || !rateInput}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-emerald px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Rate
            </button>
            <button
              onClick={resetRates}
              disabled={saving}
              className="rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground/80 hover:bg-accent"
            >
              Reset to Default
            </button>
            <button
              onClick={() => {
                const allBlocked = selectedRange.every((d) => blockedMap[d]);
                if (allBlocked) {
                  selectedRange.forEach((d) => void toggleBlock(d));
                } else {
                  selectedRange.forEach((d) => {
                    if (!blockedMap[d]) void toggleBlock(d);
                  });
                }
              }}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              <Lock className="size-4" />
              {selectedRange.every((d) => blockedMap[d]) ? "Unblock All" : "Block All"}
            </button>
            <button
              onClick={() => {
                setSelectedRange([]);
                setRateInput("");
              }}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

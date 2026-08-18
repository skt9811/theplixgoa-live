import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  FileText,
  Lock,
  Loader as Loader2,
  Save,
  X,
} from "lucide-react";
import { PROPERTIES, formatINR, todayISO } from "@/lib/plix";
import {
  saveRateOverrides,
  deleteRateOverrides,
  toggleBlockedDate,
} from "@/lib/rates";
import { MinimalBlogPublisher } from "@/components/plix/minimal-blog-publisher";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — The Plix Goa" },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#1a2a1a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  function checkPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pinInput) return;
    const envPin = import.meta.env.VITE_ADMIN_PIN;
    const validPin = envPin || "1234";
    if (pinInput === validPin) {
      setAuthed(true);
      setPinError("");
    } else {
      setPinError("Incorrect PIN");
    }
  }

  if (!authed) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-navy px-4 py-10">
        <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-white/[0.06] p-7 backdrop-blur-xl">
          <div className="flex flex-col items-center text-center">
            <img
              src="/Plix_Transparent_(1).png"
              alt="The Plix Goa"
              className="h-14 w-auto object-contain"
            />
            <div className="mt-5 flex size-12 items-center justify-center rounded-2xl bg-white/10">
              <Lock className="size-6 text-bronze" aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-white">Admin Access</h1>
            <p className="mt-1.5 text-sm text-white/60">
              Enter your PIN to continue
            </p>
          </div>
          <form onSubmit={checkPin} className="mt-6 grid gap-4">
            <input
              type="password"
              autoFocus
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3.5 text-center text-lg tracking-[0.5em] text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
            />
            {pinError && <p className="text-center text-xs text-red-400">{pinError}</p>}
            <button
              type="submit"
              className="w-full rounded-full bg-bronze px-6 py-3.5 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform active:scale-95"
            >
              Unlock
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-white/50 hover:text-white/80">
              Back to website
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}

type RatesMap = Record<string, number>;
type BlockedMap = Record<string, boolean>;

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

  // Bulk update state
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [bulkRate, setBulkRate] = useState("");
  const [bulkBlock, setBulkBlock] = useState(false);

  const selectedProperty = PROPERTIES.find((p) => p.id === selectedPropertyId)!;

  const monthStartStr = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().slice(0, 10),
    [currentMonth],
  );
  const monthEndStr = useMemo(
    () => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().slice(0, 10),
    [currentMonth],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const raw = localStorage.getItem("plix_rates_data");
      const rMap: RatesMap = {};
      const bMap: BlockedMap = {};
      if (raw) {
        const local = JSON.parse(raw);
        const localRates = local.rates?.[selectedPropertyId] ?? {};
        for (const [date, rate] of Object.entries(localRates)) {
          if (date >= monthStartStr && date <= monthEndStr) {
            rMap[date] = rate as number;
          }
        }
        const localBlocked: string[] = local.blocked?.[selectedPropertyId] ?? [];
        for (const date of localBlocked) {
          if (date >= monthStartStr && date <= monthEndStr) {
            bMap[date] = true;
          }
        }
      }
      setRatesMap(rMap);
      setBlockedMap(bMap);
    } catch {
      // localStorage unavailable
    }
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
    const days: ({ date: string; rate: number | null; isCustom: boolean; isBlocked: boolean } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) days.push(null);
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

  function handleDayClick(date: string) {
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
    const isBlocked = blockedMap[date];
    const { error } = await toggleBlockedDate(selectedPropertyId, date, isBlocked);
    if (error) {
      toast.error("Failed to update");
      return;
    }
    setBlockedMap((prev) => {
      const next = { ...prev };
      if (isBlocked) delete next[date];
      else next[date] = true;
      return next;
    });
    toast.success(isBlocked ? `Unblocked ${date}` : `Blocked ${date}`);
  }

  async function saveRates() {
    if (!rateInput || selectedRange.length === 0) return;
    const rate = Number(rateInput);
    if (Number.isNaN(rate) || rate <= 0) {
      toast.error("Enter a valid rate");
      return;
    }
    setSaving(true);
    const rows = selectedRange.map((date) => ({ property_id: selectedPropertyId, date, rate }));
    const { error } = await saveRateOverrides(selectedPropertyId, rows);
    setSaving(false);
    if (error) {
      toast.error("Failed to save");
      return;
    }
    setRatesMap((prev) => {
      const next = { ...prev };
      for (const date of selectedRange) next[date] = rate;
      return next;
    });
    toast.success(`Updated ${selectedRange.length} date${selectedRange.length > 1 ? "s" : ""} to ${formatINR(rate)}`);
    setSelectedRange([]);
    setRateInput("");
  }

  async function resetRates() {
    if (selectedRange.length === 0) return;
    setSaving(true);
    const { error } = await deleteRateOverrides(selectedPropertyId, selectedRange);
    setSaving(false);
    if (error) {
      toast.error("Failed to reset");
      return;
    }
    setRatesMap((prev) => {
      const next = { ...prev };
      for (const date of selectedRange) delete next[date];
      return next;
    });
    toast.success(`Reset ${selectedRange.length} date${selectedRange.length > 1 ? "s" : ""}`);
    setSelectedRange([]);
  }

  async function bulkUpdate() {
    if (!bulkStart || !bulkEnd) {
      toast.error("Select start and end dates");
      return;
    }
    if (bulkStart > bulkEnd) {
      toast.error("Start date must be before end date");
      return;
    }

    const dates: string[] = [];
    const cursor = new Date(bulkStart);
    while (cursor.toISOString().slice(0, 10) <= bulkEnd) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }

    setSaving(true);

    if (bulkBlock) {
      for (const date of dates) {
        if (!blockedMap[date]) {
          await toggleBlockedDate(selectedPropertyId, date, false);
        }
      }
      setBlockedMap((prev) => {
        const next = { ...prev };
        for (const date of dates) next[date] = true;
        return next;
      });
      toast.success(`Blocked ${dates.length} dates`);
    } else {
      const rate = Number(bulkRate);
      if (Number.isNaN(rate) || rate <= 0) {
        toast.error("Enter a valid rate");
        setSaving(false);
        return;
      }
      const rows = dates.map((date) => ({ property_id: selectedPropertyId, date, rate }));
      const { error } = await saveRateOverrides(selectedPropertyId, rows);
      if (error) {
        toast.error("Failed to save bulk rates");
        setSaving(false);
        return;
      }
      setRatesMap((prev) => {
        const next = { ...prev };
        for (const date of dates) next[date] = rate;
        return next;
      });
      toast.success(`Updated ${dates.length} dates to ${formatINR(rate)}`);
    }

    setSaving(false);
    setBulkStart("");
    setBulkEnd("");
    setBulkRate("");
    setBulkBlock(false);
  }

  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="min-h-[100dvh] bg-navy text-white">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <img src="/Plix_Transparent_(1).png" alt="The Plix Goa" className="h-8 w-auto object-contain" />
          <Link
            to="/"
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
          >
            Exit
          </Link>
        </div>
        {/* Tabs */}
        <div className="mx-auto flex max-w-2xl gap-1 px-4 pb-2">
          <button
            onClick={() => setTab("rates")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === "rates" ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            <CalendarDays className="size-4" />
            Rates & Inventory
          </button>
          <button
            onClick={() => setTab("blogs")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === "blogs" ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            <FileText className="size-4" />
            Blog Posts
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {tab === "blogs" ? (
          <MinimalBlogPublisher />
        ) : (
          <>
            {/* Property selector */}
            <div className="mb-4 overflow-x-auto">
              <div className="flex gap-2 pb-1">
                {PROPERTIES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPropertyId(p.id);
                      setSelectedRange([]);
                    }}
                    className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                      selectedPropertyId === p.id
                        ? "bg-bronze text-bronze-foreground"
                        : "border border-white/15 text-white/60 hover:bg-white/10"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Property info + range mode toggle */}
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="text-sm">
                <span className="font-semibold text-white">{selectedProperty.name}</span>
                <span className="ml-2 text-white/50">Default {formatINR(selectedProperty.base_price)}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={rangeMode}
                  onChange={(e) => {
                    setRangeMode(e.target.checked);
                    setSelectedRange([]);
                    setRangeStart(null);
                  }}
                  className="size-4 rounded border-white/30 bg-white/10"
                />
                Range
              </label>
            </div>

            {/* Bulk Update Section */}
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <h3 className="text-sm font-semibold text-white">Bulk Update</h3>
              <p className="mt-0.5 text-xs text-white/50">Apply rates or block dates across a range</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs text-white/60">
                  Start Date
                  <input
                    type="date"
                    value={bulkStart}
                    onChange={(e) => setBulkStart(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50 [color-scheme:dark]"
                  />
                </label>
                <label className="text-xs text-white/60">
                  End Date
                  <input
                    type="date"
                    value={bulkEnd}
                    min={bulkStart}
                    onChange={(e) => setBulkEnd(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50 [color-scheme:dark]"
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label className="flex flex-1 items-center gap-2 text-xs text-white/60">
                  Rate (₹)
                  <input
                    type="number"
                    min={0}
                    value={bulkRate}
                    onChange={(e) => setBulkRate(e.target.value)}
                    disabled={bulkBlock}
                    className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50 disabled:opacity-40"
                    placeholder={String(selectedProperty.base_price)}
                  />
                </label>
                <label className="flex items-center gap-2 whitespace-nowrap text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={bulkBlock}
                    onChange={(e) => {
                      setBulkBlock(e.target.checked);
                      if (e.target.checked) setBulkRate("");
                    }}
                    className="size-4 rounded border-white/30 bg-white/10"
                  />
                  Block all
                </label>
              </div>
              <button
                onClick={bulkUpdate}
                disabled={saving || (!bulkStart || !bulkEnd) || (!bulkBlock && !bulkRate)}
                className="mt-3 w-full rounded-full bg-bronze px-5 py-3 text-sm font-semibold text-bronze-foreground transition-transform active:scale-95 disabled:opacity-40"
              >
                {saving ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Apply Bulk Update"}
              </button>
            </div>

            {/* Calendar */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                  className="rounded-lg p-2 hover:bg-white/10"
                >
                  <ArrowLeft className="size-5" />
                </button>
                <h2 className="text-base font-semibold">{monthName}</h2>
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                  className="rounded-lg p-2 hover:bg-white/10"
                >
                  <ArrowRight className="size-5" />
                </button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="size-6 animate-spin text-bronze" />
                </div>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-white/40">
                    {weekdays.map((d, i) => (
                      <div key={i} className="py-1.5">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((cell, i) => {
                      if (!cell) return <div key={`empty-${i}`} className="aspect-square" />;
                      const isSelected = selectedRange.includes(cell.date);
                      const isPast = cell.date < todayISO();
                      return (
                        <div
                          key={cell.date}
                          onClick={() => !isPast && handleDayClick(cell.date)}
                          className={`relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border text-[10px] transition-all ${
                            isSelected
                              ? "border-bronze bg-bronze/20 ring-1 ring-bronze/40"
                              : cell.isBlocked
                                ? "border-red-500/40 bg-red-500/10"
                                : cell.isCustom
                                  ? "border-bronze/30 bg-bronze/5"
                                  : "border-white/10 hover:border-white/25"
                          } ${isPast ? "cursor-not-allowed opacity-30" : ""}`}
                        >
                          <span className={`font-medium ${cell.isBlocked ? "text-red-400" : "text-white"}`}>
                            {Number(cell.date.slice(8))}
                          </span>
                          {cell.isBlocked ? (
                            <span className="text-[8px] text-red-400">BLK</span>
                          ) : cell.isCustom ? (
                            <span className="text-[8px] text-bronze">₹{cell.rate}</span>
                          ) : (
                            <span className="text-[8px] text-white/40">₹{selectedProperty.base_price.toLocaleString("en-IN")}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-white/50">
                    <span className="flex items-center gap-1">
                      <span className="size-2.5 rounded border border-bronze/30 bg-bronze/5" /> Custom
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2.5 rounded border border-red-500/40 bg-red-500/10" /> Blocked
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="size-2.5 rounded border border-bronze bg-bronze/20" /> Selected
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Single date / range editor */}
            {selectedRange.length > 0 && !loading && (
              <div className="mt-4 rounded-2xl border border-bronze/30 bg-bronze/[0.08] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    {selectedRange.length === 1
                      ? selectedRange[0]
                      : `${selectedRange.length} dates`}
                  </h3>
                  <button
                    onClick={() => { setSelectedRange([]); setRateInput(""); }}
                    className="text-white/50 hover:text-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:ring-1 focus:ring-bronze/50"
                    placeholder="Nightly rate"
                  />
                  <button
                    onClick={saveRates}
                    disabled={saving || !rateInput}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-bronze px-4 py-2.5 text-sm font-semibold text-bronze-foreground transition-transform active:scale-95 disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    Save
                  </button>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={resetRates}
                    disabled={saving}
                    className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10"
                  >
                    Reset to Default
                  </button>
                  <button
                    onClick={() => {
                      const allBlocked = selectedRange.every((d) => blockedMap[d]);
                      selectedRange.forEach((d) => {
                        if (allBlocked ? blockedMap[d] : !blockedMap[d]) void toggleBlock(d);
                      });
                    }}
                    className="rounded-full border border-red-500/30 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
                  >
                    {selectedRange.every((d) => blockedMap[d]) ? "Unblock All" : "Block All"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

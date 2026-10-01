// Self-contained Airbnb host-account launcher grid — a personal,
// per-device bookmark list for staff juggling several Airbnb host logins
// (Rohit, Abhishek, Ghanshyam...), replacing a third-party "dual space"
// cloner app. Entirely local: nothing here reads or writes any PMS
// booking/POS/inquiry data or route, and nothing is synced to the server —
// nothing a device wipe/reinstall couldn't just re-seed from scratch.
//
// IMPORTANT — this does NOT give each space its own isolated cookie jar.
// True per-account session isolation (what the cloner apps actually do)
// needs Android's native WebView.setDataDirectorySuffix() API, which means
// a custom Capacitor plugin — real native Android work this component
// can't do on its own. Every tile opens the same shared system browser,
// exactly like opening regular browser tabs: logging into one Airbnb
// account there still logs out whichever one was active before. The UI
// says this plainly rather than implying isolation that isn't real.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Calendar, Home, Inbox, MoreVertical, Plus, X } from "lucide-react";
import { useBackDismiss } from "@/lib/pms-back-stack";

export type AirbnbSpaceInstance = {
  id: string;
  indexNumber: number;
  name: string;
  createdAt: number;
  /** Reserved for when real per-instance cookie isolation is built (a
   * native WebView data-directory suffix) — unused today, every space
   * shares the one system browser session. Kept in the stored shape now so
   * that future change doesn't need a data migration. */
  partitionKey: string;
};

const STORAGE_KEY = "plix_pms_airbnb_spaces";
const CORAL = "#FF385C";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `space_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function seedDefaults(): AirbnbSpaceInstance[] {
  const now = Date.now();
  return [
    { id: newId(), indexNumber: 1, name: "Rohit", createdAt: now, partitionKey: newId() },
    { id: newId(), indexNumber: 2, name: "Abhishek", createdAt: now, partitionKey: newId() },
  ];
}

function loadSpaces(): AirbnbSpaceInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedDefaults();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return seedDefaults();
    return parsed as AirbnbSpaceInstance[];
  } catch {
    return seedDefaults();
  }
}

function saveSpaces(spaces: AirbnbSpaceInstance[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces));
  } catch {
    // localStorage full/unavailable — the grid still works for this
    // session, it just won't persist across a restart.
  }
}

const HOSTING_URL = "https://www.airbnb.com/hosting";
const INBOX_URL = "https://www.airbnb.com/hosting/inbox";
const CALENDAR_URL = "https://www.airbnb.com/multicalendar";

function openExternal(url: string): void {
  // Same convention pms-native-file.ts's openVoucherInSystemBrowser uses —
  // "_system" is what actually leaves the Capacitor WebView for the real
  // system browser on Android; a plain "_blank" would try (and fail) to
  // open a new tab inside the app's own WebView instead.
  window.open(url, "_system");
}

export function AirbnbSpacesView() {
  // Loaded in an effect, not a useState lazy initializer — this route is
  // server-rendered and localStorage doesn't exist there, so a lazy
  // initializer would make the client's first render disagree with the
  // server's and produce a hydration mismatch, same reasoning
  // portal/login.tsx's own hasStoredPortalSessionSync comment gives.
  const [spaces, setSpaces] = useState<AirbnbSpaceInstance[] | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<AirbnbSpaceInstance | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [deleting, setDeleting] = useState<AirbnbSpaceInstance | null>(null);
  const [openSpace, setOpenSpace] = useState<AirbnbSpaceInstance | null>(null);

  useEffect(() => {
    setSpaces(loadSpaces());
  }, []);

  function persist(next: AirbnbSpaceInstance[]) {
    setSpaces(next);
    saveSpaces(next);
  }

  function addSpace(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !spaces) return;
    const nextIndex = Math.max(0, ...spaces.map((s) => s.indexNumber)) + 1;
    persist([
      ...spaces,
      { id: newId(), indexNumber: nextIndex, name: trimmed, createdAt: Date.now(), partitionKey: newId() },
    ]);
    toast.success(`${trimmed} added`);
  }

  function renameSpace(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed || !spaces) return;
    persist(spaces.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
  }

  function deleteSpace(id: string) {
    if (!spaces) return;
    persist(spaces.filter((s) => s.id !== id));
    toast.success("Space removed");
  }

  if (openSpace) {
    return <SpaceLauncher space={openSpace} onClose={() => setOpenSpace(null)} />;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white shadow-sm">
        <h1 className="text-xl font-bold">Airbnb Host Spaces</h1>
        <p className="mt-1 text-sm text-slate-400">
          Quick launchers for each Airbnb host login — tap a tile to open it in your browser.
        </p>
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          These all share one browser session, same as regular browser tabs — logging into one
          account logs out whichever was open before. Not isolated like a cloner app (yet).
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
        {(spaces ?? []).map((space) => (
          <div key={space.id} className="relative flex flex-col items-center">
            <button
              type="button"
              onClick={() => setOpenSpace(space)}
              className="flex size-16 items-center justify-center rounded-2xl shadow-sm transition-transform active:scale-95"
              style={{ backgroundColor: CORAL }}
              aria-label={`Open ${space.name}`}
            >
              <Home className="size-7 text-white" aria-hidden />
            </button>
            <span className="absolute right-0 top-11 flex size-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[10px] font-bold text-white">
              {space.indexNumber}
            </span>
            <button
              type="button"
              onClick={() => setMenuFor(menuFor === space.id ? null : space.id)}
              aria-label={`Options for ${space.name}`}
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm"
            >
              <MoreVertical className="size-3" aria-hidden />
            </button>
            <p className="mt-1.5 w-full truncate text-center text-xs font-medium text-slate-700">
              {space.name}
            </p>

            {menuFor === space.id && (
              <div
                className="absolute top-14 z-20 w-36 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
                onMouseLeave={() => setMenuFor(null)}
              >
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(space);
                    setRenameValue(space.name);
                    setMenuFor(null);
                  }}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Rename Space
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleting(space);
                    setMenuFor(null);
                  }}
                  className="block w-full px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete Space
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => {
              setAddValue("");
              setAdding(true);
            }}
            aria-label="Add space"
            className="flex size-16 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-100 transition-colors hover:bg-slate-200"
          >
            <Plus className="size-7 text-slate-500" aria-hidden />
          </button>
          <p className="mt-1.5 text-xs font-medium text-slate-500">Add</p>
        </div>
      </div>

      {renaming && (
        <Prompt
          title="Rename Space"
          label="Display name"
          confirmLabel="Save"
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSubmit={(v) => {
            renameSpace(renaming.id, v);
            setRenaming(null);
          }}
        />
      )}

      {adding && (
        <Prompt
          title="Add Space"
          label="Name (e.g. Casa Marina)"
          confirmLabel="Add"
          initial={addValue}
          onClose={() => setAdding(false)}
          onSubmit={(v) => {
            addSpace(v);
            setAdding(false);
          }}
        />
      )}

      {deleting && (
        <ConfirmDelete
          space={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            deleteSpace(deleting.id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

function Prompt({
  title,
  label,
  confirmLabel,
  initial,
  onSubmit,
  onClose,
}: {
  title: string;
  label: string;
  confirmLabel: string;
  initial: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  useBackDismiss(true, onClose);
  const [value, setValue] = useState(initial);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value);
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-500">
          {label}
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500"
          />
        </label>
        <button
          type="submit"
          disabled={!value.trim()}
          className="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </form>
    </div>
  );
}

function ConfirmDelete({
  space,
  onCancel,
  onConfirm,
}: {
  space: AirbnbSpaceInstance;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useBackDismiss(true, onCancel);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-bold text-slate-900">Delete "{space.name}"?</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          This only removes the bookmark tile from this device — it doesn't touch anything in your
          actual Airbnb account.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function SpaceLauncher({ space, onClose }: { space: AirbnbSpaceInstance; onClose: () => void }) {
  useBackDismiss(true, onClose);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white">
        <button type="button" onClick={onClose} aria-label="Back to spaces" className="text-slate-300 hover:text-white">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">
            {space.name} (Airbnb #{space.indexNumber})
          </p>
          <p className="text-xs text-slate-400">Opens in your browser — shared session, not isolated.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5">
        <button
          type="button"
          onClick={() => openExternal(HOSTING_URL)}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
        >
          <span className="flex size-10 items-center justify-center rounded-xl text-white" style={{ backgroundColor: CORAL }}>
            <Home className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">Hosting Dashboard</span>
            <span className="block text-xs text-slate-500">airbnb.com/hosting</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => openExternal(INBOX_URL)}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Inbox className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">Host Inbox</span>
            <span className="block text-xs text-slate-500">airbnb.com/hosting/inbox</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => openExternal(CALENDAR_URL)}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Calendar className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">Calendar</span>
            <span className="block text-xs text-slate-500">airbnb.com/multicalendar</span>
          </span>
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";

/**
 * A room-count field that can be backspaced empty and retyped, unlike a
 * plain `<input type="number">` clamped on every keystroke (`Number("")`
 * is 0, so `Math.max(1, 0)` snaps straight back to "1" before the field
 * ever reads empty — the digit typed to replace it lands after a "1" that
 * never left, so "2" becomes "12"). The clamp only ever applies to the
 * *committed* value passed to `onChange`; the field's own text can sit
 * empty or mid-edit until blur, when it settles on a valid number.
 */
export function RoomCountInput({
  value,
  max,
  min = 1,
  fallback = min,
  onChange,
  className,
  label = "Rooms",
}: {
  value: number;
  max?: number;
  /** Floor a committed value is clamped to — also what an emptied field settles on at blur. Defaults to 1 (room/adult counts); pass 0 for children/extra-bed/infants-style fields. */
  min?: number;
  /** What an emptied field settles on at blur, if different from `min` (rarely needed — `min` covers almost every case). */
  fallback?: number;
  onChange: (n: number) => void;
  className?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const cap = max ?? Number.MAX_SAFE_INTEGER;

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft}
      onChange={(e) => {
        const val = e.target.value;
        if (val !== "" && !/^\d+$/.test(val)) return; // ignore non-digit keystrokes; the field itself never shows garbage
        setDraft(val);
        const n = parseInt(val, 10);
        if (!isNaN(n) && n >= min) onChange(Math.min(cap, n));
      }}
      onBlur={() => {
        const n = parseInt(draft, 10);
        const clamped = !isNaN(n) && n >= min ? Math.min(cap, n) : fallback;
        setDraft(String(clamped));
        if (clamped !== value) onChange(clamped);
      }}
      className={className}
      aria-label={label}
    />
  );
}

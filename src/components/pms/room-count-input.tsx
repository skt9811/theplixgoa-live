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
export function RoomCountInput({ value, max, onChange, className }: { value: number; max: number; onChange: (n: number) => void; className?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

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
        if (!isNaN(n) && n > 0) onChange(Math.min(max, n));
      }}
      onBlur={() => {
        const n = parseInt(draft, 10);
        const clamped = !isNaN(n) && n > 0 ? Math.min(max, n) : 1;
        setDraft(String(clamped));
        if (clamped !== value) onChange(clamped);
      }}
      className={className}
      aria-label="Rooms"
    />
  );
}

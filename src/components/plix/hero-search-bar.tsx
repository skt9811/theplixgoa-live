import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, Minus, MapPin, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { PROPERTIES, todayISO } from "@/lib/plix";
import { GUESTS_PER_ROOM, isMultiRoomProperty, maxGuestsForRooms, maxRoomsForProperty } from "@/lib/rates";

/**
 * The hero's showcase search widget — a glassmorphism card with labeled
 * fields, distinct from the compact pill bar (`SearchBar`) used in the
 * sticky header on interior pages. Shares the same underlying search
 * params/navigation contract as SearchBar so results land on the same
 * /stays or /properties/$slug destinations.
 */
export function HeroSearchBar() {
  const navigate = useNavigate();

  const [selectedSlug, setSelectedSlug] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [guestError, setGuestError] = useState("");

  const selectedProperty = PROPERTIES.find((p) => p.slug === selectedSlug);
  const isMultiRoom = selectedProperty ? isMultiRoomProperty(selectedProperty.id) : false;
  const effectiveMaxGuests = selectedProperty
    ? isMultiRoom
      ? maxGuestsForRooms(rooms, selectedProperty.max_guests)
      : selectedProperty.max_guests
    : 20;

  function handleGuestsChange(value: number) {
    const nextValue = Math.max(1, Math.min(value, effectiveMaxGuests));
    setGuests(nextValue);
    if (isMultiRoom && selectedProperty) {
      const roomMax = maxGuestsForRooms(rooms, selectedProperty.max_guests);
      setGuestError(
        nextValue > roomMax
          ? `Maximum ${GUESTS_PER_ROOM} guests allowed per room. Please select additional rooms to continue.`
          : "",
      );
    } else {
      setGuestError("");
    }
  }

  function handleRoomsChange(value: number) {
    const maxRooms = selectedProperty ? maxRoomsForProperty(selectedProperty.id) : 1;
    const nextRooms = Math.max(1, Math.min(value, maxRooms));
    setRooms(nextRooms);
    if (selectedProperty) {
      const newMax = maxGuestsForRooms(nextRooms, selectedProperty.max_guests);
      if (guests > newMax) {
        setGuests(newMax);
        setGuestError(`Maximum ${GUESTS_PER_ROOM} guests allowed per room. Please select additional rooms to continue.`);
      } else {
        setGuestError("");
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (guestError) return;
    const searchParams = {
      checkIn: checkIn || undefined,
      checkOut: checkOut || undefined,
      guests: guests > 0 ? guests : undefined,
      rooms: rooms > 1 ? rooms : undefined,
    };
    if (selectedSlug) {
      navigate({ to: "/properties/$slug", params: { slug: selectedSlug }, search: searchParams });
    } else {
      navigate({ to: "/stays", search: searchParams });
    }
  }

  const fieldLabel = "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/80";
  const fieldShell =
    "mt-1.5 flex items-center rounded-xl bg-white/95 px-3 py-2.5 shadow-soft";
  const fieldInput =
    "w-full min-w-0 bg-transparent text-sm font-medium text-navy outline-none [color-scheme:light]";

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full rounded-3xl border border-white/25 bg-white/15 p-4 shadow-2xl backdrop-blur-md sm:p-5"
    >
      <div className="lg:flex lg:flex-row lg:items-end lg:gap-3">
      <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className={fieldLabel}>
            <MapPin className="size-3.5 text-bronze" aria-hidden />
            Location
          </span>
          <div className={fieldShell}>
            <select
              value={selectedSlug}
              onChange={(e) => {
                setSelectedSlug(e.target.value);
                setRooms(1);
                setGuests(2);
                setGuestError("");
              }}
              className={`${fieldInput} cursor-pointer`}
            >
              <option value="">Any villa or resort</option>
              {PROPERTIES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="block">
          <span className={fieldLabel}>
            <CalendarDays className="size-3.5 text-bronze" aria-hidden />
            Check-In
          </span>
          <div className={fieldShell}>
            <input
              type="date"
              min={todayISO()}
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className={fieldInput}
            />
          </div>
        </label>

        <label className="block">
          <span className={fieldLabel}>
            <CalendarDays className="size-3.5 text-bronze" aria-hidden />
            Check-Out
          </span>
          <div className={fieldShell}>
            <input
              type="date"
              min={checkIn || todayISO(1)}
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className={fieldInput}
            />
          </div>
        </label>

        <div className="block">
          <span className={fieldLabel}>
            <Users className="size-3.5 text-bronze" aria-hidden />
            Guests
          </span>
          <div className={`${fieldShell} justify-between`}>
            <button
              type="button"
              onClick={() => handleGuestsChange(guests - 1)}
              disabled={guests <= 1}
              aria-label="Decrease guests"
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-navy transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus className="size-3" aria-hidden />
            </button>
            <span className="text-sm font-medium text-navy">
              {guests} guest{guests === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={() => handleGuestsChange(guests + 1)}
              disabled={guests >= effectiveMaxGuests}
              aria-label="Increase guests"
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-navy transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-3" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={Boolean(guestError)}
        className="mt-4 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-bronze px-6 py-3.5 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto lg:mt-0"
      >
        <Search className="size-4" aria-hidden />
        Search Stays
      </button>
      </div>

      {isMultiRoom && (
        <label className="mt-3 block max-w-[220px]">
          <span className={fieldLabel}>Rooms</span>
          <div className={`${fieldShell} justify-between`}>
            <button
              type="button"
              onClick={() => handleRoomsChange(rooms - 1)}
              disabled={rooms <= 1}
              aria-label="Decrease rooms"
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-navy transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus className="size-3" aria-hidden />
            </button>
            <span className="text-sm font-medium text-navy">{rooms} room{rooms === 1 ? "" : "s"}</span>
            <button
              type="button"
              onClick={() => handleRoomsChange(rooms + 1)}
              disabled={selectedProperty ? rooms >= maxRoomsForProperty(selectedProperty.id) : true}
              aria-label="Increase rooms"
              className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-navy transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-3" aria-hidden />
            </button>
          </div>
        </label>
      )}

      {guestError && <p className="mt-2 text-xs text-red-200">{guestError}</p>}
    </form>
  );
}

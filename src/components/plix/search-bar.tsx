import { useNavigate, useSearch } from "@tanstack/react-router";
import { BedDouble, CalendarDays, MapPin, Minus, Plus, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { PROPERTIES, todayISO } from "@/lib/plix";
import { GUESTS_PER_ROOM, isMultiRoomProperty, maxGuestsForRooms, maxRoomsForProperty } from "@/lib/rates";

type SearchParams = {
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  rooms?: number;
};

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const urlSearch = useSearch({ strict: false }) as SearchParams;

  const [selectedSlug, setSelectedSlug] = useState("");
  const [checkIn, setCheckIn] = useState(urlSearch.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(urlSearch.checkOut ?? "");
  const [guests, setGuests] = useState(urlSearch.guests ?? 2);
  const [rooms, setRooms] = useState(urlSearch.rooms ?? 1);
  const [guestError, setGuestError] = useState("");

  // Sync from URL when navigating between pages
  useEffect(() => {
    if (urlSearch.checkIn) setCheckIn(urlSearch.checkIn);
    if (urlSearch.checkOut) setCheckOut(urlSearch.checkOut);
    if (urlSearch.guests) setGuests(urlSearch.guests);
    if (urlSearch.rooms) setRooms(urlSearch.rooms);
  }, [urlSearch.checkIn, urlSearch.checkOut, urlSearch.guests, urlSearch.rooms]);

  const selectedProperty = PROPERTIES.find((p) => p.slug === selectedSlug);
  const isMultiRoom = selectedProperty ? isMultiRoomProperty(selectedProperty.id) : false;
  const effectiveMaxGuests = selectedProperty
    ? isMultiRoom
      ? maxGuestsForRooms(rooms, selectedProperty.max_guests)
      : selectedProperty.max_guests
    : 20;

  const fieldClass =
    "w-full bg-transparent text-xs font-medium text-foreground outline-none placeholder:text-muted-foreground/60 [color-scheme:light]";

  function handleGuestsChange(value: number) {
    const nextValue = Math.max(1, Math.min(value, effectiveMaxGuests));
    setGuests(nextValue);
    if (isMultiRoom && selectedProperty) {
      const roomMax = maxGuestsForRooms(rooms, selectedProperty.max_guests);
      if (nextValue > roomMax) {
        setGuestError(`Maximum ${GUESTS_PER_ROOM} guests allowed per room. Please select additional rooms to continue.`);
      } else {
        setGuestError("");
      }
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
      navigate({
        to: "/properties/$slug",
        params: { slug: selectedSlug },
        search: searchParams,
      });
    } else {
      navigate({
        to: "/stays",
        search: searchParams,
      });
    }
  }

  const formContent = (
    <form
      onSubmit={handleSubmit}
      className={`flex w-full flex-col items-stretch gap-px bg-white ${
        compact
          ? "rounded-2xl border border-gray-200 p-2 shadow-lg md:flex-row md:items-center md:rounded-full md:p-1.5"
          : "rounded-2xl border border-border p-1.5 shadow-card backdrop-blur md:flex-row md:items-center md:rounded-full"
      }`}
    >
      <label className="flex flex-1 items-center gap-1.5 rounded-lg px-3 py-2.5 md:rounded-full md:py-1.5 md:hover:bg-gray-50">
        <MapPin className="size-3.5 shrink-0 text-bronze" aria-hidden />
        <span className="sr-only">Select stay</span>
        <select
          value={selectedSlug}
          onChange={(e) => {
            setSelectedSlug(e.target.value);
            setRooms(1);
            setGuests(2);
            setGuestError("");
          }}
          className={`${fieldClass} min-w-0 cursor-pointer`}
        >
          <option value="">Where to?</option>
          {PROPERTIES.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <span className="hidden h-5 w-px bg-gray-200 md:block" />

      <label className="flex flex-1 items-center gap-1.5 rounded-lg px-3 py-2.5 md:rounded-full md:py-1.5 md:hover:bg-gray-50">
        <CalendarDays className="size-3.5 shrink-0 text-bronze" aria-hidden />
        <span className="sr-only">Check-in</span>
        <input
          type="date"
          min={todayISO()}
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          className={`${fieldClass} min-h-[28px]`}
        />
      </label>

      <span className="hidden h-5 w-px bg-gray-200 md:block" />

      <label className="flex flex-1 items-center gap-1.5 rounded-lg px-3 py-2.5 md:rounded-full md:py-1.5 md:hover:bg-gray-50">
        <CalendarDays className="size-3.5 shrink-0 text-bronze" aria-hidden />
        <span className="sr-only">Check-out</span>
        <input
          type="date"
          min={checkIn || todayISO(1)}
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          className={`${fieldClass} min-h-[28px]`}
        />
      </label>

      <span className="hidden h-5 w-px bg-gray-200 md:block" />

      {isMultiRoom ? (
        <>
          <div className="flex flex-1 items-center gap-1 rounded-lg px-3 py-2.5 md:rounded-full md:py-1.5 md:hover:bg-gray-50">
            <BedDouble className="size-3.5 shrink-0 text-bronze" aria-hidden />
            <span className="sr-only">Rooms</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleRoomsChange(rooms - 1)}
                disabled={rooms <= 1}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 md:size-5"
                aria-label="Decrease rooms"
              >
                <Minus className="size-3" />
              </button>
              <span className="min-w-[1.25rem] text-center text-xs font-medium text-foreground">{rooms}</span>
              <button
                type="button"
                onClick={() => handleRoomsChange(rooms + 1)}
                disabled={selectedProperty ? rooms >= maxRoomsForProperty(selectedProperty.id) : true}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-gray-300 text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 md:size-5"
                aria-label="Increase rooms"
              >
                <Plus className="size-3" />
              </button>
            </div>
            <span className="text-xs text-muted-foreground/60">rooms</span>
          </div>
          <span className="hidden h-5 w-px bg-gray-200 md:block" />
        </>
      ) : null}

      <label className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 md:rounded-full md:py-1.5 md:hover:bg-gray-50">
        <Users className="size-3.5 shrink-0 text-bronze" aria-hidden />
        <span className="sr-only">Guests</span>
        <input
          type="number"
          min={1}
          max={effectiveMaxGuests}
          value={guests}
          onChange={(e) => handleGuestsChange(Number(e.target.value))}
          className={`${fieldClass} w-12 text-center`}
        />
        <span className="text-xs text-muted-foreground/60">guests</span>
      </label>

      <button
        type="submit"
        disabled={Boolean(guestError)}
        className="mt-1 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-bronze px-5 py-3 text-xs font-semibold text-bronze-foreground transition-transform duration-200 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:mt-0 md:py-2"
      >
        <Search className="size-3.5" aria-hidden />
        Search
      </button>

      {guestError && (
        <p className="px-3 text-xs text-red-600">{guestError}</p>
      )}
    </form>
  );

  return formContent;
}

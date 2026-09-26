// Business validation guards shared by the invoice builder and the offline
// voucher form. They never block on their own: each returns a warning the
// operator has to confirm before the save goes through.
import { PROPERTIES } from "@/lib/plix";
import { isMultiRoomProperty, maxGuestsForRooms } from "@/lib/rates";
import { propertyLabel } from "@/lib/pms-format";

export const MIN_ROOM_RATE = 1000;
export const MIN_VILLA_GUESTS = 6;

export type GuardWarning = { id: string; title: string; message: string; confirmLabel: string };

/** Multi-room properties are resorts (booked by room); the rest are whole-villa stays. */
export const isResortProperty = (propertyId: string) => isMultiRoomProperty(propertyId);

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function collectGuardWarnings(input: { propertyId: string; guests: number; rooms: number; roomRates: { date: string; rate: number }[] }): GuardWarning[] {
  const warnings: GuardWarning[] = [];

  // A. Rate guard: minimum Rs 1,000 per room night.
  const low = input.roomRates.filter((r) => r.rate < MIN_ROOM_RATE);
  if (low.length > 0) {
    const first = low[0]!;
    warnings.push({
      id: "low-rate",
      title: "Low room rate",
      message:
        `Warning: Room rate for ${dateLabel(first.date)} is set to ${inr(first.rate)}, which is below the ${inr(MIN_ROOM_RATE)} threshold. Do you really want to set this price?` +
        (low.length > 1 ? ` ${low.length - 1} other date${low.length - 1 === 1 ? " is" : "s are"} also below ${inr(MIN_ROOM_RATE)}.` : ""),
      confirmLabel: "Confirm Price",
    });
  }

  const property = PROPERTIES.find((p) => p.slug === input.propertyId);
  if (!property) return warnings;

  if (isResortProperty(input.propertyId)) {
    // B. Resort guest rules.
    if (input.rooms > 1 && input.guests === 1) {
      warnings.push({
        id: "resort-one-guest",
        title: "Rooms and guests",
        message: `You have selected ${input.rooms} rooms with only 1 total guest. Please confirm if this is intended.`,
        confirmLabel: "Yes, this is intended",
      });
    }
    const capacity = maxGuestsForRooms(input.rooms, property.max_guests);
    if (input.guests > capacity) {
      warnings.push({
        id: "resort-capacity",
        title: "Above guest capacity",
        message: `${propertyLabel(input.propertyId)} allows at most ${capacity} guest${capacity === 1 ? "" : "s"} for ${input.rooms} room${input.rooms === 1 ? "" : "s"}, and ${input.guests} ${input.guests === 1 ? "is" : "are"} entered. Do you want to save anyway?`,
        confirmLabel: "Save anyway",
      });
    }
  } else if (input.guests < MIN_VILLA_GUESTS) {
    // C. Villa minimum.
    warnings.push({
      id: "villa-min-guests",
      title: "Small group for a villa",
      message: `Villas typically host groups of ${MIN_VILLA_GUESTS} or more. Current guest count is set to ${input.guests}. Do you want to proceed with this booking?`,
      confirmLabel: "Proceed",
    });
  }
  return warnings;
}

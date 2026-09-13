import type { PortalBooking } from "@/lib/portal-bookings-client";
import { PortalCalendarSection } from "@/components/plix/portal-calendar-section";

export function PortalCalendarTab({ propertySlug, bookings }: { propertySlug: string; bookings: PortalBooking[] }) {
  return (
    <>
      <h1 className="text-xl font-semibold text-white">Calendar</h1>
      <p className="mt-1 text-xs text-white/50">Full monthly booking span — tap any date to inspect or block it.</p>
      <PortalCalendarSection propertySlug={propertySlug} bookings={bookings} />
    </>
  );
}

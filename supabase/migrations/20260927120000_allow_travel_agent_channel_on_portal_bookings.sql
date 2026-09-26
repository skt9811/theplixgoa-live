/*
  # Allow the 'travel_agent' booking channel on portal_bookings

  Adds 'travel_agent' (Travel Agent / OTA) to the channel CHECK. Every value that
  was allowed before stays allowed, so existing rows and forms are unaffected.
  No columns are added. The website's checkout writes to `bookings`, not here.
*/
ALTER TABLE portal_bookings DROP CONSTRAINT IF EXISTS portal_bookings_channel_check;
ALTER TABLE portal_bookings
  ADD CONSTRAINT portal_bookings_channel_check
  CHECK (channel IN ('direct', 'offline_phone', 'airbnb', 'booking_com', 'walk_in', 'agoda', 'repeat_guest', 'owner_booking', 'travel_agent'));

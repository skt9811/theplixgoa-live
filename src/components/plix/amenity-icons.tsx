import { Car, Coffee, ConciergeBell, PawPrint, Snowflake, Star, Tv, Waves, Wifi } from "lucide-react";
import type { ComponentType } from "react";

export const amenityIcons: Record<string, ComponentType<{ className?: string }>> = {
  "Swimming Pool": Waves,
  "Private Pool": Waves,
  "Free Wi-Fi": Wifi,
  "Wi-Fi": Wifi,
  "Air Conditioning": Snowflake,
  Caretaker: ConciergeBell,
  "Breakfast Included": Coffee,
  "Pet Friendly": PawPrint,
  "Free Parking": Car,
  Parking: Car,
  "Smart TV": Tv,
};

export function amenityIcon(tag: string): ComponentType<{ className?: string }> {
  return amenityIcons[tag] ?? Star;
}

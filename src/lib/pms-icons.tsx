import {
  BedDouble, Briefcase, Car, Ellipsis, Fuel, Gift, Heart, House, Leaf, Megaphone, Phone, Receipt, Shield, Shirt, ShoppingBag,
  Sparkles, Truck, Users, Utensils, Waves, Wifi, Wine, Wrench, Zap, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  receipt: Receipt, home: House, users: Users, wrench: Wrench, zap: Zap, utensils: Utensils, waves: Waves, shirt: Shirt,
  megaphone: Megaphone, more: Ellipsis, bed: BedDouble, wine: Wine, sparkles: Sparkles, car: Car, "shopping-bag": ShoppingBag,
  fuel: Fuel, wifi: Wifi, shield: Shield, briefcase: Briefcase, gift: Gift, heart: Heart, phone: Phone, truck: Truck, leaf: Leaf,
};

export function iconFor(key: string | undefined): LucideIcon {
  return (key && ICONS[key]) || Receipt;
}

/** A category's coloured rounded-square icon badge. */
export function CategoryBadge({ icon, color, size = "md" }: { icon?: string | undefined; color?: string | undefined; size?: "sm" | "md" | "lg" }) {
  const Icon = iconFor(icon);
  const c = color ?? "#64748B";
  const box = size === "lg" ? "size-14 rounded-2xl" : size === "sm" ? "size-8 rounded-lg" : "size-11 rounded-xl";
  const glyph = size === "lg" ? "size-7" : size === "sm" ? "size-4" : "size-5";
  return (
    <span className={`flex shrink-0 items-center justify-center ${box}`} style={{ backgroundColor: `${c}26`, color: c }}>
      <Icon className={glyph} aria-hidden />
    </span>
  );
}

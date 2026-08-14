import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="bg-navy text-navy-foreground">
      <div className="grid border-b border-white/20 md:grid-cols-4">
        <div className="flex flex-col items-center justify-center gap-3 border-b border-white/20 px-6 py-10 text-center md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-foreground/70">Address</p>
          <MapPin className="size-5 text-bronze" aria-hidden />
          <p className="max-w-xs text-sm leading-relaxed text-navy-foreground/85">
            Pequen, Chivar, 1561/3A, Anjuna, Vagator, Goa 403413
          </p>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 border-b border-white/20 px-6 py-10 text-center md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-foreground/70">Phone</p>
          <Phone className="size-5 text-bronze" aria-hidden />
          <div className="grid gap-1 text-sm text-navy-foreground/85">
            <a href="tel:+919009800809" className="transition-colors hover:text-white">+91-9009800809</a>
            <a href="tel:+919009800895" className="transition-colors hover:text-white">+91-9009800895</a>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 border-b border-white/20 px-6 py-10 text-center md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-foreground/70">Email</p>
          <Mail className="size-5 text-bronze" aria-hidden />
          <a href="mailto:reservations@theplixgoa.com" className="text-sm text-navy-foreground/85 transition-colors hover:text-white">
            reservations@theplixgoa.com
          </a>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy-foreground/70">Social</p>
          <div className="flex items-center gap-4 text-navy-foreground/85">
            <a href="#" aria-label="Facebook" className="transition-colors hover:text-white"><Facebook className="size-4" /></a>
            <a href="#" aria-label="Instagram" className="transition-colors hover:text-white"><Instagram className="size-4" /></a>
            <a href="https://wa.me/919009800809" aria-label="WhatsApp" className="transition-colors hover:text-white"><MessageCircle className="size-4" /></a>
            <a href="mailto:reservations@theplixgoa.com" aria-label="Email" className="transition-colors hover:text-white"><Mail className="size-4" /></a>
          </div>
          <Link to="/about" className="mt-1 text-xs text-navy-foreground/60 transition-colors hover:text-white">About Plix Hospitality</Link>
        </div>
      </div>
      <div className="px-4 py-5 text-center text-xs text-navy-foreground/60">
        © {new Date().getFullYear()} Plix Hospitality. All rights reserved.
      </div>
    </footer>
  );
}

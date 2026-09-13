import { createFileRoute, Link } from "@tanstack/react-router";
import landingImage from "@/assets/Landing_partner_app.jpg";

export const Route = createFileRoute("/portal/")({
  head: () => ({
    meta: [
      { title: "Plix Partner — Manage Your Property" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalWelcomePage,
});

function PortalWelcomePage() {
  return (
    <div className="relative h-screen w-full overflow-hidden">
      <img
        src={landingImage}
        alt=""
        className="absolute inset-0 size-full object-cover"
        aria-hidden
      />
      {/* Dark gradient so white branding/text stay legible over any part of the photo. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/70" aria-hidden />

      <div className="relative flex h-full flex-col justify-between px-6 py-10 text-white">
        <div className="flex flex-col items-center pt-6 text-center">
          <img src="/Plix_Transparent_(1).png" alt="Plix Hospitality" className="h-16 w-auto object-contain brightness-0 invert" />
          <p className="mt-4 font-display text-lg italic text-white/90">Effortless Hospitality, Elevated Stays.</p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <Link
            to="/portal/login"
            className="w-full rounded-full bg-white py-4 text-center font-semibold text-stone-900 shadow-lg transition-transform active:scale-95"
          >
            Sign In
          </Link>
          <p className="text-center text-sm text-white/80">
            Want to book a villa?
            <br />
            Please visit{" "}
            <a href="https://theplixgoa.com/" className="font-medium underline underline-offset-2">
              theplixgoa.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

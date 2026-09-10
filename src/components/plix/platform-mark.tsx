import type { ReviewPlatform } from "@/lib/property-reviews-data";

export const PLATFORM_STYLE: Record<ReviewPlatform, string> = {
  Google: "bg-blue-50 text-blue-700 ring-blue-200",
  Airbnb: "bg-rose-50 text-rose-700 ring-rose-200",
  Agoda: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  MakeMyTrip: "bg-red-50 text-red-700 ring-red-200",
};

// Small brand-colored marks so the source reads as a real platform badge
// rather than a plain colored label. Google's is the actual four-color "G"
// mark (the same glyph used in most "Continue with Google" buttons); the
// others are simplified monogram roundels in each brand's real color, since
// their full logomarks are too detailed to read at badge size anyway.
export function PlatformMark({ platform }: { platform: ReviewPlatform }) {
  if (platform === "Google") {
    return (
      <svg viewBox="0 0 48 48" className="size-3.5 shrink-0" aria-hidden>
        <path
          fill="#FFC107"
          d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
        />
        <path
          fill="#FF3D00"
          d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
        />
        <path
          fill="#4CAF50"
          d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
        />
        <path
          fill="#1976D2"
          d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
        />
      </svg>
    );
  }
  const MONOGRAM: Record<"Airbnb" | "Agoda" | "MakeMyTrip", { bg: string; label: string }> = {
    Airbnb: { bg: "#FF385C", label: "A" },
    Agoda: { bg: "#5392F9", label: "a" },
    MakeMyTrip: { bg: "#E9042A", label: "mmt" },
  };
  const { bg, label } = MONOGRAM[platform];
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="12" fill={bg} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={label.length > 1 ? 7 : 12}
        fontWeight="700"
        fill="#fff"
        fontFamily="Arial, sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}

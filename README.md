# Plix Goa Escapes

Build a luxury multi-property hospitality booking web application for my brand "Plix Hospitality" operating in Goa, India. The UI/UX should mirror high-converting direct booking platforms like SaffronStays.

KEY REQUIREMENTS & ARCHITECTURE:

1. BRANDING & STYLING:

   - Modern, high-end, clean aesthetic with smooth animations using Tailwind CSS.

   - Primary color: Deep Emerald/Navy (`#0f172a` / `#059669`). Neutral slate backgrounds with crisp typography.

   - Fully responsive for mobile devices (iPhone/Android) and desktop screens.

2. NAVIGATION & HEADER:

   - Sticky top navigation bar with Plix Hospitality branding logo.

   - Quick navigation links: Locations (Morjim, Calangute, North Goa), Stays, About Us, Contact.

   - Global sticky search bar with filters: Location dropdown, Check-in date, Check-out date, Guest count, Search Button.

3. HOMEPAGE SECTIONS:

   - Hero Section: High-impact video/image slider with headline: "Handpicked Boutique Stays & Luxury Villas in Goa".

   - Location Hub Cards: Quick filter cards for "Morjim Beach", "Calangute", "North Goa Stays".

   - Multi-Property Grid Display: Display cards for properties including "Morjim Pride" and "Harbor Court".

     - Each card must display: Primary photo carousel, Property Name, Location, Bedrooms/Bathrooms count, Key Amenities tags (Pool, Pet Friendly, Free Wi-Fi), Price per night in INR (₹), and "View Stay" button.

   - Why Book Direct Section: Highlights (Best Price Guarantee, 0% Commission, Direct Guest Support).

   - Testimonials & FAQs Section.

4. PROPERTY DETAIL PAGE (PDP) - Route: `/properties/[slug]`:

   - Full photo gallery grid.

   - Overview stats: Max guests, Bedrooms, Bathrooms, Distance to beach.

   - Sticky Booking Bar/Card on the right:

     - Check-in & Check-out date picker.

     - Guest selector.

     - Dynamic total price calculator (Nights x Base Rate + Taxes).

     - "Book Direct Now" button opening a checkout modal.

   - Amenities grid with icons (Swimming Pool, Wi-Fi, AC, Caretaker, Breakfast).

   - Interactive Google Map placeholder for exact location.

   - Nearby Attractions & Distances list (e.g., "3 mins walk to Morjim Beach").

5. BACKEND & DATABASE INTEGRATION (Supabase):

   - Create schema tables for: `properties`, `reservations`, `amenities`, and `guest_reviews`.

   - Seed sample properties including "Morjim Pride" in Morjim (Base Price: ₹4,500/night) and "Harbor Court" in Calangute (Base Price: ₹5,500/night).

6. DIRECT CHECKOUT FLOW:

   - Integrate Razorpay payment modal mockup collecting Guest Name, Email, Mobile Number, Check-in/Check-out dates, and Total Amount in INR.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2f87aa5f-5e08-4aa9-be64-61844cdf235a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

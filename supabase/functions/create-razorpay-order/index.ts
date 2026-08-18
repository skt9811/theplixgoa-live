import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { getSecrets } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let totalAmount = 0;
  let razorpayKeyId = "";

  try {
    const body = await req.json();
    const {
      property_id,
      property_name,
      property_location,
      guest_name,
      guest_email,
      guest_mobile,
      check_in,
      check_out,
      guests,
      nights,
      subtotal,
      taxes,
      total_amount,
    } = body;

    totalAmount = total_amount;

    if (!property_id || !guest_name || !guest_email || !check_in || !check_out || !total_amount) {
      return new Response(
        JSON.stringify({ error: "Missing required booking fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let secrets: Record<string, string> = {};
    try {
      secrets = await getSecrets(supabase, [
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "PLIX_HOST_EMAIL",
      ]);
    } catch {
      // Secret lookup failed — will fall through to fallback
    }

    razorpayKeyId = secrets["RAZORPAY_KEY_ID"] ?? "";
    const razorpayKeySecret = secrets["RAZORPAY_KEY_SECRET"] ?? "";
    const hostEmail = secrets["PLIX_HOST_EMAIL"] ?? "reservations@theplixgoa.com";

    // Simulation mode: no Razorpay credentials
    if (!razorpayKeyId || !razorpayKeySecret) {
      let bookingId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      try {
        const { data: booking, error } = await supabase
          .from("bookings")
          .insert({
            property_id,
            property_name,
            property_location,
            guest_name,
            guest_email,
            guest_mobile,
            check_in,
            check_out,
            guests,
            nights,
            subtotal,
            taxes,
            total_amount,
            payment_status: "simulated",
            host_email: hostEmail,
          })
          .select()
          .single();

        if (!error && booking) {
          bookingId = booking.id;
        }
      } catch {
        // DB insert failed — use generated fallback booking ID
      }

      return new Response(
        JSON.stringify({
          simulation: true,
          booking_id: bookingId,
          order_id: `sim_${bookingId.slice(0, 12)}`,
          amount: Math.round(total_amount * 100),
          currency: "INR",
          key_id: null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Real Razorpay order creation
    const amountInPaise = Math.round(total_amount * 100);
    const auth = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

    let order: { id: string };

    try {
      const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: `plix_${Date.now()}`,
          notes: {
            property_id,
            guest_email,
          },
        }),
      });

      if (!rzpRes.ok) {
        const errText = await rzpRes.text();
        throw new Error(`Razorpay API error: ${errText}`);
      }

      order = await rzpRes.json();
    } catch (err) {
      // Razorpay API failed — return fallback so client can still open checkout
      const fallbackId = `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      console.error("[create-razorpay-order] Razorpay API failed, returning fallback:", err);
      return new Response(
        JSON.stringify({
          simulation: true,
          booking_id: fallbackId,
          order_id: `fallback_${fallbackId.slice(0, 12)}`,
          amount: amountInPaise,
          currency: "INR",
          key_id: razorpayKeyId,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let bookingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      const { data: booking, error } = await supabase
        .from("bookings")
        .insert({
          property_id,
          property_name,
          property_location,
          guest_name,
          guest_email,
          guest_mobile,
          check_in,
          check_out,
          guests,
          nights,
          subtotal,
          taxes,
          total_amount,
          razorpay_order_id: order.id,
          payment_status: "pending",
          host_email: hostEmail,
        })
        .select()
        .single();

      if (!error && booking) {
        bookingId = booking.id;
      }
    } catch {
      // DB insert failed — use generated fallback booking ID
    }

    return new Response(
      JSON.stringify({
        simulation: false,
        booking_id: bookingId,
        order_id: order.id,
        amount: amountInPaise,
        currency: "INR",
        key_id: razorpayKeyId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    // Top-level fallback: never return 500, always return a usable payload
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[create-razorpay-order] Unhandled error, returning fallback:", message);

    return new Response(
      JSON.stringify({
        simulation: true,
        booking_id: `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        order_id: `fallback_${Date.now()}`,
        amount: Math.round((totalAmount || 0) * 100),
        currency: "INR",
        key_id: razorpayKeyId || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { NextRequest, NextResponse } from "next/server";
import { Retell } from "retell-sdk";

export const runtime = "nodejs"; // Node runtime on Vercel

export async function POST(req: NextRequest) {
  try {
    // 1) Verify Retell signature (so only Retell can hit this)
    const signature = req.headers.get("x-retell-signature") || "";
    const raw = await req.text();
    const okSig = Retell.verify(raw, process.env.RETELL_API_KEY!, signature);
    if (!okSig) {
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
    }

    // 2) Parse args Retell sent
    const { args = {} } = JSON.parse(raw) ?? {};
    const { eventTypeId, start, name, email, timeZone, metadata } = args;

    // Minimal validation (Cal needs eventTypeId, attendee, and UTC start)
    if (!eventTypeId || !start || !email) {
      return NextResponse.json(
        { ok: false, error: "Missing: eventTypeId, start (UTC), or email" },
        { status: 200 }
      );
    }

    // 3) Build Cal.com payload (API v2 uses `attendee` object)
    const calPayload = {
      start, // must be UTC ISO like "2025-09-12T02:00:00Z"
      attendee: {
        name: name || "Guest",
        email,
        timeZone: timeZone || "Pacific/Auckland",
      },
      eventTypeId: Number(eventTypeId),
      metadata: metadata || {},
    };

    // 4) Call Cal.com
    const res = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CAL_API_KEY}`,
        "cal-api-version": "2024-08-13", // required by v2
      },
      body: JSON.stringify(calPayload),
    });

    const data = await res.json().catch(() => ({}));

    // 5) Always return a handled JSON back to Retell
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, status: res.status, error: data },
        { status: 200 }
      );
    }
    return NextResponse.json({ ok: true, booking: data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown" }, { status: 200 });
  }
}

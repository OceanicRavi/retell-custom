// app/api/retell-cal/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    console.log("📥 Received Retell webhook");
    
    // Get the payload
    const payload = await req.json();
    console.log("📋 Full payload:", JSON.stringify(payload, null, 2));
    
    // Extract args from Book-Meeting-with-Note
    const args = payload.args;
    console.log("🎯 Extracted args:", JSON.stringify(args, null, 2));
    
    // Convert to Cal.com format
    const calPayload = {
      start: args.startTime,
      attendee: {
        name: args.name,
        email: args.email,
        timeZone: args.timeZone
      },
      eventTypeId: Number(process.env.CAL_EVENT_TYPE_ID || args.eventTypeId),
      metadata: {
        ...args.metadata,
        phone: args.phoneNumber,
        bookingFields: args.bookingFieldsResponses,
        source: "retell-ai"
      }
    };
    
    console.log("📤 Sending to Cal.com:", JSON.stringify(calPayload, null, 2));
    
    // Send to Cal.com
    const response = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CAL_API_KEY}`,
        "cal-api-version": "2024-08-13"
      },
      body: JSON.stringify(calPayload)
    });
    
    const result = await response.json();
    console.log("✅ Cal.com response:", response.status, JSON.stringify(result, null, 2));
    
    // Send response back to Retell
    if (response.ok) {
      const message = `Perfect! Your ${args.metadata?.car_selected || 'ride'} is booked from ${args.metadata?.pickup_location || 'pickup'} to ${args.metadata?.destination || 'destination'} for ${args.startTime}. Booking confirmed!`;
      console.log("📞 Retell response:", message);
      return NextResponse.json(message);
    } else {
      const errorMessage = "Sorry, there was an issue with the booking. Please try again.";
      console.log("❌ Retell error response:", errorMessage);
      return NextResponse.json(errorMessage);
    }
    
  } catch (error) {
    console.error("💥 Error:", error);
    return NextResponse.json("I'm having technical difficulties. Please try again.");
  }
}
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

    // Track if we need date confirmation
    let needsDateConfirmation = false;
    let dateIssueReason = "";

    // Convert NZ timezone datetime to UTC for Cal.com with validation
    const convertToUTC = (dateTimeString) => {
      try {
        // Parse the datetime string and convert to UTC
        const date = new Date(dateTimeString);
        const now = new Date();
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
          console.log("⚠️ Invalid date format");
          needsDateConfirmation = true;
          dateIssueReason = "Invalid date";
          // Return tomorrow at 10 AM as dummy date
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0);
          return tomorrow.toISOString();
        }
        
        // Check if date is in the past
        if (date < now) {
          console.log("⚠️ Date is in the past");
          needsDateConfirmation = true;
          dateIssueReason = "Past date";
          // Return tomorrow at 10 AM as dummy date
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(10, 0, 0, 0);
          return tomorrow.toISOString();
        }
        
        return date.toISOString();
      } catch (error) {
        console.log("⚠️ Date conversion error:", error);
        needsDateConfirmation = true;
        dateIssueReason = "Date error";
        // Fallback: tomorrow at 10 AM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        return tomorrow.toISOString();
      }
    };

    const utcStartTime = convertToUTC(args.startTime);
    console.log("🕐 Converted time:", args.startTime, "→", utcStartTime);
    
    if (needsDateConfirmation) {
      console.log("⚠️ Using dummy date due to:", dateIssueReason);
    }

    // Compact but complete booking details
    const bookingDetails = `RIDE BOOKING ${needsDateConfirmation ? '⚠️ CONFIRM DATE' : ''}
Customer: ${args.name}
Phone: ${args.phoneNumber}
Vehicle: ${args.metadata?.car_selected || "Standard"}
Pickup: ${args.metadata?.pickup_location || "TBD"}
Drop-off: ${args.metadata?.destination || "TBD"}
Notes: ${args.metadata?.special_attention || "None"}
Source: Retell AI${needsDateConfirmation ? '\nRequested: ' + args.startTime : ''}`;

    const calPayload = {
      start: utcStartTime, // Use converted UTC time (or dummy if needed)
      attendee: {
        name: args.name,
        email: args.email || "Blackstonechauffeur@gmail.com",
        timeZone: args.timeZone
      },
      eventTypeId: Number(process.env.CAL_EVENT_TYPE_ID || args.eventTypeId),
      bookingFieldsResponses: {
        notes: bookingDetails
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
    console.log("✅ Cal.com response:", response.status);

    // Send response back to Retell
    if (response.ok) {
      const baseMessage = `Perfect! Your ${args.metadata?.car_selected || 'ride'} is booked from ${args.metadata?.pickup_location || 'pickup'} to ${args.metadata?.destination || 'destination'}.`;
      
      const message = needsDateConfirmation 
        ? `${baseMessage} However, I need to confirm the date and time with you. We've scheduled a placeholder, but someone will call you back to confirm the exact date.`
        : `${baseMessage} Scheduled for ${args.startTime}. Booking confirmed!`;
      
      console.log("📞 Retell response:", message);
      return NextResponse.json(message);
    } else {
      // Extract and return actual error message
      console.log("❌ Cal.com error:", JSON.stringify(result, null, 2));
      
      // Try to extract the most relevant error message
      const errorMessage = result.error?.message 
        || result.message 
        || result.error 
        || `Booking failed with status ${response.status}: ${JSON.stringify(result)}`;
      
      console.log("❌ Retell error response:", errorMessage);
      return NextResponse.json(errorMessage);
    }

  } catch (error) {
    console.error("💥 Error:", error);
    return NextResponse.json(`Technical error: ${error.message || error}`);
  }
}
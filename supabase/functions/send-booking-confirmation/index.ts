// Retired onsite-calendar mailer. Calendly is the booking authority now.
// This endpoint previously trusted an anonymous caller's recipient and booking
// details. Keep an explicit tombstone so an old deployed URL cannot send mail.
Deno.serve((request) => request.method === 'OPTIONS'
  ? new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  : Response.json({ success: false, error: 'Onsite booking confirmation is retired. Please use the Calendly booking flow.' }, {
    status: 410, headers: { 'Cache-Control': 'no-store' },
  }));

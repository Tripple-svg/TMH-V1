import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { bookingId, reviewId, fullName, email, whatsapp, brandName, bookedDate, bookedTime } = await request.json();
    if (!bookingId || !fullName || !email || !whatsapp || !bookedDate || !bookedTime) throw new Error('Incomplete booking details.');
    const name = fullName.trim().split(/\s+/)[0];
    const date = new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(`${bookedDate}T12:00:00Z`));
    const text = `Hi ${name},\n\nYour TMH strategy call is confirmed for ${date} at ${bookedTime} WAT.\n\nWe’ll discuss ${brandName || 'your brand'}, your diagnostic, and the clearest next steps. Please be ready at your WhatsApp number; the TMH team will call you.\n\n— The Marketing Haven Team`;
    const html = `<p>Hi ${name},</p><p>Your TMH strategy call is confirmed for <strong>${date} at ${bookedTime} WAT</strong>.</p><p>We’ll discuss ${brandName || 'your brand'}, your diagnostic, and the clearest next steps. Please be ready at your WhatsApp number; the TMH team will call you.</p><p>— The Marketing Haven Team</p>`;
    const resend = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), to: [email], subject: 'Your Strategy Call is Confirmed', text, html }) });
    if (!resend.ok) throw new Error(`Resend error: ${await resend.text()}`);
    const whatsappTemplate = `Hi ${name}, your TMH strategy call is confirmed for ${date} at ${bookedTime} WAT. The TMH team will call you on this number.`;
    console.log(`[WhatsApp pending] ${whatsapp}: ${whatsappTemplate}`);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await admin.from('strategy_call_bookings').update({ confirmation_email_sent: true, confirmation_whatsapp_sent: false, whatsapp_message_template: whatsappTemplate }).eq('id', bookingId);
    if (reviewId) await admin.from('brand_reviews').update({ booking_whatsapp_sent: false, converted_to_call: true, call_booked_at: new Date().toISOString(), followup_status: 'booked' }).eq('id', reviewId);
    return Response.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400, headers: corsHeaders });
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Supabase Database Webhooks wrap the inserted row in `record`; direct invokes
    // send the row itself. Supporting both keeps the function usable either way.
    const payload = await request.json();
    const { email, full_name: fullName, fullName: camelName, brand_name: brandNameSnake, brandName: brandNameCamel, id } = payload.record ?? payload;
    const recipientName = fullName || camelName;
    const brandName = brandNameSnake || brandNameCamel;
    if (!email || !recipientName || !brandName) throw new Error('email, full_name, and brand_name are required.');
    const firstName = recipientName.trim().split(/\s+/)[0];
    const subject = `Your Free Brand Review is Ready, ${firstName}`;
    const text = `Hi ${firstName},\n\nThanks for requesting your free brand review with The Marketing Haven.\n\nHaven is already analysing ${brandName} and will guide you through your brand diagnostic right now.\n\nHead back to themarketinghaven.xyz to continue your conversation with Haven.\n\nThis review is completely free — no strings attached.\n\n— The Marketing Haven Team`;
    const html = `<p>Hi ${firstName},</p><p>Thanks for requesting your free brand review with The Marketing Haven.</p><p>Haven is already analysing <strong>${brandName}</strong> and will guide you through your brand diagnostic right now.</p><p>Head back to <a href="https://themarketinghaven.xyz">themarketinghaven.xyz</a> to continue your conversation with Haven.</p><p>This review is completely free — no strings attached.</p><p>Team Haven</p>`;
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL'), to: [email], subject, text, html }) });
    if (!response.ok) throw new Error(`Resend error: ${await response.text()}`);
    if (id) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await admin.from('brand_reviews').update({ welcome_email_sent: true }).eq('id', id);
    }
    return Response.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400, headers: corsHeaders });
  }
});

// Only call this with signature-verified webhook data or Calendly API responses.
export async function saveCalendlyBooking(supabase: any, event: Record<string, any>, invitee: Record<string, any>, review: any, intent: any) {
  const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  const eventUri = event.uri;
  if (typeof eventUri !== 'string' || !/^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9_-]+$/.test(eventUri)) throw new Error('Invalid Calendly event URI');
  const email = String(invitee.email || '').trim().toLowerCase();
  const inviteeUri = invitee.uri;
  if (typeof inviteeUri !== 'string' || !inviteeUri.startsWith(`${eventUri}/invitees/`) || !/^[A-Za-z0-9_-]+$/.test(inviteeUri.slice(`${eventUri}/invitees/`.length))) throw new Error('Invalid Calendly invitee URI');
  const { error } = await supabase.rpc('record_strategy_call_booking', { p_booking: {
    invitee_uri: inviteeUri, event_uri: eventUri, email,
    full_name: typeof invitee.name === 'string' ? invitee.name.slice(0,200) : null,
    event_name: typeof event.name === 'string' ? event.name.slice(0,200) : null,
    start_time: date(event.start_time), end_time: date(event.end_time),
    timezone: typeof invitee.timezone === 'string' ? invitee.timezone.slice(0,100) : null,
    status: event.status === 'canceled' || invitee.status === 'canceled' ? 'canceled' : 'active',
    source: intent ? 'service' : review ? 'lead' : 'calendly',
    review_id: review?.id || null, booking_intent_id: intent?.id || null,
    service_id: intent?.service_id || null, provider_created_at: date(invitee.created_at) || date(event.created_at),
  } });
  if (error) throw new Error('Unable to save booking');
}

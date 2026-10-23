export class ModerationError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function drainModerationNotifications(supabase: any, target: { reviewId?: string; visitorId?: string } = {}) {
  let query = supabase.from('flag_alert_notifications')
    .select('id,sent_at,customer_required,customer_sent_at')
    .or('sent_at.is.null,and(customer_required.eq.true,customer_sent_at.is.null)')
    .order('created_at', { ascending: true }).limit(10);
  if (target.reviewId) query = query.eq('review_id', target.reviewId);
  else if (target.visitorId) query = query.eq('visitor_id', target.visitorId);
  let data: any, error: any;
  try { ({ data, error } = await query); }
  catch { return { deliveryPending: true, attempted: 0 }; }
  if (error) return { deliveryPending: true, attempted: 0 };
  let pending = false;
  for (const notification of data || []) {
    const send = async (name: string) => {
      try {
        const result = await supabase.functions.invoke(name, { body: { notificationId: notification.id } });
        if (result.error || result.data?.ok !== true) pending = true;
      } catch { pending = true; }
    };
    if (!notification.sent_at) await send('send-flag-alert');
    // A team-provider failure must never suppress the customer's own notification.
    if (notification.customer_required && !notification.customer_sent_at) await send('send-flag-customer');
  }
  return { deliveryPending: pending || (data || []).length === 10, attempted: (data || []).length };
}

export async function applyAutomaticFlag(supabase: any, input: { reviewId?: string; visitorId?: string; sessionId?: string; eventKey: string; reason: string }) {
  if ((!input.reviewId && !input.visitorId) || (input.reviewId && !UUID.test(input.reviewId))
    || (input.visitorId && !UUID.test(input.visitorId)) || (input.sessionId && !UUID.test(input.sessionId)) || !/^[A-Za-z0-9:_-]{1,160}$/.test(input.eventKey)
    || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 2000) {
    throw new ModerationError('Invalid moderation event.', 400);
  }
  const { data, error } = await supabase.rpc('apply_haven_ai_flag', {
    p_review_id: input.reviewId || null, p_visitor_id: input.visitorId || null,
    p_event_key: input.eventKey, p_reason: input.reason.trim(),
    p_session_id: input.sessionId || null,
  });
  if (error || !data || !['white', 'yellow', 'red'].includes(data.flagStatus)) throw new ModerationError('Unable to record the moderation event.');
  const target = { reviewId: data.reviewId, visitorId: data.visitorId };
  const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(task: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime) {
    // A slow mail provider must not hold the user's chat response open. The
    // committed outbox remains available if the background task is interrupted.
    runtime.waitUntil(drainModerationNotifications(supabase, target));
    return { flagStatus: data.flagStatus as 'white' | 'yellow' | 'red', changed: data.changed === true, deliveryPending: true };
  }
  const delivery = await drainModerationNotifications(supabase, target);
  return { flagStatus: data.flagStatus as 'white' | 'yellow' | 'red', changed: data.changed === true, deliveryPending: delivery.deliveryPending };
}

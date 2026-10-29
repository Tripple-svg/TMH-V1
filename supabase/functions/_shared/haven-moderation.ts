import { internalHeaders } from './internal-auth.js';
import { invocationFailure } from './resend-delivery.js';
export class ModerationError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function drainModerationNotifications(supabase: any, target: { reviewId?: string; visitorId?: string } = {}) {
  let query = supabase.from('flag_alert_notifications')
    .select('id,sent_at,team_skipped_at,customer_required,customer_sent_at')
    .or('and(sent_at.is.null,team_skipped_at.is.null),and(customer_required.eq.true,customer_sent_at.is.null)')
    .order('created_at', { ascending: true }).limit(10);
  if (target.reviewId) query = query.eq('review_id', target.reviewId);
  else if (target.visitorId) query = query.eq('visitor_id', target.visitorId);
  let data: any, error: any;
  try { ({ data, error } = await query); }
  catch { return { deliveryPending: true, attempted: 0 }; }
  if (error) return { deliveryPending: true, attempted: 0 };
  let pending = false;
  const deliveryErrors: string[] = [];
  for (const notification of data || []) {
    const send = async (name: string) => {
      try {
        const result = await supabase.functions.invoke(name, { body: { notificationId: notification.id }, headers: internalHeaders(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) });
        if (result.error || result.data?.ok !== true) {
          pending = true;
          const diagnostic = await invocationFailure(result.data, result.error);
          deliveryErrors.push(diagnostic.code);
        }
      } catch { pending = true; }
    };
    // Both channels start independently, so one provider timeout cannot consume
    // the full admin request budget before the other channel is even attempted.
    await Promise.all([
      !notification.sent_at && !notification.team_skipped_at ? send('send-flag-alert') : Promise.resolve(),
      notification.customer_required && !notification.customer_sent_at ? send('send-flag-customer') : Promise.resolve(),
    ]);
  }
  return { deliveryPending: pending || (data || []).length === 10, attempted: (data || []).length, deliveryErrors: [...new Set(deliveryErrors)] };
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
    return { flagStatus: data.flagStatus as 'white' | 'yellow' | 'red', changed: data.changed === true, deliveryPending: true, strikes: Number(data.strikes || 0) };
  }
  const delivery = await drainModerationNotifications(supabase, target);
  return { flagStatus: data.flagStatus as 'white' | 'yellow' | 'red', changed: data.changed === true, deliveryPending: delivery.deliveryPending, strikes: Number(data.strikes || 0) };
}

// Obvious direct abuse is handled even if every model is unavailable. Specific
// product criticism, legal complaints and quoting an insult are not violations.
export function detectHavenAbuse(text: string) {
  const value = text.trim().toLowerCase().replaceAll('’', "'");
  if (/^(?:you(?:'re| are)|haven(?: is)?|tmh(?: is)?|the marketing haven(?: is)?)\s+(?:(?:so|an?|absolutely|really)\s+)*(?:stupid|idiot|useless|moron|dumb|fuck\w*|bitch)\b/.test(value)
    && !/\b(?:because|when|download|payment|broken|error|response|review|booking|website)\b/.test(value)) return 'ABUSE';
  if (/^(?:i(?:'ll| will| am going to)|we(?:'ll| will))\s+(?:kill|hurt|attack)\s+(?:you|your team|haven|tmh)\b/.test(value)) return 'HARASSMENT';
  if (/\b(?:your|francis|paschal|cto|team member(?:'s)?)\b.{0,30}\b(?:home address|private phone|personal phone number)\b/.test(value)) return 'PERSONAL_INFO';
  return null;
}
export function moderationReply(category: string) {
  return category === 'PERSONAL_INFO'
    ? 'I cannot share private contact details. You can reach the team at info@themarketinghaven.xyz. What do you need help with?'
    : 'Let us keep this respectful. What happened that you want the team to address: the review, a response, or something else?';
}

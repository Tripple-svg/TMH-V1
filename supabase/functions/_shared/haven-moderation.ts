import { internalHeaders } from './internal-auth.js';
import { invocationFailure } from './resend-delivery.js';
import { TEAM_NAMES } from './team-assignment-public.js';
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
const teamTarget = [...TEAM_NAMES.flatMap(name => [name, name.split(' ')[0]]), 'your founder', 'the founder', 'the ceo', 'your ceo', 'your team member'].join('|');
const personTarget = `(?:you|your team|${teamTarget})`;
const abusiveWord = '(?:stupid|idiot|moron|fool|dumb|bitch|asshole|piece of shit|fucking (?:stupid|idiot|moron|fool|dumb|bitch|asshole|useless))';
const clauseStart = '(?:^|[.!?;,]\\s*|\\n+|\\b(?:and|but)\\s+)';
const directInsult = new RegExp(`${clauseStart}(?:(?:you(?:'re| are)|(?:${teamTarget}) (?:is|are))\\s+(?:(?:so|an?|absolutely|really)\\s+)*${abusiveWord}\\b(?!\\s+(?:app|bot|review|website|service|answer|reply|question|system|idea|design|process)\\b)|(?:fuck|screw) (?:off\\b|${personTarget}\\b)|you can fuck off\\b)`, 'i');
const directedThreat = new RegExp(`${clauseStart}(?:(?:i|we)(?:'ll| will| am going to| are going to))\\s+(?:kill|hurt|attack)\\s+(?:${personTarget}|haven|tmh)\\b`, 'i');
const privateLocation = new RegExp(`^(?:please )?where (?:does|is) (?:${teamTarget})(?:\\s+(?:live|living|staying))?[?!.\\s]*$`, 'i');
const privateContact = new RegExp(`^(?:please |can you |could you )?(?:what is|what's|tell me|give me|send me|show me|i want|i need)\\b.{0,25}\\b(?:your|${teamTarget})(?:'s)?\\s+(?:home address|private phone|personal phone number|personal email)\\b`, 'i');
const directedSexual = new RegExp(`${clauseStart}(?:(?:(?:please|can you|could you) )?(?:send|show|give) me (?:your|(?:${teamTarget})'s) (?:nudes?|naked (?:photos?|pictures?))\\b|i want to have sex with ${personTarget}\\b)`, 'i');
const moderationMarker = /\[\[FLAG:([^\]\r\n]*)\]\]/gi;
const moderationCategory = /^(SEXUAL|PERSONAL_INFO|HARASSMENT|ABUSE)\|(.+)$/;
const explicitTarget = new RegExp(`\\b(?:you|your (?:team|staff|founder|ceo)|${teamTarget})\\b`, 'i');
const serviceComplaint = /\b(?:booking|checkout|download|payment|refund|review|website)\b|\b(?:charged me|ignored me|did(?:n't| not) reply)\b/i;
const reportedSpeech = /\b(?:(?:someone|they|a customer|a user|he|she|haven|your assistant) (?:said|wrote|called|asked|told|sent)|i(?:'m| am) (?:reporting|quoting))\b/i;

function unquotedText(text: string) {
  return text.replace(/"[^"\r\n]*"|“[^”\r\n]*”|‘[^’\r\n]*’|(?<!\w)'[^'\r\n]+'(?!\w)/g, ' ')
    .trim().toLowerCase().replaceAll('’', "'");
}

export const PRIVATE_CONTACT_REPLY = 'I can’t share personal numbers or private contact details. The team is at info@themarketinghaven.xyz, or you can use Contact Team Haven below.';
const namedContact = new RegExp(`\\b(?:${teamTarget})'s\\s+(?:(?:personal|private)\\s+)?(?:whatsapp|phone(?: number)?|number|email|contact details)\\b`, 'i');
export function requestsPrivateContact(text: string, lastReply: string) {
  const value = text.toLowerCase().replaceAll('’', "'");
  return namedContact.test(value)
    || (lastReply.startsWith(PRIVATE_CONTACT_REPLY) && /\b(?:number|whatsapp|contact|email|give it|tell me|come on)\b/.test(value));
}

export function detectHavenAbuse(text: string) {
  const unquoted = unquotedText(text);
  const reportStart = unquoted.search(reportedSpeech);
  const value = reportStart < 0 ? unquoted : unquoted.slice(0, reportStart).trimEnd();
  if (directedThreat.test(value)) return 'HARASSMENT';
  if (directedSexual.test(value)) return 'SEXUAL';
  if (directInsult.test(value)) return 'ABUSE';
  if (privateLocation.test(value) || privateContact.test(value)) return 'PERSONAL_INFO';
  return null;
}

export function readModelModeration(reply: string, latest: string) {
  const markers = [...reply.matchAll(moderationMarker)];
  const text = reply.replace(moderationMarker, '').replace(/\[\[FLAG:[^\r\n]*/gi, '').trim();
  if (markers.length !== 1 || /\[\[FLAG:/i.test(latest)) return { text, flag: null };
  const match = moderationCategory.exec(markers[0][1]);
  if (!match) return { text, flag: null };
  const evidence = match[2].trim();
  const unquoted = unquotedText(latest);
  const normalizedEvidence = evidence.toLowerCase().replaceAll('’', "'");
  const evidenceStart = unquoted.indexOf(normalizedEvidence);
  const supported = evidence.length >= 12 && evidence.length <= 240 && latest.includes(evidence)
    && evidenceStart >= 0 && explicitTarget.test(evidence) && !serviceComplaint.test(evidence)
    && !reportedSpeech.test(unquoted.slice(0, evidenceStart + normalizedEvidence.length));
  return { text, flag: supported ? match[1] : null };
}
export function moderationReply(category: string) {
  if (category === 'PERSONAL_INFO') return PRIVATE_CONTACT_REPLY;
  if (category === 'SEXUAL') return 'Let us keep the conversation respectful. What would you like help with in your marketing?';
  return 'Let us keep this respectful. What happened that you want the team to address: the review, a response, or something else?';
}

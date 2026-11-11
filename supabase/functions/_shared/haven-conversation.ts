import { hashReviewToken, verifyReviewAccess, ReviewAccessError } from './review-access.ts';
import { HavenRequestError, textValue } from './haven-request.ts';
import { savedConversationMemory } from './haven-memory.js';
export const CHAT_NOTICE_VERSION = '2026-10-26';
export const RESTRICTED_MESSAGE = 'Your access is currently restricted due to a violation of our terms. Please contact info@themarketinghaven.xyz.';
export const REVIEW_CONTEXT_QUESTION = 'Would you like me to use your saved Brand Review to answer this?';
export const REVIEW_CONTEXT_MARKER = '[[REVIEW_CONTEXT:ASK]]';
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export async function prepareConversation(supabase: any, scope: string, context: Record<string, any>, noticeVersion: unknown) {
  if (noticeVersion !== CHAT_NOTICE_VERSION) throw new HavenRequestError('Please refresh Haven to review the current chat privacy notice.', 400);
  if (!UUID.test(context.visitorId || '') || !/^[a-f\d]{64}$/i.test(context.visitorToken || '') || !UUID.test(context.sessionId || '')) {
    throw new ReviewAccessError('Your chat access could not be verified. Please refresh the page.', 403);
  }
  let verified = null;
  if (scope === 'audit' || context.reviewId || context.accessToken) {
    verified = await verifyReviewAccess(supabase, scope === 'audit' ? context.sessionId : context.reviewSessionId, context.reviewId, context.accessToken);
  }
  const { data, error } = await supabase.rpc('ensure_haven_conversation', {
    p_visitor_id: context.visitorId, p_token_hash: await hashReviewToken(context.visitorToken),
    p_session_id: context.sessionId, p_scope: scope, p_review_id: verified?.review.id || null,
    p_service_id: scope === 'service' && ['web','growth','content'].includes(context.serviceId) ? context.serviceId
      : scope === 'support' && context.entryContext === 'site_support' ? 'site-support'
        : scope === 'support' && context.entryContext === 'team_inquiry' ? 'team-inquiry' : null,
    p_consent_version: CHAT_NOTICE_VERSION,
  });
  if (error || !data?.session || !data?.visitor) {
    if (error?.code === '42501') throw new ReviewAccessError('Chat access denied.', 403);
    throw new HavenRequestError('Could not save your chat. Please try again.', 500);
  }
  // This identity comes from the verified visitor capability, across all chat scopes.
  if (data.visitor.flag_status === 'red') return { session: data.session, visitor: data.visitor, review: verified?.review || null, flagStatus: 'red' };
  let review = verified?.review || null;
  if (!review && data.visitor.review_id) {
    // A previously verified server-side link may enforce restrictions even if a
    // browser omits its local review profile; no email-based lookup is accepted.
    const { data: linked, error: linkedError } = await supabase.from('brand_reviews').select('*').eq('id', data.visitor.review_id).maybeSingle();
    if (linkedError) throw new HavenRequestError('Could not verify chat access.', 500);
    review = linked;
  }
  const flagStatus = review?.flag_status === 'red' ? 'red'
    : review?.flag_status === 'yellow' || data.visitor.flag_status === 'yellow' ? 'yellow' : 'white';
  return { session: data.session, visitor: data.visitor, review, flagStatus };
}

export async function loadLinkedReviewContext(supabase: any, review: any) {
  // The caller must use the review returned by prepareConversation, never a
  // client-supplied review or chat ID. Read only the original review's notes.
  const { data: proof, error: proofError } = await supabase.from('review_access_tokens')
    .select('session_id').eq('review_id', review.id).maybeSingle();
  if (proofError) throw new HavenRequestError('Could not read your saved Brand Review. Please try again.', 503);
  const { data: audit, error } = proof?.session_id
    ? await supabase.from('haven_sessions').select('conversation_memory').eq('id', proof.session_id)
      .eq('review_id', review.id).eq('scope', 'audit').maybeSingle()
    : { data: null, error: null };
  if (error) throw new HavenRequestError('Could not read your saved Brand Review. Please try again.', 503);
  const facts = savedConversationMemory(audit?.conversation_memory).facts;
  return {
    brandName: textValue(review.brand_name, 200), goal: textValue(review.main_goal, 500),
    presenceType: textValue(review.platform_type, 80),
    score: review.scrape_state === 'valid' && Number.isInteger(review.haven_score)
      && review.haven_score >= 0 && review.haven_score <= 100 ? review.haven_score : null,
    notes: Object.fromEntries(Object.entries(facts).map(([field, note]) => [field, note.quote])),
  };
}

export function substantiveAnswer(text: string) {
  const normalized = text.trim().replaceAll('’', "'").replace(/^i'd\b/i, 'I would');
  return normalized.length >= 12 && !/^(?:yes|no|ok(?:ay)?|thanks|thank you|(?:i (?:want|need|would like) (?:to )?)?(?:book|schedule|arrange)(?: me)? (?:a )?(?:strategy )?call|(?:i (?:want|need|would like) (?:the )?)?(?:playbook|a call))[.!?\s]*$/i.test(normalized);
}
export function explicitCallRequest(text: string) {
  const normalized = text.replaceAll('’', "'").replace(/\bi'd\b/gi, 'I would');
  return !/\b(?:don'?t|do not|no|not ready|rather not)\b.{0,30}\bcall\b/i.test(normalized)
    && /\b(?:(?:can|could|may) (?:i|we)|i (?:want|need|would like)|(?:please )?(?:book|schedule|arrange))\b.{0,45}\bcall\b|\bcall me\b/i.test(normalized);
}

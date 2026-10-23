// A private bearer capability binds a visitor to one saved review and audit session.
// Only its SHA-256 digest is stored; never include the token or digest in logs/API lists.
export class ReviewAccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}

export async function hashReviewToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function validReviewCredentials(sessionId: unknown, reviewId: unknown, token: unknown): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof sessionId === 'string' && uuid.test(sessionId)
    && typeof reviewId === 'string' && uuid.test(reviewId)
    && typeof token === 'string' && /^[0-9a-f]{64}$/i.test(token);
}

function equalDigest(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function verifyReviewAccess(supabase: any, sessionId: unknown, reviewId: unknown, accessToken: unknown) {
  if (!validReviewCredentials(sessionId, reviewId, accessToken)) {
    throw new ReviewAccessError('Review access credentials are required.', 403);
  }
  const { data: session, error: sessionError } = await supabase.from('haven_sessions')
    .select('id, review_id, scope, current_step, last_step_reached').eq('id', sessionId).maybeSingle();
  if (sessionError) throw new ReviewAccessError('Unable to verify the saved session.', 500);
  if (!session || session.scope !== 'audit' || session.review_id !== reviewId) {
    throw new ReviewAccessError('Review access denied.');
  }
  const { data: proof, error: proofError } = await supabase.from('review_access_tokens')
    .select('token_hash').eq('review_id', reviewId).eq('session_id', sessionId).maybeSingle();
  if (proofError) throw new ReviewAccessError('Unable to verify review access.', 500);
  if (!proof || !equalDigest(proof.token_hash, await hashReviewToken(accessToken as string))) {
    throw new ReviewAccessError('Review access denied.');
  }
  const { data: review, error: reviewError } = await supabase.from('brand_reviews')
    .select('*').eq('id', reviewId).maybeSingle();
  if (reviewError) throw new ReviewAccessError('Unable to read the saved review.', 500);
  if (!review) throw new ReviewAccessError('Review access denied.');
  return { session, review };
}

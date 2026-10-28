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

export async function storedReviewScreenshot(supabase: any, review: Record<string, any>) {
  const path=review.screenshot_url;
  if(typeof path!=='string'||!path.startsWith(review.id+'/')||path.includes('..')) throw new ReviewAccessError('The saved screenshot is unavailable. Upload a replacement.',409);
  const {data,error}=await supabase.storage.from('tmh-screenshots').download(path);
  if(error||!data) throw new ReviewAccessError('The saved screenshot could not be read. Try again or upload a replacement.',503);
  const mime=String(data.type||'').split(';')[0].toLowerCase();
  if(!['image/png','image/jpeg','image/webp'].includes(mime)||data.size>5*1024*1024) throw new ReviewAccessError('Upload a PNG, JPEG or WebP screenshot smaller than 5 MB.',400);
  const bytes=new Uint8Array(await data.arrayBuffer());
  let binary='';
  for(let index=0;index<bytes.length;index+=4096) binary+=String.fromCharCode(...bytes.subarray(index,index+4096));
  return 'data:'+mime+';base64,'+btoa(binary);
}

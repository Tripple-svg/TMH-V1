import { edgeClientAddress } from './edge-client-address.ts';
import { HavenRequestError } from './haven-request.ts';
import { requestBucket } from './playbook-recovery.ts';
import { publicRequestLimit } from './abuse-limits.ts';

export class ReviewAttemptError extends HavenRequestError {
  constructor(public blocked: boolean, retryAfter = 0, public lockedUntil?: number) {
    super(blocked ? 'You have reached the maximum number of attempts. Please contact support.'
      : 'Too many review attempts. Please wait before trying again.', 429, retryAfter);
  }
}

export async function reviewAttemptGate(db: any, request: Request, secret: string, failure = false, throttled = false) {
  const { data, error } = await db.rpc('review_attempt_gate', {
    p_network: await requestBucket(request, secret),
    p_failure: failure,
    p_identified: edgeClientAddress(request) !== 'unknown',
    p_throttled: throttled,
  });
  if (error || typeof data?.allowed !== 'boolean') {
    throw new HavenRequestError('Review security checks are temporarily unavailable. Please try again.', 503);
  }
  if (!data.allowed) throw new ReviewAttemptError(data.blocked === true, Number(data.retryAfter) || 0, Number(data.lockedUntil) || undefined);
}

export async function enforceReviewRequestBudget(db: any, request: Request, secret: string, action: string) {
  await reviewAttemptGate(db,request,secret);
  try {
    await publicRequestLimit(db,request,secret,action);
  } catch (error) {
    if (error instanceof HavenRequestError && error.status === 429) await reviewAttemptGate(db,request,secret,false,true);
    throw error;
  }
}

export function reviewLimitDetails(error: HavenRequestError) {
  const blocked = error instanceof ReviewAttemptError && error.blocked;
  const retryAfter = blocked ? 0 : error.retryAfter || 600;
  const lockedUntil = error instanceof ReviewAttemptError ? error.lockedUntil : undefined;
  return { code: blocked ? 'review_blocked' : 'review_cooldown', retryAfter, lockedUntil };
}

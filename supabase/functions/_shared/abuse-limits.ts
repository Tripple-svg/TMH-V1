import { HavenRequestError } from './haven-request.ts';
import { requestBucket } from './playbook-recovery.ts';

// Server-enforced, atomic budgets. A caller cannot reset a network bucket by
// changing email, reference, local storage, or the frontend's disabled buttons.
export async function publicRequestLimit(db: any, request: Request, secret: string, action: string, max = 5, seconds = 600) {
  const bucket = 'public:' + action + ':' + await requestBucket(request, secret);
  const { data, error } = await db.rpc('consume_playbook_limit', { p_bucket: bucket, p_max: max, p_seconds: seconds });
  if (error) throw new HavenRequestError('Request security checks are unavailable. Please try again shortly.', 503);
  if (data !== true) throw new HavenRequestError(`Too many attempts. Please wait ${Math.ceil(seconds/60)} minutes before trying again.`, 429, seconds);
}

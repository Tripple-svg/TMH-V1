import { edgeClientAddress } from './edge-client-address.ts';
import { HavenRequestError } from './haven-request.ts';
import { codeHash } from './playbook-recovery.ts';

export const DELETED_REVIEW = 'This email has already utilized its free review and deleted its data. Please contact Team Haven.';
export const DELETED_REVIEW_NETWORK = 'Free reviews are temporarily paused on this network. Try again later or contact Team Haven for help.';
export const DELETION_ALREADY_PROCESSED = 'A deletion request has already been processed for this email. Please contact Team Haven for further assistance.';

export function deletionEmailHash(email: string, serviceKey: string) {
  return codeHash('review-deletion-email-v1', email.trim().toLowerCase(), serviceKey);
}

export function deletionNetworkHash(request: Request, serviceKey: string) {
  const address = edgeClientAddress(request);
  return address === 'unknown' ? null : codeHash('review-deletion-network-v1', address, serviceKey);
}

export async function reviewDeletionStatus(db: any, email: string, emailHash: string, networkHash: string | null) {
  const { data, error } = await db.rpc('review_deletion_status', {
    p_email: email, p_email_hash: emailHash, p_network_hash: networkHash,
  });
  if (error) throw new HavenRequestError('We could not check review access. Please try again shortly.', 503);
  return data;
}

export function deletionReviewDenial(status: unknown) {
  if (status === 'email') return { code: 'review_email_deleted', error: DELETED_REVIEW };
  if (status === 'network') return { code: 'review_network_deleted', error: DELETED_REVIEW_NETWORK };
  return null;
}

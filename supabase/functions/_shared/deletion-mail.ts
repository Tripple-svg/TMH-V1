import { privacyEmail, emailFooterText } from './email-template.js';
import { logEvent } from './logger.ts';

export function createDeletionToken() {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  return `${crypto.randomUUID()}${suffix}`;
}

async function sendDeletionMail(key: string, email: string, subject: string, html: string, text: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'info@themarketinghaven.xyz', to: [email], subject, html, text }),
  });
  await response.body?.cancel();
  return response.status;
}

export async function sendDeletionLink(key: string, email: string, token: string) {
  const href = `https://themarketinghaven.xyz/data-deletion/confirm?token=${encodeURIComponent(token)}`;
  const scope = 'We received a request to remove your saved brand review, linked chat sessions and support requests, and stored screenshots.';
  const retained = 'We retain a limited record to prevent repeat free reviews. Purchase, booking, security and delivery records, and unlinked guest chats, are outside this automated flow. Contact info@themarketinghaven.xyz about other records.';
  const instructions = 'Use the secure link before it expires. If you did not request this, ignore this email.';
  return sendDeletionMail(key, email, 'Confirm your saved review deletion request',
    privacyEmail({ title: 'Your review. Your choice.', paragraphs: [scope, retained, instructions], button: { label: 'Review deletion request', href } }),
    emailFooterText(`${scope}\n\n${retained}\n\n${instructions}\n\n${href}`));
}

export async function sendDeletionConfirmation(email: string, requestId: string) {
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!key) { logEvent('error','confirm-data-deletion.diagnostic_1',requestId); return; }
  const removed = 'Your request removed matching saved brand reviews, linked chat sessions and support requests, and stored screenshots.';
  const remaining = 'We retain a limited record to prevent repeat free reviews. You can keep using the site. Contact info@themarketinghaven.xyz to discuss another review or remaining records, including purchase, booking and delivery records and unlinked guest chats.';
  try {
    const status = await sendDeletionMail(key, email, 'Your saved review deletion is complete',
      privacyEmail({ title: 'Your saved review has been removed.', paragraphs: [removed, remaining] }),
      emailFooterText(`${removed}\n\n${remaining}\n\nYour friends over at Team Haven`));
    if (status < 200 || status >= 300) logEvent('error','confirm-data-deletion.email_http_' + status,requestId);
  } catch { logEvent('error','confirm-data-deletion.diagnostic_3',requestId); }
}

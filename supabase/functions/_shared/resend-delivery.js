// Only allowlisted diagnostics leave the server. Never log credentials or raw responses.
export class MailDeliveryError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export function mailConfiguration(env) {
  const key = (env.get('RESEND_API_KEY') || '').trim();
  if (!key) throw new MailDeliveryError('missing_resend_key', 'RESEND_API_KEY is missing in Supabase secrets.', 503);
  const from = (env.get('RESEND_FROM_EMAIL') || 'The Marketing Haven <info@themarketinghaven.xyz>').trim();
  if (!/^(?:[^<>\r\n]+ <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/.test(from) || from.includes('resend.dev')) {
    throw new MailDeliveryError('invalid_resend_sender', 'Set RESEND_FROM_EMAIL to an address on your verified Resend domain.', 503);
  }
  return { key, from };
}

// Read-only account check. A sending-only key may send perfectly well while
// being forbidden to list domains; never misreport that as verified or invalid.
export async function checkMailConfiguration(env) {
  const configuration = mailConfiguration(env);
  const mailbox = configuration.from.match(/<([^<>]+)>$/)?.[1] || configuration.from;
  const domain = mailbox.split('@')[1].toLowerCase();
  let after = '';
  for (let page = 0; page < 10; page++) {
    let response;
    try {
      response = await fetch(`https://api.resend.com/domains?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, {
        headers: { Authorization: `Bearer ${configuration.key}` }, signal: AbortSignal.timeout(15000),
      });
    } catch { throw new MailDeliveryError('resend_network_error', 'Could not check Resend. Try again shortly.'); }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      if (body?.name === 'restricted_api_key' || body?.name === 'invalid_permission') return {
        ok: true, configured: true, from: configuration.from, verification: 'requires_dashboard',
        message: 'The configured key cannot list domains. Check this exact sender domain in Resend → Domains; do not broaden the key just for this check.',
      };
      throw providerFailure(response.status, body);
    }
    if (!Array.isArray(body?.data)) throw new MailDeliveryError('resend_domain_check_invalid', 'Could not confirm the sender domain from Resend. Check Resend → Domains.');
    const match = body.data.find((item) => item.name?.toLowerCase() === domain);
    if (match) {
      const verified = match.status === 'verified' && match.capabilities?.sending !== 'disabled';
      return { ok: true, configured: true, from: configuration.from, verification: verified ? 'verified' : 'unverified',
        message: verified ? 'The sender domain is verified for sending in this Resend account. This check sends no email.' : 'This exact sender domain is not verified for sending. Finish DNS verification in Resend before retrying emails.' };
    }
    if (!body.has_more) return { ok: true, configured: true, from: configuration.from, verification: 'unverified', message: 'This exact sender domain is not in the Resend account for this API key. Verify it, or set RESEND_FROM_EMAIL to your verified subdomain sender.' };
    const cursor = body.data.at(-1)?.id;
    if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(cursor)) break;
    after = cursor;
  }
  return { ok: true, configured: true, from: configuration.from, verification: 'requires_dashboard', message: 'The domain check could not finish. Check the exact sender domain in Resend → Domains.' };
}

export function providerFailure(status, body) {
  const name = typeof body?.name === 'string' ? body.name : '';
  const message = typeof body?.message === 'string' ? body.message.toLowerCase() : '';
  if (message.includes('domain') && (message.includes('not verified') || message.includes('verify'))) return new MailDeliveryError('resend_domain_unverified', 'Verify the exact sender domain in Resend, then retry.');
  if (message.includes('testing emails') || message.includes('own email address')) return new MailDeliveryError('resend_test_recipient_restricted', 'Resend is restricting test recipients. Verify your sender domain and use an API key allowed to send from it.');
  if (name === 'missing_api_key' || (message.includes('api key') && /invalid|not active|suspended/.test(message))) return new MailDeliveryError('resend_key_invalid', 'Replace RESEND_API_KEY with an active Resend sending key for this account.');
  if (['restricted_api_key', 'invalid_permission'].includes(name)) return new MailDeliveryError('resend_key_restricted', 'Check the Resend key permissions and its allowed sending domain.');
  if (['daily_quota_exceeded', 'monthly_quota_exceeded', 'rate_limit_exceeded'].includes(name)) return new MailDeliveryError(`resend_${name}`, 'Resend has reached a sending limit. Retry after the limit resets or update the Resend plan.');
  if (name === 'invalid_idempotent_request') return new MailDeliveryError('resend_payload_changed', 'A previous attempt used different email content with this reference. Keep the payload unchanged before retrying.');
  if (name === 'concurrent_idempotent_requests') return new MailDeliveryError('resend_request_in_progress', 'An email attempt is already in progress. Wait briefly, then refresh its saved status.');
  return new MailDeliveryError(`resend_http_${status}`, `Resend rejected the email (HTTP ${status}). Review this request in Resend Logs, then retry.`);
}

export async function deliverEmail(configuration, payload, idempotencyKey) {
  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${configuration.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ ...payload, from: configuration.from }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new MailDeliveryError('resend_network_error', 'Resend could not be reached. Retry this saved notification.'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw providerFailure(response.status, body);
  if (typeof body?.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(body.id)) throw new MailDeliveryError('invalid_resend_acceptance', 'Resend acceptance could not be confirmed. Retry this saved notification.');
  return body.id;
}

export async function invocationFailure(data, error) {
  let body = data;
  if (error?.context instanceof Response) body = await error.context.clone().json().catch(() => null);
  const code = typeof body?.code === 'string' && /^[a-z0-9_]{1,100}$/.test(body.code) ? body.code
    : error?.context?.status ? `email_function_http_${error.context.status}` : 'email_function_unavailable';
  // Arbitrary function/provider bodies are never passed through to the browser.
  return { code, error: `Email is pending (${code}). Check the saved delivery diagnostic and Resend Logs before retrying.` };
}

export async function deliverFlagNotification(supabase, event, channel, payload, env) {
  const sentColumn = channel === 'team' ? 'sent_at' : 'customer_sent_at';
  const idColumn = `${channel}_email_id`, errorColumn = `${channel}_last_error`;
  let acceptedId = typeof event[idColumn] === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(event[idColumn]) ? event[idColumn] : null;
  try {
    const { data: attempt, error: trackingError } = await supabase.from('flag_alert_notifications')
      .update({ [`${channel}_attempted_at`]: new Date().toISOString(), [errorColumn]: null })
      .eq('id', event.id).select('id').maybeSingle();
    if (trackingError || !attempt) throw new MailDeliveryError('flag_delivery_tracking_unavailable', 'Apply the email diagnostics migration before retrying.', 500);
    if (!acceptedId) acceptedId = await deliverEmail(mailConfiguration(env), payload, `flag-${channel === 'team' ? 'alert' : 'customer'}/${event.id}`);
    const { data: saved, error } = await supabase.from('flag_alert_notifications')
      .update({ [sentColumn]: new Date().toISOString(), [idColumn]: acceptedId, [errorColumn]: null })
      .eq('id', event.id).select('id').maybeSingle();
    if (error || !saved) throw new MailDeliveryError('flag_delivery_marker_failed', 'Resend accepted the email but its saved status needs repair. Retry safely.', 500);
  } catch (error) {
    const failure = error instanceof MailDeliveryError ? error : new MailDeliveryError('flag_delivery_failed', 'Unable to process the saved flag notification.');
    await supabase.from('flag_alert_notifications').update({ [errorColumn]: failure.code, ...(acceptedId ? { [idColumn]: acceptedId } : {}) })
      .eq('id', event.id).is(sentColumn, null);
    console.error(`flag-${channel}: ${failure.code}`);
    throw failure;
  }
}

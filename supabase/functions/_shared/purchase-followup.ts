import { editorialEmail, escapeHtml } from './email-template.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SIGNATURE = /^[a-f0-9]{64}$/;
const text = new TextEncoder();
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const keyFor = (secret: string) => crypto.subtle.importKey('raw', text.encode('haven-purchase-followup-v1:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export async function followupOptOutUrl(projectUrl: string, id: string, dueAt: string, secret: string) {
  const project = new URL(projectUrl);
  if (project.protocol !== 'https:' || !project.hostname.endsWith('.supabase.co') || !UUID.test(id)) throw new Error('Invalid follow-up configuration');
  const expires = String(Date.parse(dueAt) + 30 * 86400000);
  if (!/^\d{13}$/.test(expires)) throw new Error('Invalid follow-up timestamp');
  const signature = hex(await crypto.subtle.sign('HMAC', await keyFor(secret), text.encode(id + ':' + expires)));
  const url = new URL('/functions/v1/playbook-followup-unsubscribe', project);
  url.search = new URLSearchParams({ id, expires, signature }).toString();
  return url.toString();
}

export async function verifyFollowupOptOut(url: URL, secret: string) {
  const id = url.searchParams.get('id') || '', expires = url.searchParams.get('expires') || '', signature = url.searchParams.get('signature') || '';
  if (!UUID.test(id) || !/^\d{13}$/.test(expires) || Number(expires) < Date.now() || !SIGNATURE.test(signature)) return null;
  const bytes = Uint8Array.from(signature.match(/.{2}/g)!, value => Number.parseInt(value, 16));
  return await crypto.subtle.verify('HMAC', await keyFor(secret), bytes, text.encode(id + ':' + expires)) ? id : null;
}

export function purchaseFollowupPayload(job: { email: string; first_name?: string | null }, unsubscribe: string) {
  const name = typeof job.first_name === 'string' ? job.first_name.replace(/[\u0000-\u001f\u007f]/g, '').trim().split(/\s+/)[0].slice(0, 60) : '';
  const paragraphs = [name ? 'Hey ' + name + ',' : 'Hey there,',
    'Did you get a chance to open Chapter 5, The Shift From Knowing to Doing?',
    'You do not need to work on everything at once. Choose one thing you offer, the buyer problem it addresses, and one action you can put into practice.',
    'If applying it calls for research or hands-on work, our team can discuss what support would fit your brand. You can explore our services below.',
    'If you have not started reading yet, there is no rush. If you need help opening your copy, reply to this email.'];
  const notice = 'You opted in at checkout to this one-time Playbook check-in. No follow-up sequence is scheduled.';
  return {
    to: [job.email], reply_to: 'info@themarketinghaven.xyz', subject: 'Did you get a chance to read The Playbook?',
    text: paragraphs.join('\n\n') + '\n\nExplore TMH Services: https://themarketinghaven.xyz/#services\n\nYour friends over at Team Haven\nBuilding with intention.\n\n' + notice + '\nCancel this check-in: ' + unsubscribe,
    html: editorialEmail({ version: 'editorial-v3', label: 'YOUR NEXT STEP', title: 'One idea. One useful action.', paragraphs,
      button: { label: 'Explore TMH Services', href: 'https://themarketinghaven.xyz/#services' } })
      .replace('</body>', '<p style="max-width:560px;margin:16px auto;padding:0 16px;font:11px/1.6 Arial,sans-serif;color:#71717a;">' + escapeHtml(notice) + ' <a style="color:#52525b;" href="' + escapeHtml(unsubscribe) + '">Cancel this check-in</a>.</p></body>'),
    headers: { 'List-Unsubscribe': '<' + unsubscribe + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

// Inline, table-based email layout works without external styles or remote fonts.
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/** @param {{label?: string, title: string, paragraphs?: string[], details?: Array<[string, unknown]>, button?: {label: string, href: string}, version?: string}} options */
export function editorialEmail({ label = 'A NOTE FROM TEAM HAVEN', title, paragraphs = [], details = [], button, version = 'editorial-v3' }) {
  const safe = escapeHtml;
  // Pending v1/v2 notifications keep their byte-identical payload and provider key.
  const current = version === 'editorial-v3';
  const href = button && /^(https:\/\/themarketinghaven\.xyz(?:\/|$)|mailto:info@themarketinghaven\.xyz$)/.test(button.href) ? button.href : null;
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f2f1ee;color:#27272a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f1ee;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dededb;border-radius:8px;">
<tr><td style="padding:24px 28px;background:#18181b;color:#fafafa;font:600 12px Arial,sans-serif;letter-spacing:2px;">THE MARKETING HAVEN</td></tr>
<tr><td style="padding:32px 28px;font:16px/1.7 Arial,Helvetica,sans-serif;">
<p style="margin:0 0 16px;font-size:10px;letter-spacing:2px;color:#71717a;">${safe(label)}</p>
<h1 style="margin:0 0 24px;color:#18181b;font:normal 30px/1.2 Georgia,serif;">${safe(title)}</h1>
${paragraphs.map((paragraph) => `<p style="margin:0 0 18px;">${safe(paragraph)}</p>`).join('')}
${details.length ? `<table role="presentation" width="100%" style="margin:24px 0;border-top:1px solid #e4e4e7;font:13px/1.6 Arial,sans-serif;">${details.map(([key, value]) => `<tr><td style="padding:10px 12px 10px 0;vertical-align:top;color:#71717a;">${safe(key)}</td><td style="padding:10px 0;overflow-wrap:anywhere;">${safe(value)}</td></tr>`).join('')}</table>` : ''}
${href ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td bgcolor="#18181b" style="border-radius:4px;"><a href="${safe(href)}" style="display:inline-block;padding:15px 24px;border:1px solid #18181b;border-radius:4px;color:#fff;background:#18181b;text-decoration:none;font:bold 14px Arial,sans-serif;">${safe(button.label)}</a></td></tr></table><p style="font-size:12px;color:#71717a;word-break:break-all;">Button not opening? <a href="${safe(href)}" style="color:#52525b;">${safe(href)}</a></p>` : ''}
<p style="margin:30px 0 0;padding-top:20px;border-top:1px solid #e4e4e7;color:#52525b;">${current ? 'Your friends over at Team Haven' : 'Talk soon,<br>Team Haven'}</p>
</td></tr></table><p style="font:11px/1.6 Arial,sans-serif;color:#71717a;">${current ? 'Building with intention.' : 'Clarity. Direction. Work that matters.'}</p></td></tr></table></body></html>`;
}

function purchaseEmailV1(reference = '') {
  const paragraphs = ['Hi there,', 'Thank you for purchasing The Unseen Playbook. Your copy is ready.',
    'Keep this email if you need another copy. The button takes you to our Shop; open the Playbook panel to download.',
    'On a different device, choose Already purchased? and verify your checkout email and Paystack reference.',
    'Need further guidance? Verify in the Shop, then ask Haven how to apply an idea to your business. You can also reply to this email for help.'];
  return { text: `${paragraphs.join('\n\n')}${reference ? `\n\nYour Paystack reference: ${reference}` : ''}\n\nAccess Your Playbook: https://themarketinghaven.xyz/#shop\n\nTalk soon,\nTeam Haven.`,
    html: editorialEmail({ version: 'editorial-v1', label: 'YOUR PLAYBOOK', title: 'A clearer next move.', paragraphs, details: reference ? [['Your Paystack reference', reference]] : [], button: { label: 'Access Your Playbook', href: 'https://themarketinghaven.xyz/#shop' } }) };
}


export function purchaseEmail(reference = '', version = 'editorial-v3') {
  if (version === 'editorial-v1') return purchaseEmailV1(reference);
  const paragraphs = ['Hi there,', 'Thank you for choosing The Unseen Playbook.',
    'If you have already downloaded your copy, you are ready to begin. Start with the problem you most want to solve, and turn one idea into an action for your business.',
    'Need your copy again? Open the Shop using the button below. If your purchase is still saved on that device, your download will be available. Otherwise, choose Already purchased and confirm your checkout inbox with a one-time code. Keep your receipt reference for recovery.',
    'As you read, Haven can help you apply the ideas to your own brand. Bring a question or a short draft, and work through the next step together. You can also reply to this email for help.'];
  return { text: paragraphs.join('\n\n') + (reference ? '\n\nYour Paystack reference: ' + reference : '') +
    '\n\nAccess Your Playbook: https://themarketinghaven.xyz/#shop\n\n' + (version === 'editorial-v3' ? 'Your friends over at Team Haven\nBuilding with intention.' : 'Talk soon,\nTeam Haven.'),
    html: editorialEmail({ version, label: 'YOUR PLAYBOOK', title: 'Your next chapter starts here.', paragraphs,
      details: reference ? [['Your Paystack reference', reference]] : [],
      button: { label: 'Access Your Playbook', href: 'https://themarketinghaven.xyz/#shop' } }) };
}

/** @param {{name?: string | null, service?: string | null, version?: string}} options */
export function bookingEmail({ name, service, version = 'editorial-v3' } = {}) {
  const subject = 'Your strategy call with The Marketing Haven';
  if (version === 'legacy-v1') return { subject, text: `Hi there,

We're glad you set up a meeting with us to discuss ${service ? `our ${service} services` : 'our services'}.

Take this as confirmation of your spot. We're looking forward to seeing you on the date and time you selected on Calendly.

Two quick things to keep this smooth:
— Please join on time. If you can't make it, send us an email at info@themarketinghaven.xyz so we can free the slot for someone else.
— Check your inbox for the Calendly confirmation too — that's the one with the meeting link.

Looking forward to speaking with you.

Team Haven` };
  const cleanName = typeof name === 'string' ? name.trim().slice(0,200) : '';
  const paragraphs = [`Hi ${cleanName || 'there'},`,
    `We're glad you set up a meeting with us${service ? ` to discuss ${service}` : ''}. We're looking forward to seeing you on the date and time you selected on Calendly.`,
    "Please join on time. If you can't make it, reply to this email or contact info@themarketinghaven.xyz so we can free the slot.",
    "Check your inbox for the Calendly confirmation too. That email contains your meeting link and the options to reschedule or cancel.",
    'Looking forward to speaking with you.'];
  return { subject, text: paragraphs.join('\n\n')+'\n\nContact Team Haven: info@themarketinghaven.xyz\n\nYour friends over at Team Haven\nBuilding with intention.',
    html: editorialEmail({label:'YOUR STRATEGY CALL',title:'Your conversation is booked.',paragraphs,
      button:{label:'Contact Team Haven',href:'mailto:info@themarketinghaven.xyz'}}) };
}

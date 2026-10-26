export const INQUIRY_STATUSES = ['new', 'reviewing', 'contacted', 'booked', 'closed', 'lost'];
export const closedInquiry = inquiry => ['closed', 'lost'].includes(inquiry.inquiry_status);
export function lagosDate(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key).value).join('-');
}
export function inquiryDue(inquiry, today) {
  return !closedInquiry(inquiry) && Boolean(inquiry.inquiry_next_followup_on) && inquiry.inquiry_next_followup_on <= today;
}
export function splitSupportSessions(sessions = [], explicitTeam) {
  return {
    support: sessions.filter(session => session.service_id !== 'team-inquiry'),
    team: Array.isArray(explicitTeam) ? explicitTeam : sessions.filter(session => session.service_id === 'team-inquiry'),
  };
}
export function csvCell(value) {
  let text = String(value ?? '');
  // Quotes alone do not stop spreadsheet formula execution in user-supplied cells.
  if (typeof value !== 'number' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function workspaceMetrics({ leads, purchases, inquiries, bookings, now }) {
  const today = lagosDate(now);
  const active = inquiries.filter(inquiry => !closedInquiry(inquiry));
  return {
    openInquiries: active.length,
    unassignedInquiries: active.filter(inquiry => !inquiry.inquiry_owner).length,
    dueInquiries: active.filter(inquiry => inquiryDue(inquiry, today)).length,
    hotLeads: leads.filter(lead => String(lead.lead_temperature).toLowerCase() === 'hot' && (!lead.followup_status || lead.followup_status === 'pending')).length,
    purchaseEmails: purchases.filter(purchase => !purchase.thankyou_sent).length,
    reviewEmails: leads.filter(lead => lead.welcome_email_sent === false).length,
    upcomingBookings: bookings.filter(booking => ['active','confirmed'].includes(booking.status) && Date.parse(booking.start_time) >= now && Date.parse(booking.start_time) <= now + 7 * 86400000).length,
  };
}

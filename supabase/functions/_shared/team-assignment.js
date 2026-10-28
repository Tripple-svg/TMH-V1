import { editorialEmail } from './email-template.js';
import { SERVICE_NAMES } from './team-assignment-public.js';
export { SERVICE_NAMES } from './team-assignment-public.js';

export const TEAM_NAMES = ['Francis Fadeyi', 'Paschal Ikiriko', 'Great Jordan', 'Obabi Babalola', 'Yakubu Dalil'];
export const ASSIGNMENT_FIELDS = 'id,booking_id,inquiry_id,assignee_name,assignee_email,preparation_note,revision,expires_at,revoked_at,acknowledged_at,email_attempted_at,email_sent_at,email_last_error,created_at,updated_at';
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2,'0')).join('');
const pattern = /^([a-f0-9-]{36})\.([1-9]\d{0,8})\.(\d{10})\.([a-f0-9]{64})$/;
async function signingKey(secret, usages) { return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,usages); }
export async function assignmentToken(item, secret) {
  const value = `${item.id}.${item.revision}.${Math.floor(Date.parse(item.expires_at)/1000)}`;
  return `${value}.${hex(await crypto.subtle.sign('HMAC',await signingKey(secret,['sign']),encoder.encode('tmh-team-brief/'+value)))}`;
}
export async function verifyAssignmentToken(token, secret, now = Date.now()) {
  const parts = typeof token === 'string' && token.match(pattern);
  if (!parts || Number(parts[3])*1000<=now) return null;
  const signature = Uint8Array.from(parts[4].match(/../g),part=>parseInt(part,16));
  const ok = await crypto.subtle.verify('HMAC',await signingKey(secret,['verify']),signature,encoder.encode(`tmh-team-brief/${parts[1]}.${parts[2]}.${parts[3]}`));
  return ok ? {id:parts[1],revision:Number(parts[2]),expires:Number(parts[3])} : null;
}
export function meetingTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time not recorded';
  return new Intl.DateTimeFormat('en-NG',{dateStyle:'full',timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(value))+' WAT (Africa/Lagos)';
}
export async function assignmentBrief(db,item) {
  if (item.booking_id != null) {
    const {data:booking,error}=await db.from('strategy_call_bookings').select('id,full_name,email,event_name,start_time,end_time,timezone,status,source,service_id,review_id').eq('id',item.booking_id).maybeSingle();
    if(error || !booking) throw new Error('assignment_target_unavailable');
    let review=null;
    if(booking.review_id) {
      const result=await db.from('brand_reviews').select('brand_name,main_goal').eq('id',booking.review_id).maybeSingle();
      if(result.error)throw new Error('assignment_target_unavailable'); review=result.data;
    }
    return {kind:'booking',clientName:booking.full_name||'Name not provided',clientEmail:booking.email,
      brand:review?.brand_name||null,goal:review?.main_goal||null,service:SERVICE_NAMES[booking.service_id]||'Strategy call / scope to confirm',
      source:booking.source,status:booking.status,startTime:booking.start_time,endTime:booking.end_time,
      meetingTime:meetingTime(booking.start_time),inviteeTimezone:booking.timezone||null,
      meetingLinkNote:'Use the Calendly organizer invitation for joining details. This brief is not a meeting link.'};
  }
  const {data:inquiry,error}=await db.from('haven_sessions').select('id,review_id,service_id,inquiry_status').eq('id',item.inquiry_id).maybeSingle();
  if(error || !inquiry || inquiry.service_id!=='team-inquiry')throw new Error('assignment_target_unavailable');
  let review=null;
  if(inquiry.review_id){const result=await db.from('brand_reviews').select('full_name,brand_name,main_goal').eq('id',inquiry.review_id).maybeSingle();if(result.error)throw new Error('assignment_target_unavailable');review=result.data;}
  return {kind:'inquiry',clientName:review?.full_name||'Anonymous team inquiry',brand:review?.brand_name||null,goal:review?.main_goal||null,
    service:'Team inquiry',status:inquiry.inquiry_status||'new',meetingTime:'No confirmed meeting attached. Check Bookings before arranging a call.'};
}
export function assignmentEmail(item,brief,url) {
  const paragraphs=[`Hi ${item.assignee_name},`,brief.kind==='booking'?'You have been assigned to prepare for this client meeting.':'You have been assigned to follow up on this team inquiry.',
    `Open your private brief for the current details and preparation note, then acknowledge the assignment. Access expires ${meetingTime(item.expires_at)} and can be withdrawn by an admin. Keep this email private; anyone with the link can view this brief.`];
  const details=[['Client',brief.clientName],['Service',brief.service],['When',brief.meetingTime]];
  return {to:[item.assignee_email],reply_to:'info@themarketinghaven.xyz',subject:brief.kind==='booking'?'Your TMH meeting assignment':'Your TMH inquiry assignment',
    text:paragraphs.join('\n\n')+'\n\n'+details.map(([k,v])=>`${k}: ${v}`).join('\n')+`\n\nOpen preparation brief: ${url}\n\nYour friends over at Team Haven\nBuilding with intention.`,
    html:editorialEmail({label:'TEAM ASSIGNMENT',title:'Your next client conversation.',paragraphs,details,button:{label:'Open preparation brief',href:url}})};
}

const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
// Only server-verified records/capabilities enter this summary. Never spread
// browser context, receipt details, proof tokens or provider URLs into it.
export function havenPlatformState({review,playbookVerified,bookingStatus,serviceId}={}){
  return {reviewLinked:Boolean(review?.id),playbookAccess:playbookVerified===true?'verified':'unverified',
    serviceId:['web','growth','content','team-inquiry'].includes(serviceId)?serviceId:null,
    booking:{status:bookingStatus?.confirmed===true?'confirmed':bookingStatus?.pending===true?'pending':'none',
      startTime:bookingStatus?.confirmed===true?date(bookingStatus.startTime):null,endTime:bookingStatus?.confirmed===true?date(bookingStatus.endTime):null}};
}
export function bookingQuestionReply(text,state){
  if(!/\b(?:call|meeting|booking|appointment)\b/i.test(text)||!/\b(?:when|what time|do i have|have i|already booked|my booking|my meeting|my call|reschedule|cancel)\b/i.test(text))return null;
  const booking=state.booking;
  if(booking.status==='confirmed'){
    const time=booking.startTime?new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',dateStyle:'full',timeStyle:'short'}).format(new Date(booking.startTime))+' (Lagos time)':null;
    return `Your saved call is ${time?'scheduled for '+time:'already booked'}. Use your Calendly confirmation email for the joining link, your local time, and reschedule or cancellation options. Another website booking stays blocked until this call's scheduled end or a cancellation syncs. We can still talk through your service questions here.`;
  }
  if(booking.status==='pending')return 'A booking page was opened recently, but that is not a confirmed meeting. Check for your Calendly confirmation email. Finish that booking first, or wait up to 30 minutes for the reservation to expire; contact info@themarketinghaven.xyz if a confirmed booking is missing.';
  return 'I cannot see an active call linked to this browser or your verified review. That does not prove a booking on another device was cancelled. Check your Calendly confirmation email for its time and management links, or contact info@themarketinghaven.xyz. I cannot cancel or reschedule it from chat.';
}

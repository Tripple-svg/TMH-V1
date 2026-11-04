export const percent=(part,total)=>total?`${Math.round(100*part/total)}%`:'0%';
export function supportOverdue(row,now=Date.now()) {return !row.first_response_at&&row.status!=='resolved'&&now-Date.parse(row.created_at)>86400000;}
export function redactContact(value) {
  if(value==null)return value;
  return String(value).replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[redacted email]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g,match=>(match.match(/\d/g)||[]).length>=10?'[redacted phone]':match);
}
export function lagosDay(value){if(!Number.isFinite(Date.parse(value)))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
export function calendarMonth(year,month){const first=new Date(Date.UTC(year,month,1)),days=new Date(Date.UTC(year,month+1,0)).getUTCDate();return [...Array(first.getUTCDay()).fill(null),...Array.from({length:days},(_,i)=>`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`)];}

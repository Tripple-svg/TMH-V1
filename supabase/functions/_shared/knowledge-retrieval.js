// Small, deterministic retrieval over curated server-owned facts. User text is
// used only as a search query and can never add instructions or private access.
const words=text=>String(text||'').toLowerCase().match(/[a-z0-9]{3,}/g)||[];
const STOP=new Set(['the','and','for','that','this','with','have','what','how','can','you','your','from','are','was','not','does','about','want','need','please']);
const ALIASES={otp:'purchase recovery code',password:'staff access authenticator',mfa:'staff authenticator recovery',refund:'purchase support',cookie:'cookies privacy',cost:'price playbook',pricing:'price playbook',limit:'support allowance cooldown',download:'purchase access playbook',position:'positioning',posts:'content marketing',sales:'buyer purchase friction',trust:'evidence influence',start:'chapter action plan'};
export function chunkKnowledge(source,maxChars=1600) {
  const chunks=[];let heading='TMH knowledge';
  for(const paragraph of String(source).trim().split(/\n\s*\n/)) {
    const label=paragraph.match(/^([A-Z][A-Z &/0-9():-]{2,}|Chapter \d+[^:]*):/);
    if(label)heading=label[1];
    const lines=paragraph.match(new RegExp(`[\\s\\S]{1,${maxChars}}(?:\\s|$)`,'g'))||[paragraph];
    for(const content of lines)chunks.push({id:chunks.length,heading,text:content.trim()});
  }
  return chunks;
}
export function retrieveKnowledge(source,query,{maxChunks=4,maxChars=6200}={}) {
  const expanded=words(query).flatMap(word=>[word,...words(ALIASES[word])]);
  const terms=[...new Set(expanded.filter(word=>!STOP.has(word)))].slice(0,80);
  const chunks=chunkKnowledge(source);
  const ranked=chunks.map(chunk=>{
    const text=words(chunk.text),head=words(chunk.heading);
    return {...chunk,score:terms.reduce((n,term)=>n+(text.includes(term)?1:0)+(head.includes(term)?2:0),0)};
  }).sort((a,b)=>b.score-a.score||a.id-b.id).slice(0,maxChunks).sort((a,b)=>a.id-b.id);
  let used=0;
  return ranked.map(chunk=>{const text=`[${chunk.heading}]\n${chunk.text}`;if(used+text.length>maxChars)return '';used+=text.length;return text;}).filter(Boolean).join('\n\n');
}

// Four synthetic, single-turn checks of the CURRENT deployment. Public key only.
// Does not create reviews, send mail, book calls, pay, or use real customer data.
// --live creates four labelled guest conversations and spends normal AI budget.
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
const cases=[
  {name:'WhatsApp views without orders',prompt:'I sell cakes in Lagos. I post crazy videos on WhatsApp and get views but no sales. What should I change?'},
  {name:'Price enquiries without follow-through',prompt:'I sell handmade bags on Instagram. People ask the price in DMs and then disappear. I want to understand what is happening before spending on more ads.'},
  {name:'Known checkout friction',prompt:'I sell shoes through a website. Buyers reach checkout, but the delivery fee appears only on the last page and many leave there. How can I make that clearer? I want one practical step I can do today.'},
  {name:'Early business without a page',prompt:'I am starting a clothing brand. I have no website or social page yet, just three sample designs. How do I work out who I should sell to first? Keep it simple.'},
];
if(!process.argv.includes('--live')){for(const item of cases)console.log(JSON.stringify(item));console.log('Dry run. Use --live for exactly four labelled guest requests.');process.exit(0);}
const settings={...process.env};for(const path of ['.env','.env.local']){try{for(const line of readFileSync(path,'utf8').split(/\r?\n/)){const m=line.match(/^(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*)$/);if(m)settings[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}}catch{/* Public environment may be supplied by the shell. */}}
const base=settings.VITE_SUPABASE_URL,key=settings.VITE_SUPABASE_ANON_KEY;
if(base!=='https://dkpoygkduktusrnsbpaq.supabase.co'||!key)throw Error('This evaluation accepts only the configured TMH public project.');
let failed=0;for(const item of cases){
  try{
    const context={visitorId:randomUUID(),visitorToken:randomBytes(32).toString('hex'),sessionId:randomUUID()};
    const response=await fetch(base+'/functions/v1/haven-chat',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,Origin:'https://themarketinghaven.xyz','Content-Type':'application/json'},body:JSON.stringify({scope:'support',noticeVersion:'2026-10-26',context,requestId:randomUUID(),messages:[{role:'user',content:'[Synthetic launch QA, no real customer] '+item.prompt}]}),signal:AbortSignal.timeout(45000)});
    const body=await response.json();const ok=response.ok&&body.ok===true&&typeof body.text==='string';if(!ok)failed++;
    console.log(JSON.stringify({scenario:item.name,prompt:item.prompt,status:response.status,ok,model:body.model||null,text:ok?body.text:String(body.error||'Unavailable'),questionCount:ok?(body.text.match(/\?/g)||[]).length:null}));
  }catch{failed++;console.log(JSON.stringify({scenario:item.name,ok:false,error:'network_or_response_unavailable'}));}
}
console.log(JSON.stringify({scenarios:cases.length,failed}));process.exitCode=failed?1:0;

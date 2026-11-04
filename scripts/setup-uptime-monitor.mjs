import {createHash} from 'node:crypto';
const urls=['https://themarketinghaven.xyz','https://dkpoygkduktusrnsbpaq.supabase.co/functions/v1/health'];
const emails=['francis.teamhaven@gmail.com','paschal.tmh@gmail.com','chimburuomac@gmail.com'];
if(!process.argv.includes('--submit')){
  console.log(JSON.stringify({mode:'preview',urls,emails,activation:'Each owner must confirm the UptimeRobot email to activate monitoring.'},null,2));
}else{
  for(const email of emails)for(const url of urls){
    const endpoint=new URL('https://api.uptimerobot.com/agentic/agent-monitor/challenge');endpoint.searchParams.set('email',email);endpoint.searchParams.set('url',url);
    const response=await fetch(endpoint,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Monitor challenge unavailable: HTTP '+response.status);
    const challenge=await response.json();if(typeof challenge.nonce!=='string'||!Number.isInteger(challenge.difficulty)||challenge.difficulty<0||challenge.difficulty>32)throw Error('Invalid monitor challenge');
    const deadline=Date.now()+45000;let counter=0;
    for(;;counter++){
      const hash=createHash('sha256').update(challenge.nonce+'|'+counter).digest();let bits=0;
      for(const byte of hash){if(byte===0)bits+=8;else{bits+=Math.clz32(byte)-24;break;}}
      if(bits>=challenge.difficulty)break;if(counter%100000===0&&Date.now()>deadline)throw Error('Monitor challenge timed out');
    }
    const submitted=await fetch('https://api.uptimerobot.com/agentic/agent-monitor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,url,...challenge,counter}),signal:AbortSignal.timeout(15000)});
    if(!submitted.ok)throw Error('Monitor request failed: HTTP '+submitted.status);
    // Uniform 200 responses cannot establish mail delivery or active monitoring.
    console.log(JSON.stringify({email,url,status:'activation_requested',active:false,deliveryVerified:false}));
  }
}

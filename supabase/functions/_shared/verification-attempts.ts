import {requestBucket,codeHash} from './playbook-recovery.ts';
import {hashReviewToken} from './review-access.ts';
import {HavenRequestError} from './haven-request.ts';
export async function verificationAttempt(db:any,request:Request,secret:string,body:any,action='begin'){
  const visitor=typeof body.visitorId==='string'&&/^[a-f0-9-]{36}$/i.test(body.visitorId)&&/^[a-f0-9]{64}$/i.test(body.visitorToken||'')?body.visitorId:null;
  const hash=visitor?await hashReviewToken(body.visitorToken):null;
  const buckets=['network:'+await requestBucket(request,secret),...(visitor?['visitor:'+await codeHash('verification',visitor,secret)]:[])];
  for(const bucket of buckets){
    const {data,error}=await db.rpc('verification_attempt_gate',{p_bucket:bucket,p_visitor:bucket.startsWith('visitor:')?visitor:null,p_hash:bucket.startsWith('visitor:')?hash:null,p_action:action});
    if(error||!data)throw new HavenRequestError('Verification security checks are unavailable.',503);
    if(!data.allowed){const locked=data.locked===true;const retryAfter=Number(data.retryAfter)||0;
      const message=locked&&!retryAfter?`Verification is locked on this saved device. Contact info@themarketinghaven.xyz for help. Support reference: ${visitor}.`:locked?'Too many failed verification attempts on this network. Wait for the cooldown or contact info@themarketinghaven.xyz.':'Too many failed verification attempts. Wait 60 seconds before trying again.';
      throw Object.assign(new HavenRequestError(message,429,retryAfter),{code:locked?'verification_locked':'verification_cooldown'});
    }
  }
}

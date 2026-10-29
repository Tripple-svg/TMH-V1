import { HavenRequestError } from './haven-request.ts';
import { codeHash, requestBucket } from './playbook-recovery.ts';

export async function enforceHavenLimits(db: any, request: Request, secret: string, visitorId: string) {
  const limits: Array<[string, number, number]> = [
    ['haven-minute:' + await codeHash('chat', visitorId, secret), 8, 60],
    ['haven-network-minute:' + await requestBucket(request, secret), 30, 60],
    ['haven-visitor:' + await codeHash('chat', visitorId, secret), 30, 600],
    ['haven-network:' + await requestBucket(request, secret), 100, 3600],
  ];
  for (const [bucket, max, seconds] of limits) {
    const { data, error } = await db.rpc('consume_playbook_limit', { p_bucket: bucket, p_max: max, p_seconds: seconds });
    if (error) throw new HavenRequestError('Haven could not check its request limits. Please try again shortly.', 503);
    if (data !== true) throw new HavenRequestError('There have been too many messages in a short time. Please wait, then retry your saved message.', 429, seconds);
  }
}

export async function enforceScoringLimits(db: any, request: Request, secret: string, reviewId: string) {
  const limits: Array<[string,number]>=[['score-review:'+await codeHash('score',reviewId,secret),5],['score-network:'+await requestBucket(request,secret),30]];
  for(const [bucket,max] of limits){
    const {data,error}=await db.rpc('consume_playbook_limit',{p_bucket:bucket,p_max:max,p_seconds:3600});
    if(error)throw new HavenRequestError('Scoring request limits are unavailable. Please try again shortly.',503);
    if(data!==true)throw new HavenRequestError('Too many scoring attempts. Please wait before retrying, or continue in chat.',429);
  }
}

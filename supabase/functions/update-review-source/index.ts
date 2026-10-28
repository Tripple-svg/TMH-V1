import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { verifyReviewAccess, ReviewAccessError, hashReviewToken } from '../_shared/review-access.ts';
import { HavenRequestError, responseHeaders, verifyOrigin, readBoundedJson, screenshotPart } from '../_shared/haven-request.ts';
import { normalizeWebsiteUrl } from '../_shared/haven-scoring.ts';
import { limitRecovery, requestBucket } from '../_shared/playbook-recovery.ts';

Deno.serve(async request => {
  const headers = responseHeaders(request);
  const json = (body: unknown, status=200) => Response.json(body,{status,headers});
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(request.method!=='POST') return json({ok:false,error:'Method not allowed.'},405);
  let db: any, uploaded: string | null = null, committed=false;
  try {
    verifyOrigin(request);
    const body=await readBoundedJson(request,7*1024*1024);
    const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key) throw new HavenRequestError('Review corrections are unavailable.',503);
    db=createClient(url,key,{auth:{persistSession:false}});
    const access=body.context||{};
    const {review}=await verifyReviewAccess(db,access.sessionId,access.reviewId,access.accessToken);
    if(review.flag_status==='red') throw new HavenRequestError('Your access is restricted. Contact info@themarketinghaven.xyz.',403);
    if(!Number.isSafeInteger(body.revision)||body.revision<0) throw new HavenRequestError('Refresh the review details before making this correction.',409);
    await limitRecovery(db,'review-source:'+review.id,10);
    await limitRecovery(db,'review-source-ip:'+await requestBucket(request,key),20);
    let website: string | null=null, sourceHash: string | null=null;
    if(review.platform_type==='website') {
      website=normalizeWebsiteUrl(body.url); sourceHash=await hashReviewToken(website);
    } else if(review.platform_type==='social') {
      const image=screenshotPart(body.screenshot);
      const raw=String(body.screenshot).split(',')[1];
      const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
      uploaded=review.id+'/source-'+crypto.randomUUID()+'.'+image.inline_data.mime_type.split('/')[1];
      const {error}=await db.storage.from('tmh-screenshots').upload(uploaded,bytes,{contentType:image.inline_data.mime_type,upsert:false});
      if(error) throw new HavenRequestError('The new screenshot could not be saved. Try again.',503);
      sourceHash=await hashReviewToken(String(body.screenshot));
    } else throw new HavenRequestError('This review has no website or screenshot to correct.');
    const {data,error}=await db.rpc('correct_haven_review_source',{
      p_review_id:review.id,p_revision:body.revision,p_url:website,p_screenshot_path:uploaded,p_source_hash:sourceHash,
    });
    if(error) throw new HavenRequestError(error.code==='55000'?'Wait for the current response to finish or stop it, then try this correction.':'The correction could not be saved. Please try again.',error.code==='55000'?409:503);
    if(data?.conflict) return json({ok:false,code:'source_changed',revision:data.revision,error:'This source was changed in another tab. Reopen your review before correcting it again.'},409);
    if(!data?.review) throw new HavenRequestError('The saved correction could not be confirmed.',503);
    committed=true;
    // Old private images are no longer the review source. Cleanup failure never
    // rolls back a committed replacement or exposes either image publicly.
    if(uploaded&&typeof data.oldScreenshotPath==='string'&&data.oldScreenshotPath.startsWith(review.id+'/')
      &&!data.oldScreenshotPath.split('/').includes('..')&&data.oldScreenshotPath!==uploaded) {
      try {
        const {error:cleanupError}=await db.storage.from('tmh-screenshots').remove([data.oldScreenshotPath]);
        if(cleanupError) console.warn('Review source cleanup pending');
      } catch { console.warn('Review source cleanup pending'); }
    }
    return json({ok:true,revision:data.revision,review:data.review});
  } catch(error) {
    const known=error instanceof HavenRequestError||error instanceof ReviewAccessError;
    return json({ok:false,error:known?error.message:'Review correction is temporarily unavailable.'},known?error.status:502);
  } finally {
    if(uploaded&&!committed&&db) try { await db.storage.from('tmh-screenshots').remove([uploaded]); } catch { /* Private orphan can be removed by maintenance. */ }
  }
});

export type ProviderDiagnostic = { provider: string; code: string; status?: number; retryAfter?: number };
export class ProviderRequestError extends Error {
  constructor(public diagnostic: ProviderDiagnostic) { super(diagnostic.code); }
}
export function providerRetryAfter(response: Response) {
  const raw=response.headers.get('retry-after');
  if(!raw) return 0;
  const seconds=Number(raw);
  return Math.min(300,Math.max(0,Number.isFinite(seconds)?Math.ceil(seconds):Math.ceil((Date.parse(raw)-Date.now())/1000)||0));
}
// A transient 503 gets one short backoff within a fixed request budget. Long
// quota cooldowns are returned to the UI rather than retried in a tight loop.
export async function providerRequest(provider: string,url: string,init: RequestInit,timeoutMs=18000,retries=1) {
  let last: ProviderDiagnostic={provider,code:provider+'_unavailable'};
  for(let attempt=0;attempt<=retries;attempt++) {
    try {
      const response=await fetch(url,{...init,signal:AbortSignal.timeout(timeoutMs)});
      if(response.ok) return response;
      const status=response.status,retryAfter=providerRetryAfter(response);
      last={provider,code:provider+'_http_'+status,status,...(retryAfter?{retryAfter}:{})};
      if(attempt<retries&&retryAfter<=1&&[500,502,503,504].includes(status)) {
        await response.body?.cancel();
        await new Promise(resolve=>setTimeout(resolve,350+Math.floor(Math.random()*200)));
        continue;
      }
      await response.body?.cancel();
      throw new ProviderRequestError(last);
    } catch(error) {
      if(error instanceof ProviderRequestError) throw error;
      last={provider,code:provider+'_'+((error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))?'timeout':'network_error')};
      // A timeout already consumed the provider budget; fall back promptly.
      throw new ProviderRequestError(last);
    }
  }
  throw new ProviderRequestError(last);
}

export function safeProviderDiagnostic(error: unknown,provider: string): ProviderDiagnostic {
  if(error instanceof ProviderRequestError) return error.diagnostic;
  const code=error instanceof Error&&/^[a-z0-9_]{1,80}$/.test(error.message)?error.message:provider+'_response_error';
  return {provider,code};
}

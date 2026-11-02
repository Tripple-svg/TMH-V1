import { HavenRequestError } from './haven-request.ts';
import { codeHash, requestBucket } from './playbook-recovery.ts';
import { providerRequest } from './provider-request.ts';

type Plan = { provider: string; tokens: number; inputBytes: number; calls: number };
type Attempt = { provider: string; tokens: number; actual: number | null };

// One token per UTF-8 byte deliberately overestimates text. Every image holds
// the full accepted 7 MiB encoded-image allowance, even for compressed images,
// rather than assuming a cheap image resolution from their transfer size.
// Include space for provider message framing and the complete output/thinking
// limit. These reservations do not shorten context, images or model responses.
export function aiBudgetPlan(provider: string, input: unknown, outputTokens: number, calls: number, hasImage=false): Plan {
  const inputBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength + 8192 + (hasImage ? 7*1024*1024 : 0);
  return { provider, tokens: inputBytes + outputTokens, inputBytes, calls };
}

export function billedTokens(provider: string, payload: any): number | null {
  const usage = provider === 'gemini' ? payload?.usageMetadata : payload?.usage;
  const valid = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
  const total = usage?.totalTokenCount ?? usage?.total_tokens;
  if (!valid(total)) return null;
  const input = usage?.promptTokenCount ?? usage?.prompt_tokens;
  const output = usage?.candidatesTokenCount ?? usage?.completion_tokens;
  const thinking = provider === 'gemini' ? usage?.thoughtsTokenCount : undefined;
  const tools = provider === 'gemini' ? usage?.toolUsePromptTokenCount : undefined;
  if ([input,output,thinking,tools].some(n => n !== undefined && !valid(n))) return null;
  const components = (input || 0) + (output || 0) + (thinking || 0) + (tools || 0);
  return Number.isSafeInteger(components) ? Math.max(total, components) : null;
}

export class AIBudgetReservation {
  private attempts: Attempt[] = [];
  private settled = false;
  constructor(private db: any, private id: string, private plans: Plan[]) {}

  async request(provider: string, url: string, init: RequestInit, timeoutMs = 18000, retries = 1) {
    const plan = this.plans.find(item => item.provider === provider);
    // Check BEFORE the provider helper; an integration mistake must not spend
    // against an unreserved retry, provider or larger serialized prompt.
    if (this.settled || !plan || typeof init.body !== 'string' || new TextEncoder().encode(init.body).byteLength > plan.inputBytes
      || this.attempts.filter(item => item.provider === provider).length + retries + 1 > plan.calls) {
      throw new HavenRequestError('AI spending controls could not verify this request. Please retry shortly.',503);
    }
    return providerRequest(provider,url,init,timeoutMs,retries,() => {
      this.attempts.push({provider,tokens:plan.tokens,actual:null});
    });
  }

  recordUsage(provider: string, payload: any) {
    const attempt = [...this.attempts].reverse().find(item => item.provider === provider);
    if (attempt) attempt.actual = billedTokens(provider,payload);
  }

  async settle() {
    if (this.settled) return;
    this.settled = true;
    const tokens = this.attempts.reduce((sum,item) => sum + (item.actual ?? item.tokens),0);
    try {
      const {error} = await this.db.rpc('settle_ai_budget',{p_id:this.id,p_tokens:tokens,p_calls:this.attempts.length});
      // A failed settlement leaves the complete reservation in place. Never
      // refund on an uncertain database write or retry a stale settlement.
      if (error) console.error('AI budget settlement unavailable; reservation retained');
    } catch { console.error('AI budget settlement unavailable; reservation retained'); }
  }
}

export async function reserveAIBudget(db: any, request: Request, secret: string,
  kind: 'chat' | 'scoring', identity: {visitorId?:string;reviewId?:string}, plans: Plan[]) {
  const tokens = plans.reduce((sum,item) => sum + item.tokens * item.calls,0);
  const calls = plans.reduce((sum,item) => sum + item.calls,0);
  const id = crypto.randomUUID();
  const unavailable = () => {
    const error = new HavenRequestError('AI spending controls are temporarily unavailable. Your message or review is saved; please retry shortly.',503,60);
    Object.assign(error,{code:'ai_budget_unavailable'});
    return error;
  };
  if (!Number.isSafeInteger(tokens) || tokens <= 0 || calls < 1 || calls > 3) throw unavailable();
  let result;
  try {
    result = await db.rpc('reserve_ai_budget',{
      p_id:id,p_kind:kind,
      p_visitor_hash:identity.visitorId ? await codeHash('ai-visitor',identity.visitorId,secret) : null,
      p_review_hash:identity.reviewId ? await codeHash('ai-review',identity.reviewId,secret) : null,
      p_network_hash:await requestBucket(request,secret),p_tokens:tokens,p_calls:calls,
    });
  } catch { throw unavailable(); }
  if (result.error || !result.data || typeof result.data.allowed !== 'boolean') throw unavailable();
  if (!result.data.allowed) {
    const paused = result.data.paused === true;
    const retryAfter = Math.min(86400,Math.max(1,Number(result.data.retryAfter) || 60));
    const error = new HavenRequestError(paused
      ? 'AI replies are temporarily paused. Your message or review is saved; please try again later.'
      : 'The daily AI allowance has been reached. Your message or review is saved; please retry after the cooldown.',paused ? 503 : 429,retryAfter);
    Object.assign(error,{code:paused ? 'ai_paused' : 'ai_daily_budget_exceeded'});
    throw error;
  }
  return new AIBudgetReservation(db,id,plans);
}

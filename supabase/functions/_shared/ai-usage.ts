import {geminiModel} from './haven-model.ts';
export function usageGeminiModel(){try{return geminiModel();}catch{return 'invalid-model-configuration';}}
export async function recordAIUsage(db:any,provider:string,model:string,payload:any={},diagnostic:string|null=null){
  const usage=provider==='gemini'?payload.usageMetadata:payload.usage;
  const count=(value:any)=>Number.isSafeInteger(value)&&value>=0?value:null;
  const configured=Number(Deno.env.get('AI_DAILY_TOKEN_ALERT_THRESHOLD'));
  const threshold=Number.isSafeInteger(configured)&&configured>0?configured:800000;
  try{
    const {error}=await db.rpc('record_ai_usage',{p_id:crypto.randomUUID(),p_provider:provider,p_model:model.slice(0,120),p_input:count(usage?.promptTokenCount??usage?.prompt_tokens),p_output:count(usage?.candidatesTokenCount??usage?.completion_tokens),p_total:count(usage?.totalTokenCount??usage?.total_tokens),p_diagnostic:diagnostic,p_threshold:threshold});
    if(error)console.error('AI usage recording unavailable');
  }catch{console.error('AI usage recording unavailable');}
}

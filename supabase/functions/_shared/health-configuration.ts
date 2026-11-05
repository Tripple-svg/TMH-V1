export function healthConfiguration(env:{get:(key:string)=>string|undefined}){
  const present=(key:string)=>Boolean(env.get(key)?.trim());
  return {required:{mail:present('RESEND_API_KEY'),payments:present('PAYSTACK_SECRET_KEY'),captcha:present('HCAPTCHA_SECRET'),ai:present('GROQ_API_KEY')||(present('GEMINI_API_KEY')&&env.get('GEMINI_ENABLED')?.trim().toLowerCase()!=='false'),calendly:present('CALENDLY_API_TOKEN')},
    optional:{errorTracking:present('SENTRY_DSN'),calendarWebhook:present('CALENDLY_WEBHOOK_SECRET'),cityEstimates:present('IPINFO_TOKEN')}};
}

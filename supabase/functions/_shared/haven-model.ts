// Google distinguishes unpaid and paid data-use terms. Enable personal chat/image
// processing only after the team has confirmed its billing and processor setup.
export function geminiProcessingEnabled() {
  return Deno.env.get('GEMINI_BILLING_CONFIRMED') === 'true';
}

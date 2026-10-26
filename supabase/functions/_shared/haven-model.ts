// Gemini is primary for free-tier testing and paid production. Billing changes
// the account tier, not the model ID. Free-tier testing was explicitly enabled.
export function geminiProcessingEnabled() {
  return Deno.env.get('GEMINI_ENABLED') !== 'false' && Boolean(Deno.env.get('GEMINI_API_KEY')?.trim());
}
export function geminiModel() {
  const model = Deno.env.get('GEMINI_MODEL')?.trim() || 'gemini-3.8-flash';
  if (!/^[a-z0-9.-]+$/.test(model)) throw new Error('Invalid Gemini model configuration.');
  return model;
}
export function geminiGenerationConfig(jsonMode = false) {
  const model = geminiModel();
  return {
    maxOutputTokens: 4096,
    ...(model.startsWith('gemini-3') || model.startsWith('gemini-4')
      ? { thinkingConfig: { thinkingLevel: 'low' } }
      : { temperature: jsonMode ? 0 : 0.5 }),
    ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
  };
}
export function geminiText(data: any) {
  const candidate = data?.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new Error('gemini_incomplete_response');
  return (candidate?.content?.parts || []).filter((part: any) => !part.thought && typeof part.text === 'string')
    .map((part: any) => part.text).join('').trim();
}

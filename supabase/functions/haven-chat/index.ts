// supabase/functions/haven-chat/index.ts
// Server-owned instructions and verified private audit context.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildHavenSystemPrompt, STEPS, LEADS } from '../_shared/haven-prompts.js';
import { ReviewAccessError, hashReviewToken } from '../_shared/review-access.ts';
import { prepareConversation, substantiveAnswer, explicitCallRequest, RESTRICTED_MESSAGE } from '../_shared/haven-conversation.ts';
import { gateHavenRouting } from '../_shared/haven-routing.js';
import { geminiProcessingEnabled } from '../_shared/haven-model.ts';
import { applyAutomaticFlag, ModerationError } from '../_shared/haven-moderation.ts';
import {
  HavenRequestError, responseHeaders, verifyOrigin, readBoundedJson, screenshotPart,
  textValue, validateChatBody, savedStep,
} from '../_shared/haven-request.ts';

type HavenMessage = { role?: string; content?: string };
type ModelUsed = 'gemini' | 'groq';

function parseChips(rawText: string) {
  const match = rawText.match(/\[\[CHIPS:\s*(.*?)\]\]/s);
  const chips = match?.[1].match(/"([^"]+)"/g)?.map((chip) => chip.replaceAll('"', '')) ?? [];
  return { text: rawText.replace(/\[\[CHIPS:.*?\]\]/s, '').trim(), chips };
}

function looksTruncated(text: string): boolean {
  if (!text || text.length < 20) return false;
  const trimmed = text.trimEnd();
  return /[a-zA-Z,\-]$/.test(trimmed);
}

// ─── Gemini (primary + vision) ────────────────────────────────────────────

async function askGemini(
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiProcessingEnabled()) throw new Error('Gemini processing is disabled until billing is confirmed.');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured.');

  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];
  messages.forEach((message, idx) => {
    const isLast = idx === messages.length - 1;
    const role = message.role === 'agent' ? 'model' : 'user';
    const parts: Array<Record<string, unknown>> = [];
    if (isLast && role === 'user' && screenshot) parts.push(screenshotPart(screenshot));
    parts.push({ text: message.content || (screenshot ? 'Please review this screenshot.' : '') });
    contents.push({ role, parts });
  });

  if (contents[contents.length - 1].role !== 'user') {
    const parts: Array<Record<string, unknown>> = [];
    if (screenshot) parts.push(screenshotPart(screenshot));
    parts.push({ text: 'Please continue.' });
    contents.push({ role: 'user', parts });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash'}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 2000, temperature: 0.7 },
        }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini ${response.status}: ${body}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function askGeminiWithRetry(
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
  maxRetries = 1,
): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const text = await askGemini(systemPrompt, messages, screenshot);
      if (text && text.trim().length > 0) return text;
      throw new Error('Gemini returned empty response');
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      const isRetryable =
        msg.includes(' 503:') || msg.includes(' 502:') || msg.includes(' 504:') ||
        msg.includes('UNAVAILABLE') || msg.includes('high demand');
      if (!isRetryable || attempt === maxRetries) break;
      const waitMs = 1500 * Math.pow(2, attempt);
      console.warn(`Gemini retry ${attempt + 1}/${maxRetries} in ${waitMs}ms — ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr || new Error('Gemini failed after retries');
}

// ─── Groq (last resort) ───────────────────────────────────────────────────

async function askGroq(systemPrompt: string, messages: HavenMessage[]): Promise<string> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('GROQ_API_KEY not configured.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map((m) => ({
            role: m.role === 'agent' ? 'assistant' : 'user',
            content: m.content || '',
          })),
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Auto-continuation on cut-off ─────────────────────────────────────────

async function continueIfTruncated(
  text: string,
  model: ModelUsed,
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
): Promise<string> {
  if (!looksTruncated(text)) return text;

  console.log(`[continuation] Truncated (ends "${text.slice(-30)}"). Requesting finish.`);

  const contMessages: HavenMessage[] = [
    ...messages,
    { role: 'agent', content: text },
    { role: 'user', content: 'Continue from exactly where you stopped. Do not repeat anything. Do not add a greeting. Just finish the sentence and the thought.' },
  ];

  try {
    let continuation = '';
    if (model === 'gemini') {
      continuation = await askGemini(systemPrompt, contMessages, screenshot);
    } else {
      continuation = await askGroq(systemPrompt, contMessages);
    }
    if (continuation && continuation.trim().length > 0) {
      const joiner = /[a-zA-Z]$/.test(text.trimEnd()) ? ' ' : '';
      console.log(`[continuation] Merged (+${continuation.length} chars).`);
      return text.trimEnd() + joiner + continuation.trim();
    }
  } catch (err) {
    console.warn('[continuation] Failed:', err instanceof Error ? err.message : err);
  }
  return text;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────

async function callModel(
  systemPrompt: string,
  messages: HavenMessage[],
  screenshot: string | null,
): Promise<{ text: string; model: ModelUsed }> {
  let text = '';
  let model: ModelUsed = 'groq';

  // Vision requires Gemini
  if (screenshot) {
    try {
      text = await askGeminiWithRetry(systemPrompt, messages, screenshot);
      model = 'gemini';
    } catch (err) {
      console.warn('Gemini vision failed:', err instanceof Error ? err.message : err);
      const augmented = messages.map((m, i) =>
        i === messages.length - 1 && m.role !== 'agent'
          ? { ...m, content: `[SYSTEM NOTE: The user uploaded a screenshot, but vision is temporarily busy and you cannot see the image. Politely tell the user in ONE sentence that you can't read it right now, and ask them to describe the main issue in a few words. Do NOT pretend to see the image.]\n\nUser message: ${m.content || '(no text — screenshot only)'}` }
          : m,
      );
      text = await askGroq(systemPrompt, augmented);
      model = 'groq';
    }
  } else {
    // 1. Gemini primary
    try {
      text = await askGeminiWithRetry(systemPrompt, messages, null);
      if (text && text.trim().length > 0) {
        model = 'gemini';
      } else {
        throw new Error('Gemini returned empty');
      }
    } catch (gErr) {
      console.warn('Gemini failed, trying Groq:', gErr instanceof Error ? gErr.message : gErr);
    }

    // 2. Groq fallback
    if (!text) {
      text = await askGroq(systemPrompt, messages);
      model = 'groq';
    }
  }

  text = await continueIfTruncated(text, model, systemPrompt, messages, screenshot);

  return { text, model };
}

Deno.serve(async (request) => {
  const headers = responseHeaders(request);
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  let supabase: any, activeTurn: { sessionId: string; requestId: string } | null = null;
  try {
    verifyOrigin(request);
    const body = await readBoundedJson(request);
    if (body.action === 'access') {
      if (!['audit','support','service'].includes(body.scope) || !body.context || typeof body.context !== 'object' || Array.isArray(body.context)) throw new HavenRequestError('Invalid access request.');
      const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !key) throw new HavenRequestError('Haven is not configured.', 503);
      const client = createClient(url, key, { auth: { persistSession: false } });
      const access = await prepareConversation(client, body.scope, body.context, body.noticeVersion);
      return json({ ok: true, flagStatus: access.flagStatus });
    }
    const { scope, context, messages, screenshot } = validateChatBody(body);
    const requestId = body.requestId;
    if (typeof requestId !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(requestId)) throw new HavenRequestError('A unique chat request ID is required.');
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new HavenRequestError('Haven is not configured.', 503);
    supabase = createClient(url, key, { auth: { persistSession: false } });
    const conversation = await prepareConversation(supabase, scope, context, body.noticeVersion);
    if (conversation.flagStatus === 'red') return json({ ok: true, text: RESTRICTED_MESSAGE, chips: [], flagStatus: 'red', model: null });
    const latest = messages[messages.length-1].content || '';
    const { data: turn, error: turnError } = await supabase.rpc('begin_haven_turn', {
      p_session_id: conversation.session.id, p_turn_id: requestId, p_content: latest,
      p_has_image: Boolean(screenshot), p_substantive: substantiveAnswer(latest), p_explicit_call: explicitCallRequest(latest),
      p_request_hash: await hashReviewToken(JSON.stringify({ content: latest, screenshot })),
    });
    if (turnError || !turn) throw new HavenRequestError('Could not save your message. Please try again.', 500);
    if (turn.cached) return json(turn.cached);
    if (turn.busy) throw new HavenRequestError('Haven is still finishing the previous message. Please try again in a moment.', 409);
    activeTurn = { sessionId: conversation.session.id, requestId };
    const session = turn.session;
    const qualification = { questionsAsked: session.diagnostic_questions_asked || 0, diagnosticAnswers: session.diagnostic_answers || 0, explicitCallRequested: session.explicit_call_requested === true };
    let promptContext;
    if (scope === 'audit') {
      const review = conversation.review;
      promptContext = {
        userName: textValue(review.full_name, 120, 'there'), brandName: textValue(review.brand_name, 200, 'your business'),
        entryPoint: 'AUDIT_FLOW',
        auditData: {
          ...qualification, currentStep: savedStep(session.current_step), presenceType: review.platform_type,
          hasWebsite: review.platform_type === 'website', websiteUrl: textValue(review.website_url, 2048),
          hasNoPresence: review.platform_type === 'none', platform: textValue(review.social_platform, 80),
          handle: textValue(review.social_link, 500), mainGoal: textValue(review.main_goal, 500),
          isReturningUser: review.is_returning_user === true,
          leadTemperature: textValue(review.lead_temperature, 10).toUpperCase(),
          scrapeState: review.scrape_state || null,
          score: review.scrape_state === 'valid' ? review.haven_score : null,
          scoreBreakdown: review.scrape_state === 'valid' ? review.score_breakdown : null,
          scrapedWebSummary: textValue(review.scraped_summary, 6000), biggestIssue: textValue(review.biggest_leak, 600),
        },
      };
    } else {
      // Linked users retain their verified brand identity in every entry point.
      const services: Record<string, string> = { web: 'Brand & Web Engineering', growth: 'Strategic Growth', content: 'Content & Social' };
      const serviceName = services[String(session.service_id)] || null;
      const allowedPublicSteps = [STEPS.AWAITING_PERMISSION, STEPS.ROUTING_TO_CALL, STEPS.ROUTING_TO_PLAYBOOK, STEPS.ROUTING_TO_CONTENT, STEPS.CLEAN_EXIT];
      const defaultStep = scope === 'service' ? STEPS.SERVICE_GRID_OPEN
        : session.service_id === 'team-inquiry' ? STEPS.TEAM_INQUIRY : STEPS.CUSTOMER_SUPPORT_OPEN;
      promptContext = {
        userName: textValue(conversation.review?.full_name, 120, 'there'), brandName: textValue(conversation.review?.brand_name, 200, 'your business'),
        serviceName, entryPoint: scope === 'service' ? 'SERVICE_GRID' : 'CUSTOMER_SUPPORT',
        auditData: { ...qualification, currentStep: allowedPublicSteps.includes(session.current_step as string) ? session.current_step : defaultStep },
      };
    }
    const systemPrompt = buildHavenSystemPrompt(promptContext);
    // Client history is only validated input; provider context comes from saved turns.
    const history: HavenMessage[] = [];
    let chars = 0;
    for (const message of [...(session.messages || [])].reverse()) {
      if (!['user','agent'].includes(message.role) || typeof message.content !== 'string') continue;
      const content = message.content.slice(0,4000);
      if (history.length >= 40 || chars+content.length > 24000) break;
      history.unshift({ role: message.role, content }); chars += content.length;
    }
    const { text: modelText, model } = await callModel(systemPrompt, history.length ? history : [{ role:'user', content:latest }], screenshot);
    let rawText = modelText;
    if (!rawText.trim()) throw new Error('Empty model response');
    let flagStatus = conversation.flagStatus;
    let warned = false;
    const flag = rawText.match(/\[\[FLAG:(SEXUAL|PERSONAL_INFO|HARASSMENT|ABUSE)\]\]/)?.[1];
    if (flag) {
      const moderation = await applyAutomaticFlag(supabase, {
        ...(conversation.review ? { reviewId: conversation.review.id } : { visitorId: conversation.visitor.id }),
        sessionId: session.id,
        eventKey: `chat:${conversation.session.id}:${requestId}`, reason: `Haven detected ${flag.toLowerCase().replaceAll('_',' ')} in this conversation.`,
      });
      flagStatus = moderation.flagStatus;
      warned = moderation.changed && flagStatus === 'yellow';
    }
    rawText = gateHavenRouting(rawText, { scope, ...qualification, serviceId: session.service_id, latestUserText: latest });
    const askedQuestion = rawText.includes('[[DIAGNOSTIC_QUESTION]]') && rawText.includes('?');
    rawText = rawText.replace(/\[\[(?:FLAG:[A-Z_]+|NEED:[A-Z_]+|DIAGNOSTIC_QUESTION)\]\]/g,'').trim();
    if (warned) rawText += '\n\nPlease keep this conversation respectful and follow our terms. This is a warning; the team may review further misuse.';
    if (flagStatus === 'red') rawText = RESTRICTED_MESSAGE;
    const parsed = parseChips(rawText);
    const stepMatch = [...rawText.matchAll(/\[\[STEP:([A-Z0-9_]+)\]\]/g)].at(-1)?.[1];
    const leadMatch = [...rawText.matchAll(/\[\[LEAD:([A-Z]+)\]\]/g)].at(-1)?.[1];
    const currentStep = Object.values(STEPS).includes(stepMatch || '') && stepMatch !== STEPS.GREETING ? stepMatch : promptContext.auditData.currentStep;
    const leadTemperature = Object.values(LEADS).includes(leadMatch || '') ? leadMatch : null;
    const response = { ok: true, ...parsed, model, currentStep, leadTemperature, flagStatus, sessionId: session.id };
    const { error: completionError } = await supabase.rpc('complete_haven_turn', {
      p_session_id: session.id, p_turn_id: requestId, p_response: response, p_question: askedQuestion, p_step: currentStep,
    });
    if (completionError) throw new HavenRequestError('Could not save the conversation. Please try again.', 500);
    activeTurn = null;
    return json(response);
  } catch (error) {
    if (activeTurn && supabase) {
      try { await supabase.from('haven_chat_turns').update({ status:'failed', updated_at:new Date().toISOString() }).eq('id',activeTurn.requestId).eq('session_id',activeTurn.sessionId).eq('status','processing'); }
      catch { console.error('Could not release failed chat turn'); }
    }
    const known = error instanceof HavenRequestError || error instanceof ReviewAccessError || error instanceof ModerationError;
    console.error('haven-chat request failed', known ? error.status : 502);
    return json({ ok: false, error: known ? error.message : 'Haven is having trouble reaching the AI service. Please try again.' }, known ? error.status : 502);
  }
});

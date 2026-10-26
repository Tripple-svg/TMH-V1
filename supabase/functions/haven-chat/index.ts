import { captureConversationMemory, savedConversationMemory } from '../_shared/haven-memory.js';
import { enforceHavenLimits } from '../_shared/haven-limits.ts';
// supabase/functions/haven-chat/index.ts
// Server-owned instructions and verified private audit context.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { buildHavenSystemPrompt, STEPS, LEADS } from '../_shared/haven-prompts.js';
import { ReviewAccessError, hashReviewToken } from '../_shared/review-access.ts';
import { prepareConversation, substantiveAnswer, explicitCallRequest, RESTRICTED_MESSAGE } from '../_shared/haven-conversation.ts';
import { resolveHavenRouting, supportHelpReply, acceptedCallInvitation, inferHavenNeed } from '../_shared/haven-routing.js';
import { geminiProcessingEnabled, geminiModel, geminiGenerationConfig, geminiText } from '../_shared/haven-model.ts';
import { applyAutomaticFlag, ModerationError, detectHavenAbuse, moderationReply } from '../_shared/haven-moderation.ts';
import { verifyPlaybookAccess } from '../_shared/playbook-access.js';
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

// One bounded attempt per provider; retries reuse the durable turn.
async function askGemini(systemPrompt: string, messages: HavenMessage[], screenshot: string | null) {
  if (!geminiProcessingEnabled()) throw new Error('gemini_disabled_or_unconfigured');
  const contents = messages.filter(message => message.content?.trim() || screenshot).map((message, index) => ({
    role: message.role === 'agent' ? 'model' : 'user',
    parts: [
      ...(index === messages.length - 1 && message.role !== 'agent' && screenshot ? [screenshotPart(screenshot)] : []),
      { text: message.content || 'Please review this screenshot.' },
    ],
  }));
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + geminiModel() + ':generateContent',
    { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': Deno.env.get('GEMINI_API_KEY')!.trim() },
      signal: AbortSignal.timeout(18000),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents,
        generationConfig: geminiGenerationConfig() }) });
  if (!response.ok) throw new Error('gemini_http_' + response.status);
  const text = geminiText(await response.json());
  if (!text) throw new Error('gemini_empty_response');
  return text;
}
async function askGroq(systemPrompt: string, messages: HavenMessage[]) {
  const key = Deno.env.get('GROQ_API_KEY')?.trim();
  if (!key) throw new Error('groq_unconfigured');
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ model: Deno.env.get('GROQ_MODEL')?.trim() || 'openai/gpt-oss-120b',
      messages: [{ role: 'system', content: systemPrompt }, ...messages.map(message => ({
        role: message.role === 'agent' ? 'assistant' : 'user', content: message.content || '' }))],
      max_tokens: 1400, reasoning_effort: 'low', temperature: 0.5 }),
  });
  if (!response.ok) throw new Error('groq_http_' + response.status);
  const data = await response.json();
  if (data.choices?.[0]?.finish_reason && data.choices[0].finish_reason !== 'stop') throw new Error('groq_incomplete_response');
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('groq_empty_response');
  return text;
}
async function callModel(systemPrompt: string, messages: HavenMessage[], screenshot: string | null): Promise<{text: string; model: ModelUsed}> {
  try { return { text: await askGemini(systemPrompt, messages, screenshot), model: 'gemini' }; }
  catch (error) { console.warn('Primary model unavailable', error instanceof Error ? error.message : 'gemini_failure'); }
  const fallbackMessages = screenshot ? messages.map((message, index) => index === messages.length - 1
    ? { ...message, content: '[The image reader is unavailable. You cannot see the image. Ask the user to describe it; never pretend to inspect it.] ' + (message.content || '') } : message) : messages;
  return { text: await askGroq(systemPrompt, fallbackMessages), model: 'groq' };
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
    const acceptedCall = acceptedCallInvitation(latest, conversation.session.messages);
    const directHelp = acceptedCall ? 'Yes. Choose a time that works for you, and the team will discuss what you have described.\n[[BOOK_CALL]]\n[[STEP:ROUTING_TO_CALL]]' : supportHelpReply(latest, scope);
    const { data: turn, error: turnError } = await supabase.rpc('begin_haven_turn', {
      p_session_id: conversation.session.id, p_turn_id: requestId, p_content: latest,
      p_has_image: Boolean(screenshot), p_substantive: !directHelp && substantiveAnswer(latest), p_explicit_call: explicitCallRequest(latest) || acceptedCallInvitation(latest, conversation.session.messages),
      p_request_hash: await hashReviewToken(JSON.stringify({ content: latest, screenshot })),
    });
    if (turnError || !turn) throw new HavenRequestError('Could not save your message. Please try again.', 500);
    if (turn.cached) return json(turn.cached);
    if (turn.busy) throw new HavenRequestError('Haven is still finishing the previous message. Please try again in a moment.', 409);
    activeTurn = { sessionId: conversation.session.id, requestId };
    await enforceHavenLimits(supabase, request, key, conversation.visitor.id);
    const session = turn.session;
    const inferredNeed = inferHavenNeed(session.messages || []);
    const qualification = { conversationMemory: savedConversationMemory(session.conversation_memory), ...inferredNeed, questionsAsked: session.diagnostic_questions_asked || 0, diagnosticAnswers: session.diagnostic_answers || 0, explicitCallRequested: session.explicit_call_requested === true };
    let promptContext;
    if (scope === 'audit') {
      const review = conversation.review;
      promptContext = {
        userName: textValue(review.full_name, 120, 'there'), brandName: textValue(review.brand_name, 200, 'your business'),
        entryPoint: 'AUDIT_FLOW',
        auditData: {
          ...qualification, routingState: session.routing_state || null, currentStep: savedStep(session.current_step), presenceType: review.platform_type,
          hasWebsite: review.platform_type === 'website', websiteUrl: textValue(review.website_url, 2048),
          hasNoPresence: review.platform_type === 'none', platform: textValue(review.social_platform, 80),
          handle: textValue(review.social_link, 500), mainGoal: textValue(review.main_goal, 500),
          isReturningUser: review.is_returning_user === true,
          leadTemperature: textValue(review.lead_temperature, 10).toUpperCase(),
          scrapeState: review.scrape_state || null, scoreReason: review.score_reason || null,
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
        serviceName, entryPoint: scope === 'service' ? 'SERVICE_GRID' : session.service_id === 'team-inquiry' ? 'TEAM_INQUIRY' : 'CUSTOMER_SUPPORT',
        auditData: { ...qualification, routingState: session.routing_state || null, currentStep: allowedPublicSteps.includes(session.current_step as string) ? session.current_step : defaultStep },
      };
    }
    const playbookVerified = await verifyPlaybookAccess(context.playbookAccessToken, key);
    const systemPrompt = buildHavenSystemPrompt({ ...promptContext, playbookVerified });
    // Client history is only validated input; provider context comes from saved turns.
    const history: HavenMessage[] = [];
    let chars = 0;
    for (const message of [...(session.messages || [])].reverse()) {
      if (!['user','agent'].includes(message.role) || typeof message.content !== 'string') continue;
      const content = message.content.slice(0,4000);
      if (history.length >= 40 || chars+content.length > 24000) break;
      history.unshift({ role: message.role, content }); chars += content.length;
    }
    const directAbuse = detectHavenAbuse(latest);
    const { text: modelText, model } = directAbuse ? { text: moderationReply(directAbuse), model: null } : directHelp
      ? { text: directHelp, model: null }
      : await callModel(systemPrompt, history.length ? history : [{ role:'user', content:latest }], screenshot);
    const captured = captureConversationMemory(modelText, session.conversation_memory, latest, requestId);
    let rawText = captured.text;
    if (!rawText.trim()) throw new Error('Empty model response');
    let flagStatus = conversation.flagStatus;
    let warned = false;
    const flag = directAbuse || rawText.match(/\[\[FLAG:(SEXUAL|PERSONAL_INFO|HARASSMENT|ABUSE)\]\]/)?.[1];
    if (flag) {
      const moderation = await applyAutomaticFlag(supabase, {
        ...(conversation.review ? { reviewId: conversation.review.id } : { visitorId: conversation.visitor.id }),
        sessionId: session.id,
        eventKey: `chat:${conversation.session.id}:${requestId}`, reason: `Haven detected ${flag.toLowerCase().replaceAll('_',' ')} in this conversation.`,
      });
      flagStatus = moderation.flagStatus;
      warned = moderation.changed && flagStatus === 'yellow';
    }
    const routed = directAbuse || (directHelp && !acceptedCall) ? { text: rawText, routingState: session.routing_state || { problemType: 'unknown', permission: 'none' } } : resolveHavenRouting(rawText, { scope, ...qualification, teamInquiry: session.service_id === 'team-inquiry', acceptedCall, playbookVerified, routingState: session.routing_state, serviceId: session.service_id, latestUserText: latest });
    rawText = routed.text;
    const askedQuestion = !directHelp && !flag && rawText.includes('?') && !/\[\[(?:BOOK_CALL|PLAYBOOK|STEP:AWAITING_PERMISSION)/.test(rawText);
    rawText = rawText.replace(/\[\[(?:FLAG:[A-Z_]+|NEED:[A-Z_]+|DIAGNOSTIC_QUESTION)\]\]/g,'').trim();
    if (warned) rawText += '\n\nPlease keep this conversation respectful and follow our terms. This is your warning. Another abusive message will restrict your access.';
    if (flagStatus === 'red') rawText = RESTRICTED_MESSAGE;
    const parsed = parseChips(rawText);
    const stepMatch = [...rawText.matchAll(/\[\[STEP:([A-Z0-9_]+)\]\]/g)].at(-1)?.[1];
    const leadMatch = [...rawText.matchAll(/\[\[LEAD:([A-Z]+)\]\]/g)].at(-1)?.[1];
    const currentStep = Object.values(STEPS).includes(stepMatch || '') && stepMatch !== STEPS.GREETING ? stepMatch : promptContext.auditData.currentStep;
    const leadTemperature = Object.values(LEADS).includes(leadMatch || '') ? leadMatch : null;
    const response = { ok: true, ...parsed, model, currentStep, leadTemperature, flagStatus, sessionId: session.id, routingState: routed.routingState };
    const { error: completionError } = await supabase.rpc('complete_haven_turn', {
      p_session_id: session.id, p_turn_id: requestId, p_response: { ...response, conversationMemory: captured.memory }, p_question: askedQuestion, p_step: currentStep,
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

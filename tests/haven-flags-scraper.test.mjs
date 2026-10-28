import { scoreFailureCopy } from '../supabase/functions/_shared/scoring-copy.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { SCORING_COPY } from '../supabase/functions/_shared/haven-prompts.js';
import { CHAT_NOTICE_VERSION } from '../src/lib/havenIdentity.js';

const source = readFileSync(new URL('../src/components/haven/context/HavenContext.jsx', import.meta.url), 'utf8');
function extract(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Cannot extract ${start}`);
  return source.slice(from, to);
}
const code = [
  source.match(/const REVIEW_RECOVERY_MESSAGE = [^\n]+/)[0],
  extract('function classifyChipAction(', 'function makeDefaultSupportSession('),
  extract('function reviewAccess(', 'export function HavenProvider(')
    .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://project.supabase.co'")
    .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'public-anon-key'"),
  extract('  const runScraper = useCallback(', '  const retryScrape = useCallback('),
  extract('  const stopResponse = useCallback(', '  const sendNavChipIntent = useCallback('),
  extract('  const sendMessage = useCallback(', '  const clearChat = useCallback('),
  'globalThis.callbacks = { runScraper, runSocialScorer, sendMessage, stopResponse, dismissFailedTurn, matchingAuditSession };',
].join('\n');
const ACCESS = { reviewId: '7e4d80fa-a528-4d23-a13c-578240e3ba83', sessionId: 'c9727d76-8754-49ad-aa20-b56243badc31', accessToken: 'a'.repeat(64) };
const IDENTITY = { visitorId: 'fc40998d-e854-4d7a-910a-bad281db7c15', visitorToken: 'b'.repeat(64) };
const VALID = { ok: true, state: 'valid', summary: 'Readable website content.', score: 20,
  breakdown: { clarity: 4, trust: 4, conversion: 4, technical: 4, content: 4 }, biggestIssue: 'The offer is unclear.' };
function harness({ scoring = VALID, profile = {}, scope = 'audit', history = [], status = 200,
  chat = { ok: true, text: 'Here is the next question.', currentStep: 'AWAITING_DIAGNOSTIC_Q2', flagStatus: 'white', chips: [] }, fetchImpl } = {}) {
  let currentProfile = { ...ACCESS, name: 'Ada', brandName: 'Ada Studio', exchangeCount: 0, ...profile };
  let currentSessionState = { id: ACCESS.sessionId, messages: history };
  let currentPreflight = { status: 'idle', retryCount: 0 };
  const requests = [], messages = [], thinking = [];
  const context = {
    setTimeout, clearTimeout, scoreFailureCopy, AbortController, Response, Error, SCORING_COPY, CHAT_NOTICE_VERSION, crypto: webcrypto,
    getHavenIdentity: () => ({ ...IDENTITY }),
    console: { log() {}, warn() {}, error() {} }, navigator: { onLine: true },
    STEPS: { AWAITING_DIAGNOSTIC_Q2: 'AWAITING_DIAGNOSTIC_Q2' }, LEADS: { WARM: 'WARM' }, NAV_ACTION_RULES: [],
    useCallback: (fn) => fn, userProfile: currentProfile,
    setUserProfile: (updater) => { currentProfile = updater(currentProfile); },
    setAuditPreflight: (updater) => { currentPreflight = updater(currentPreflight); },
    setIsThinking: (value) => thinking.push(value), setViewState() {}, triggerToast() {},
    fetch: async (url, options) => {
      requests.push({ url, ...options, payload: JSON.parse(options.body) });
      if (fetchImpl) return fetchImpl(url, options);
      return Response.json(url.endsWith('/haven-chat') ? chat : scoring, { status });
    },
    activeScope: scope, activeSessionId: ACCESS.sessionId, activeService: { id: 'web' },
    currentSession: { id: ACCESS.sessionId, messages: history },
    getSessionsForScope: () => [{ id: ACCESS.sessionId }],
    createSession() { throw new Error('Unexpected session creation'); }, addMessage: (...args) => messages.push(args),
    abortControllerRef: { current: null }, activeRequestRef: { current: null },
    scoringRequestRef: { current: 0 }, setSessionsForScope(scope, updater) { currentSessionState = updater([currentSessionState])[0]; },
    inFlightTurnsRef: { current: new Set() }, publicSessionIdsRef: { current: new Map() }, pendingTurnsRef: { current: new Map() },
  };
  vm.runInNewContext(code, context);
  return { ...context.callbacks, requests, messages, thinking,
    get session() { return currentSessionState; }, get profile() { return currentProfile; }, get preflight() { return currentPreflight; } };
}

test('website scoring: a valid low score remains visible and uses private review credentials', async () => {
  const ui = harness(); await ui.runScraper('https://example.com');
  assert.equal(ui.preflight.status, 'ready'); assert.equal(ui.preflight.score, 20);
  assert.equal(ui.profile.scrapeState, 'valid'); assert.equal(ui.profile.auditScore, 20);
  assert.deepEqual(ui.requests[0].payload.context, ACCESS);
});
test('website scoring: bad extraction never reuses a stale score or becomes a network error', async () => {
  const ui = harness({ scoring: { ok: true, state: 'bad_data', summary: 'Privacy policy' }, profile: { auditScore: 99 } });
  await ui.runScraper('https://example.com');
  assert.equal(ui.preflight.status, 'insufficient_evidence'); assert.equal(ui.preflight.score, null);
  assert.equal(ui.profile.auditScore, null); assert.equal(ui.profile.scrapeState, 'bad_data');
  assert.equal(ui.profile.scrapeFailed, false);
});
test('website scoring: upstream failure clears stale scores and shows retry/proceed copy', async () => {
  const ui = harness({ status: 502, scoring: { ok: false, state: 'failed' }, profile: { auditScore: 99 } });
  await ui.runScraper('https://example.com');
  assert.equal(ui.preflight.status, 'failed'); assert.equal(ui.preflight.error, scoreFailureCopy('provider_unavailable'));
  assert.equal(ui.profile.auditScore, null); assert.equal(ui.profile.scrapeState, 'failed');
});
test('website scoring: a response without an explicit trusted scoring state cannot supply a score', async () => {
  const ui = harness({ scoring: { ok: true, summary: 'a'.repeat(400), score: 99 } });
  await ui.runScraper('https://example.com'); assert.equal(ui.preflight.status, 'failed');
  assert.equal(ui.preflight.score, null);
});
test('website scoring: new form credentials are used immediately before React state rerenders', async () => {
  const ui = harness({ profile: { accessToken: null } });
  await ui.runScraper('https://example.com', { access: ACCESS, force: true });
  assert.deepEqual(ui.requests[0].payload.context, ACCESS); assert.equal(ui.requests[0].payload.force, true);
});
test('website scoring: a late result from the previous review cannot replace the newer review result', async () => {
  const resolvers = [];
  const ui = harness({ fetchImpl: async () => new Promise((resolve) => resolvers.push(resolve)) });
  const first = ui.runScraper('https://first.example.com');
  const second = ui.runScraper('https://second.example.com', { access: { ...ACCESS, reviewId: 'second-review', sessionId: 'second-session' } });
  resolvers[1](Response.json(VALID)); await second;
  resolvers[0](Response.json({ ...VALID, score: 90 })); await first;
  assert.equal(ui.preflight.url, 'https://second.example.com'); assert.equal(ui.preflight.score, 20);
  assert.equal(ui.profile.auditScore, 20);
});
test('website scoring: legacy missing-token access is actionable instead of an endless retry instruction', async () => {
  const ui = harness({ status: 403, scoring: { ok: false } });
  await ui.runScraper('https://example.com'); assert.match(ui.preflight.error, /access recovery/);
});
test('social scoring: valid and unreadable screenshot states remain distinct', async () => {
  for (const state of ['valid', 'bad_data']) {
    const ui = harness({ scoring: { ...VALID, state } }); await ui.runSocialScorer('data:image/png;base64,YQ==');
    assert.equal(ui.preflight.status, state === 'valid' ? 'ready' : 'insufficient_evidence');
    assert.equal(ui.preflight.score, state === 'valid' ? 20 : null);
    assert.deepEqual(ui.requests[0].payload.context, ACCESS);
  }
});
test('chat: audit sends credentials and bounded history, never a browser-generated system prompt or flag lookup', async () => {
  const ui = harness({ history: [{ role: 'agent', content: 'Greeting.', isSeedGreeting: true }] });
  await ui.sendMessage('I post but nothing happens.');
  assert.equal(ui.requests.length, 1); const body = ui.requests[0].payload;
  assert.ok(ui.requests[0].url.endsWith('/haven-chat')); assert.equal(body.scope, 'audit');
  assert.deepEqual(body.context, { ...IDENTITY, ...ACCESS }); assert.equal('systemPrompt' in body, false);
  assert.match(body.requestId, /^[a-f\d-]{36}$/i); assert.equal(body.noticeVersion, CHAT_NOTICE_VERSION);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'I post but nothing happens.' }]);
  assert.equal(ui.profile.currentStep, 'AWAITING_DIAGNOSTIC_Q2'); assert.deepEqual(ui.thinking, [true, false]);
});
test('chat: browser-cached red status does not replace the server decision', async () => {
  const ui = harness({ profile: { flag_status: 'red' } }); await ui.sendMessage('Help me understand.');
  assert.equal(ui.profile.flag_status, 'white'); assert.equal(ui.messages.at(-1)[1], 'Here is the next question.');
});
test('chat: server restriction text is rendered and authoritative red status is retained', async () => {
  const ui = harness({ chat: { ok: true, text: 'Your access is currently restricted.', flagStatus: 'red' } });
  await ui.sendMessage('Help me.'); assert.equal(ui.profile.flag_status, 'red');
  assert.equal(ui.messages.at(-1)[1], 'Your access is currently restricted.');
});
test('chat: linked support and service carry ownership proof and separate public session IDs without score claims', async () => {
  for (const scope of ['support', 'service']) {
    const ui = harness({ scope, profile: { auditScore: 99, flag_status: 'red' } }); await ui.sendMessage('What does TMH do?');
    const context = ui.requests[0].payload.context;
    assert.equal(context.accessToken, ACCESS.accessToken); assert.equal(context.reviewId, ACCESS.reviewId);
    assert.equal(context.reviewSessionId, ACCESS.sessionId); assert.notEqual(context.sessionId, ACCESS.sessionId);
    assert.match(context.sessionId, /^[a-f\d-]{36}$/i); assert.equal(context.visitorId, IDENTITY.visitorId);
    assert.equal('score' in context, false);
  }
});

test('chat: unlinked public scopes send visitor ownership without pretending to own a review', async () => {
  for (const scope of ['support', 'service']) {
    const ui = harness({ scope, profile: { reviewId: null, sessionId: null, accessToken: null } });
    await ui.sendMessage('Tell me about TMH.');
    const context = ui.requests[0].payload.context;
    assert.equal(context.visitorId, IDENTITY.visitorId); assert.equal(context.visitorToken, IDENTITY.visitorToken);
    assert.equal('accessToken' in context, false); assert.equal('reviewId' in context, false);
    assert.equal(ui.requests[0].payload.noticeVersion, CHAT_NOTICE_VERSION);
  }
});

test('chat: response-loss retry reuses its request and public session IDs without adding a duplicate user turn', async () => {
  let fails = true;
  const ui = harness({ scope: 'support', fetchImpl: async () => {
    if (fails) throw new Error('Network response lost');
    return Response.json({ ok: true, text: 'Recovered reply.', flagStatus: 'white' });
  } });
  await ui.sendMessage('Help me understand.');
  fails = false;
  await ui.sendMessage('Help me understand.');
  assert.equal(ui.requests[0].payload.requestId, ui.requests[1].payload.requestId);
  assert.equal(ui.requests[0].payload.context.sessionId, ui.requests[1].payload.context.sessionId);
  assert.equal(ui.messages.filter(([role]) => role === 'user').length, 1);
  await ui.sendMessage('A different question.');
  assert.notEqual(ui.requests[2].payload.requestId, ui.requests[1].payload.requestId);
});

test('chat: authoritative flag responses update the shared profile in every scope', async () => {
  for (const scope of ['audit', 'support', 'service']) {
    for (const flagStatus of ['yellow', 'red']) {
      const ui = harness({ scope, chat: { ok: true, text: 'Moderation response.', flagStatus } });
      await ui.sendMessage('A message.');
      assert.equal(ui.profile.flag_status, flagStatus);
    }
  }
});
test('chat: old history is bounded before sending without dropping the latest question', async () => {
  const history = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'agent' : 'user', content: `Message ${i}` }));
  const ui = harness({ history }); await ui.sendMessage('Latest question');
  assert.equal(ui.requests[0].payload.messages.length, 40);
  assert.equal(ui.requests[0].payload.messages.at(-1).content, 'Latest question');
});
test('chat: total history characters are bounded while retaining the latest question', async () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'agent' : 'user', content: 'x'.repeat(4000) }));
  const ui = harness({ history }); await ui.sendMessage('Latest question');
  assert.ok(ui.requests[0].payload.messages.reduce((n, item) => n + item.content.length, 0) <= 24000);
  assert.equal(ui.requests[0].payload.messages.at(-1).content, 'Latest question');
});
test('review resume: credential-matching history wins over a longer conversation from another brand', () => {
  const ui = harness();
  const owned = { id: ACCESS.sessionId, scope: 'audit', messages: ['one'] };
  const other = { id: 'other-brand-session', scope: 'audit', messages: Array(30).fill('another brand') };
  assert.equal(ui.matchingAuditSession([other, owned], ACCESS), owned);
  assert.equal(ui.matchingAuditSession([other], ACCESS), null);
});
test('session sync: in-memory credentials work even when localStorage is unavailable and exclude browser AI results', () => {
  const calls = [];
  const effect = extract('  // Sync only the owned conversation', '  const getSessionsForScope');
  const helper = extract('function reviewAccess(', 'async function readHavenResponse(');
  vm.runInNewContext(`${helper}\n${effect}`, {
    mounted: true, userProfile: { ...ACCESS, auditScore: 100, currentStep: 'GREETING', clickedBookingLink: true },
    auditSessions: [{ id: ACCESS.sessionId, scope: 'audit', messages: [{ role: 'user', content: 'Hello' }] }],
    useEffect: (fn) => fn(), scheduleHavenSessionSync: (payload) => calls.push(payload),
    localStorage: { getItem() { throw new Error('Storage is blocked'); } },
  });
  assert.equal(calls.length, 1); assert.equal(calls[0].accessToken, ACCESS.accessToken);
  assert.equal('websiteScore' in calls[0], false); assert.equal('currentStep' in calls[0], false);
});
test('chat: ownership errors show recovery contact and clear thinking', async () => {
  const ui = harness({ status: 403 }); await ui.sendMessage('Help me.');
  assert.match(ui.session.failedTurn.error, /access recovery/);
  assert.equal(ui.messages.filter(([role]) => role === 'agent').length, 0); assert.deepEqual(ui.thinking, [true, false]);
});
test('chat: cancellation aborts the pending request without adding a false server error', async () => {
  const external = new AbortController();
  const ui = harness({ fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { const error = new Error('cancelled'); error.name = 'AbortError'; reject(error); }, { once: true });
  }) });
  const pending = ui.sendMessage('Help me.', null, { signal: external.signal }); external.abort(); await pending;
  assert.equal(ui.requests[0].signal.aborted, true); assert.deepEqual(ui.thinking, [true, false]);
  assert.equal(ui.messages.length, 1);
});


test('chat retry: rephrased retry preserves the exact screenshot and turn ID without writing an error as an assistant reply', async () => {
  let first = true;
  const ui = harness({ profile: { screenshot: 'data:image/png;base64,YQ==' }, fetchImpl: async () => {
    if (first) { first = false; throw new Error('lost response'); }
    return Response.json({ ok: true, text: 'Let us continue.', chips: [] });
  } });
  await ui.sendMessage('Please do'); assert.ok(ui.session.failedTurn);
  assert.equal(ui.messages.filter(([role]) => role === 'agent').length, 0);
  await ui.sendMessage('Please do again');
  assert.equal(ui.requests.length, 2);
  assert.deepEqual(ui.requests[0].payload, ui.requests[1].payload);
  assert.equal(ui.messages.filter(([role]) => role === 'user').length, 1);
  assert.equal(ui.session.failedTurn, null);
});

test('chat retry: rapid duplicate send is locked until the first attempt finishes', async () => {
  let release;
  const ui = harness({ fetchImpl: async () => new Promise(resolve => { release = resolve; }) });
  const first = ui.sendMessage('Please help with my bread business');
  await ui.sendMessage('Please help with my bread business'); assert.equal(ui.requests.length, 1);
  release(Response.json({ ok: true, text: 'What have you tried?', chips: [] })); await first;
  assert.equal(ui.messages.filter(([role]) => role === 'user').length, 1);
});

test('chat retry: a missing legacy capability releases thinking and shows recovery instead of throwing outside cleanup', async () => {
  const ui = harness({ profile: { accessToken: null } }); await ui.sendMessage('Please help');
  assert.equal(ui.requests.length, 0); assert.deepEqual(ui.thinking, [true, false]);
  assert.match(ui.session.failedTurn.error, /access recovery/);
});

test('chat stop: deliberate stop cancels the owned server turn and suppresses late replies and retry notices', async () => {
  let release;
  const ui = harness({ fetchImpl: async (_url, options) => JSON.parse(options.body).action === 'cancel'
    ? Response.json({ ok: true, cancelled: true }) : new Promise(resolve => { release = resolve; }) });
  const pending = ui.sendMessage('Please inspect this offer.');
  ui.stopResponse();
  release(Response.json({ ok: true, text: 'A reply completed after the stop.' }));
  await pending;
  assert.equal(ui.requests[0].signal.aborted, true);
  assert.equal(ui.requests[1].payload.action, 'cancel');
  assert.equal(ui.requests[1].payload.requestId, ui.requests[0].payload.requestId);
  assert.deepEqual(ui.requests[1].payload.context, ui.requests[0].payload.context);
  assert.equal(ui.messages.filter(([role]) => role === 'agent').length, 0);
  assert.equal(ui.session.failedTurn, null);
});

test('chat retry: server cooldown blocks rapid retry without duplicating a saved message', async () => {
  const ui = harness({ fetchImpl: async () => Response.json({ ok: false, error: 'Busy', retryAfter: 60 }, { status: 503 }) });
  await ui.sendMessage('Help with this offer.');
  assert.ok(ui.session.failedTurn.retryAt > Date.now());
  await ui.sendMessage('Help with this offer.');
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.messages.filter(([role]) => role === 'user').length, 1);
  ui.dismissFailedTurn();
  assert.equal(ui.session.failedTurn, null);
  assert.equal(ui.requests[1].payload.action, 'cancel');
});

test('social scoring can retry the saved private screenshot after a reload without a browser image', async () => {
  const ui = harness(); await ui.runSocialScorer(null);
  assert.equal(ui.requests.length, 1); assert.equal(ui.preflight.status, 'ready');
  assert.deepEqual(ui.requests[0].payload.context, ACCESS);
});

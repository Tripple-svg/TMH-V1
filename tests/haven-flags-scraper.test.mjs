import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the production callbacks and flag lookup with state/network boundaries
// supplied by the harness. No copied implementation or live services are used.
const source = readFileSync(new URL('../src/components/haven/context/HavenContext.jsx', import.meta.url), 'utf8');
function extract(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Cannot extract ${start}`);
  return source.slice(from, to);
}
const code = [
  extract('function classifyChipAction(', 'function makeDefaultSupportSession('),
  extract('async function fetchUserFlag(', 'async function callScoreSocial(')
    .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://project.supabase.co'")
    .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'public-anon-key'"),
  extract('  const runScraper = useCallback(', '  const runSocialScorer = useCallback('),
  extract('  const sendMessage = useCallback(', '  const clearChat = useCallback('),
  'globalThis.callbacks = { runScraper, sendMessage };',
].join('\n');

const RESTRICTION = "CRITICAL: THIS USER IS RESTRICTED. Reply ONLY with: 'Your access is currently restricted due to a violation of our terms. Please contact info@themarketinghaven.xyz.' Do not answer any other questions.";
const SITE_URL = 'https://example.com';

function harness({ scrape = { ok: true, summary: 'a'.repeat(300), score: 76, breakdown: { clarity: 14 }, biggestIssue: 'Missing CTA' },
  cached = null, preflight = {}, profile = {}, flag = { flag_status: 'white' }, lookupStatus = 200,
  lookupError = null, fetchImpl = null } = {}) {
  let currentProfile = { email: 'user@example.com', flag_status: 'white', exchangeCount: 0, ...profile };
  let currentPreflight = { status: 'idle', retryCount: 0, ...preflight };
  let scrapeCalls = 0;
  const fetchRequests = [], chatRequests = [], messages = [], thinking = [], cacheWrites = [];
  const abortControllerRef = { current: null };
  const context = {
    AbortController, Error,
    console: { log() {}, warn() {}, error() {} },
    navigator: { onLine: true },
    STEPS: { GREETING: 'GREETING' }, LEADS: {}, NAV_ACTION_RULES: [],
    useCallback: (fn) => fn,
    userProfile: currentProfile,
    auditPreflight: currentPreflight,
    setUserProfile: (updater) => { currentProfile = typeof updater === 'function' ? updater(currentProfile) : updater; },
    setAuditPreflight: (updater) => { currentPreflight = typeof updater === 'function' ? updater(currentPreflight) : updater; },
    setIsThinking: (value) => thinking.push(value),
    setViewState() {},
    getCachedScore: () => cached,
    setCachedScore: (...args) => cacheWrites.push(args),
    callScrapeWebsite: async () => { scrapeCalls++; return scrape; },
    fetch: async (url, options) => {
      fetchRequests.push({ url, ...options });
      if (fetchImpl) return fetchImpl(url, options);
      if (lookupError) throw lookupError;
      return { ok: lookupStatus >= 200 && lookupStatus < 300, json: async () => flag };
    },
    callHavenAPI: async (args) => { chatRequests.push(args); return { text: 'Haven answer', chips: [] }; },
    buildHavenSystemPrompt: () => 'Base system prompt',
    activeScope: 'audit', activeSessionId: 'audit-1', activeService: null,
    currentSession: { id: 'audit-1', messages: [] },
    getSessionsForScope: () => [{ id: 'audit-1', messages: [] }],
    createSession() { throw new Error('Existing audit session must be used'); },
    addMessage: (...args) => messages.push(args),
    abortControllerRef,
  };
  vm.runInNewContext(code, context);
  return { ...context.callbacks, fetchRequests, chatRequests, messages, thinking, cacheWrites, abortControllerRef,
    get profile() { return currentProfile; }, get preflight() { return currentPreflight; },
    get scrapeCalls() { return scrapeCalls; } };
}

for (const [label, summary] of [['missing', undefined], ['empty', ''], ['299 characters', 'a'.repeat(299)]]) {
  test(`Haven scraper: ${label} summary fails with exact message and clears stale score`, async () => {
    const ui = harness({ scrape: { ok: true, summary, score: 99 }, profile: {
      auditScore: 95, scoreBreakdown: { clarity: 20 }, biggestIssue: 'Old issue', scrapedWebSummary: 'Old summary',
    } });
    await ui.runScraper(SITE_URL);
    assert.equal(ui.preflight.status, 'failed');
    assert.equal(ui.preflight.error, 'Insufficient content extracted from site.');
    assert.equal(ui.preflight.score, null);
    assert.equal(ui.preflight.retryCount, 1);
    assert.equal(ui.profile.scrapeFailed, true);
    assert.equal(ui.profile.scrapedWebSummary, null);
    assert.equal(ui.profile.auditScore, null);
    assert.equal(ui.profile.scoreBreakdown, null);
    assert.equal(ui.profile.biggestIssue, null);
    assert.equal(ui.cacheWrites.length, 0);
  });
}

test('Haven scraper: exactly 300 characters reaches ready and saves the score', async () => {
  const ui = harness();
  await ui.runScraper(SITE_URL);
  assert.equal(ui.preflight.status, 'ready');
  assert.equal(ui.preflight.error, null);
  assert.equal(ui.preflight.summary.length, 300);
  assert.equal(ui.profile.auditScore, 76);
  assert.equal(ui.profile.scrapeFailed, false);
  assert.equal(ui.cacheWrites.length, 1);
  assert.equal(ui.cacheWrites[0][0], `website:${SITE_URL}`);
});

test('Haven scraper: legacy short cache is ignored and cannot supply a score', async () => {
  const ui = harness({ cached: { summary: 'a'.repeat(299), score: 99 } });
  await ui.runScraper(SITE_URL);
  assert.equal(ui.scrapeCalls, 1);
  assert.equal(ui.preflight.status, 'ready');
  assert.equal(ui.profile.auditScore, 76);
});

test('Haven scraper: legacy ready preflight with short content triggers a fresh scrape', async () => {
  const ui = harness({ preflight: { status: 'ready', url: SITE_URL, summary: 'Too short', score: 99 } });
  await ui.runScraper(SITE_URL);
  assert.equal(ui.scrapeCalls, 1);
  assert.equal(ui.preflight.summary.length, 300);
  assert.equal(ui.profile.auditScore, 76);
});

test('Haven flags: fresh red lookup appends the exact restriction and forwards the same abort signal', async () => {
  const ui = harness({ flag: { flag_status: 'red' } });
  await ui.sendMessage('Please help with marketing');
  assert.equal(ui.fetchRequests.length, 1);
  assert.equal(ui.fetchRequests[0].url, 'https://project.supabase.co/functions/v1/check-email-exists');
  assert.deepEqual(JSON.parse(ui.fetchRequests[0].body), { email: 'user@example.com', includeFlag: true });
  assert.equal(ui.fetchRequests[0].headers.Authorization, 'Bearer public-anon-key');
  assert.equal(ui.chatRequests[0].systemPrompt, `Base system prompt\n\n${RESTRICTION}`);
  assert.equal(ui.profile.flag_status, 'red');
  assert.equal(ui.fetchRequests[0].signal, ui.chatRequests[0].signal);
  assert.deepEqual(ui.thinking, [true, false]);
  assert.equal(ui.abortControllerRef.current, null);
});

test('Haven flags: fresh white clears a stale cached red flag before calling Haven', async () => {
  const ui = harness({ profile: { flag_status: 'red' }, flag: { flag_status: 'white' } });
  await ui.sendMessage('Please help');
  assert.equal(ui.profile.flag_status, 'white');
  assert.equal(ui.chatRequests[0].systemPrompt, 'Base system prompt');
  assert.deepEqual(ui.thinking, [true, false]);
});

test('Haven flags: red profile without an email still adds the exact restriction', async () => {
  const ui = harness({ profile: { email: '', flag_status: 'red' } });
  await ui.sendMessage('Please help');
  assert.equal(ui.fetchRequests.length, 0);
  assert.equal(ui.chatRequests[0].systemPrompt, `Base system prompt\n\n${RESTRICTION}`);
  assert.deepEqual(ui.thinking, [true, false]);
});

for (const [label, options] of [
  ['network failure', { lookupError: new Error('offline') }],
  ['HTTP failure', { lookupStatus: 500, flag: { flag_status: 'red' } }],
  ['missing flag response', { flag: { exists: true } }],
  ['invalid flag response', { flag: { flag_status: 'unknown' } }],
]) {
  test(`Haven flags: ${label} prevents the Haven request and clears thinking`, async () => {
    const ui = harness(options);
    await ui.sendMessage('Please help');
    assert.equal(ui.chatRequests.length, 0);
    assert.deepEqual(ui.thinking, [true, false]);
    assert.equal(ui.abortControllerRef.current, null);
    assert.equal(ui.messages.at(-1)[0], 'agent');
    assert.match(ui.messages.at(-1)[1], /trouble reaching the server/);
  });
}

test('Haven flags: external cancellation aborts the pending lookup and clears thinking', async () => {
  const external = new AbortController();
  const ui = harness({ fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('cancelled');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }) });
  const pending = ui.sendMessage('Please help', null, { signal: external.signal });
  assert.equal(ui.fetchRequests.length, 1);
  assert.equal(ui.thinking.at(-1), true);
  external.abort();
  await pending;
  assert.equal(ui.fetchRequests[0].signal.aborted, true);
  assert.equal(ui.chatRequests.length, 0);
  assert.deepEqual(ui.thinking, [true, false]);
  assert.equal(ui.messages.length, 1);
  assert.equal(ui.messages[0][0], 'user');
  assert.equal(ui.abortControllerRef.current, null);
});

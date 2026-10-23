import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/lib/havenSessionSync.js', import.meta.url), 'utf8')
  .replace('export function scheduleHavenSessionSync', 'function scheduleHavenSessionSync')
  .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://project.supabase.co'")
  .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'public-anon-key'");
const ACCESS_TOKEN = 'ab'.repeat(32);
const payload = (sessionId = 'session-1', count = 1) => ({
  sessionId, reviewId: `review-${sessionId}`, accessToken: ACCESS_TOKEN,
  messages: Array.from({ length: count }, (_, index) => ({ id: `m${index}`, role: index % 2 ? 'agent' : 'user', content: `message ${index}`, timestamp: index + 1 })),
});
const response = (status = 200, body = { ok: true }) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(send = async () => response()) {
  const timers = new Map(), requests = [], events = [], logs = [];
  let nextId = 0, now = 1_000_000;
  const context = {
    module: { exports: {} },
    TextEncoder,
    Date: class extends Date { static now() { return now; } },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    AbortSignal: { timeout: (duration) => ({ duration }) },
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
    window: { dispatchEvent(event) { events.push({ type: event.type, ...structuredClone(event.detail) }); } },
    console: Object.fromEntries(['warn', 'error', 'log'].map((kind) => [kind, (...args) => logs.push({ kind, args })])),
    async fetch(url, options) {
      const request = { url, ...options, payload: JSON.parse(options.body) };
      requests.push(request);
      return send(request, requests.length - 1);
    },
  };
  vm.runInNewContext(`${source}\nmodule.exports={scheduleHavenSessionSync};`, context);
  const runNext = () => {
    const entry = [...timers].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
    assert.ok(entry, 'Expected a pending synchronization timer');
    const [id, timer] = entry;
    timers.delete(id); now = timer.due;
    return timer.callback();
  };
  return {
    schedule: context.module.exports.scheduleHavenSessionSync, requests, events, logs, timers, runNext,
    async drain() { let count = 0; while (timers.size) { assert.ok(count++ < 15, 'Unexpected unbounded retry loop'); await runNext(); } },
  };
}

test('session sync client: one session serializes writes and sends the newest snapshot after the in-flight write', async () => {
  const first = deferred();
  const client = harness(async (_, index) => index === 0 ? first.promise : response());
  client.schedule(payload('session-1', 1));
  const firstWrite = client.runNext();
  assert.equal(client.requests.length, 1);
  client.schedule(payload('session-1', 2));
  await client.runNext();
  assert.equal(client.requests.length, 1, 'The old write must finish before another starts for this session');
  client.schedule(payload('session-1', 4));
  await client.runNext();
  assert.equal(client.requests.length, 1);
  first.resolve(response());
  await firstWrite;
  await client.drain();
  assert.deepEqual(client.requests.map((req) => req.payload.messages.length), [1, 4]);
  assert.deepEqual(client.events.map((event) => event.state), ['saving', 'saved', 'saving', 'saved']);
});

test('session sync client: long Unicode histories fit the server byte limit while retaining the newest message', async () => {
  const client = harness();
  const input = payload('session-1', 200);
  input.messages = input.messages.map((message) => ({ ...message, content: '界'.repeat(8000) }));
  input.messages[199].content = 'The most recent question';
  client.schedule(input);
  await client.drain();
  const sent = client.requests[0];
  assert.ok(new TextEncoder().encode(sent.body).byteLength < 300000);
  assert.ok(sent.payload.messages.length < 200);
  assert.equal(sent.payload.messages.at(-1).content, 'The most recent question');
});

test('session sync client: different sessions can save independently while one request is pending', async () => {
  const blocked = deferred();
  const client = harness(async (request) => request.payload.sessionId === 'session-1' ? blocked.promise : response());
  client.schedule(payload('session-1'));
  const firstWrite = client.runNext();
  client.schedule(payload('session-2', 2));
  await client.runNext();
  assert.equal(client.requests.length, 2);
  assert.ok(client.events.some((event) => event.sessionId === 'session-2' && event.state === 'saved'));
  blocked.resolve(response());
  await firstWrite;
  assert.equal(client.timers.size, 0);
});

test('session sync client: transient failures retry at most twice, emit failure, and never log private capabilities', async () => {
  for (const mode of ['network', 'http500', 'rate-limit']) {
    const client = harness(async () => {
      if (mode === 'network') throw new Error(`Network failed with ${ACCESS_TOKEN}`);
      return response(mode === 'http500' ? 500 : 429, { ok: false });
    });
    client.schedule(payload());
    await client.drain();
    assert.equal(client.requests.length, 3, `${mode} gets one attempt plus two retries`);
    assert.deepEqual(client.events.map((event) => event.state), ['saving', 'retrying', 'saving', 'retrying', 'saving', 'failed']);
    assert.equal(client.timers.size, 0);
    assert.ok(client.requests.every((request) => request.payload.accessToken === ACCESS_TOKEN));
    assert.ok(!JSON.stringify(client.logs).includes(ACCESS_TOKEN));
    assert.ok(!JSON.stringify(client.events).includes(ACCESS_TOKEN));
  }
});

test('session sync client: HTTP403 is terminal rather than repeatedly replaying invalid credentials', async () => {
  const client = harness(async () => response(403, { ok: false, error: 'Review access denied.' }));
  client.schedule(payload());
  await client.drain();
  assert.equal(client.requests.length, 1);
  assert.deepEqual(client.events.map((event) => event.state), ['saving', 'failed']);
});

test('session sync client: HTTP200 without ok:true is not acknowledged as saved', async () => {
  for (const body of [{ ok: false }, {}, { ok: 'true' }]) {
    const client = harness(async () => response(200, body));
    client.schedule(payload());
    await client.drain();
    assert.equal(client.requests.length, 1);
    assert.equal(client.events.at(-1).state, 'failed');
    assert.ok(!client.events.some((event) => event.state === 'saved'));
  }
});

test('session sync client: a newer pending snapshot survives an older request failure', async () => {
  const first = deferred();
  const client = harness(async (_, index) => index === 0 ? first.promise : response());
  client.schedule(payload('session-1', 1));
  const firstWrite = client.runNext();
  client.schedule(payload('session-1', 3));
  first.reject(new Error('Lost connection'));
  await firstWrite;
  await client.drain();
  assert.deepEqual(client.requests.map((request) => request.payload.messages.length), [1, 3]);
  assert.equal(client.events.at(-1).state, 'saved');
});

test('session sync client: debounce coalesces snapshots, requires all ownership credentials and strips image payloads', async () => {
  const client = harness();
  client.schedule({ sessionId: 'session-1' });
  client.schedule({ ...payload(), accessToken: '' });
  assert.equal(client.timers.size, 0);
  client.schedule(payload('session-1', 1));
  const latest = payload('session-1', 2);
  latest.messages[1].image = 'private-image-bytes';
  latest.messages[1].content = 'c'.repeat(9000);
  client.schedule(latest);
  assert.equal(client.timers.size, 1);
  await client.drain();
  assert.equal(client.requests.length, 1);
  const request = client.requests[0];
  assert.equal(request.url, 'https://project.supabase.co/functions/v1/sync-haven-session');
  assert.equal(request.headers.Authorization, 'Bearer public-anon-key');
  assert.equal(request.payload.reviewId, latest.reviewId);
  assert.equal(request.payload.accessToken, ACCESS_TOKEN);
  assert.equal(request.payload.messages[1].content.length, 8000);
  assert.equal(request.payload.messages[1].hasImage, true);
  assert.ok(!request.body.includes('private-image-bytes'));
});

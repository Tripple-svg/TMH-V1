import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const ENV = { INTERNAL_POLL_SECRET: 'poll-test-secret', CALENDLY_API_TOKEN: 'calendly-test-token', SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-test' };
const NOW = Date.parse('2026-10-19T12:00:00Z');
const HOUR_MS = 3600000;
const event = (id = 'event-1') => ({ uri: `https://api.calendly.com/scheduled_events/${id}`, start_time: '2026-10-20T17:00:00Z', created_at: new Date(NOW - 10 * 60000).toISOString() });
const invitee = (email = 'Owner@Example.com') => ({ email, name: 'Owner' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const request = (key = ENV.INTERNAL_POLL_SECRET) => new Request('https://project.supabase.co/functions/v1/calendly-poll-bookings', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(key === null ? {} : { 'x-internal-poll-key': key }) }, body: '{}',
});

function database(seed = {}, { onRead = () => {}, failInsert = false } = {}) {
  const rows = structuredClone({ brand_reviews: [], booking_intents: [], haven_sessions: [], calendly_processed_events: [], ...seed });
  const calls = [], emails = [];
  const client = {
    from(table) {
      let action = 'select', values, filters = [], sort = null, cap = Infinity;
      async function run(single = false) {
        calls.push({ table, action, values });
        if (action === 'select') onRead(table, rows);
        let selected = rows[table].filter((row) => filters.every((filter) => filter(row)));
        if (sort) selected.sort((a, b) => String(b[sort]).localeCompare(String(a[sort])));
        selected = selected.slice(0, cap);
        if (action === 'update') selected.forEach((row) => Object.assign(row, values));
        if (action === 'insert') {
          if (failInsert) return { data: null, error: { code: 'XX000' } };
          if (rows[table].some((row) => row.event_uuid === values.event_uuid)) return { data: null, error: { code: '23505' } };
          rows[table].push({ id: `new-${rows[table].length}`, ...values });
        }
        return { data: single ? selected[0] || null : selected, error: null };
      }
      return {
        select() { return this; },
        eq(column, value) { filters.push((row) => row[column] === value); return this; },
        ilike(column, pattern) { filters.push((row) => row[column]?.toLowerCase() === pattern.replace(/\\([\\%_])/g, '$1').toLowerCase()); return this; },
        or() { filters.push((row) => row.pre_call_briefing == null || row.pre_call_briefing === ''); return this; },
        order(column) { sort = column; return this; },
        limit(value) { cap = value; return this; },
        update(value) { action = 'update'; values = value; return this; },
        insert(value) { action = 'insert'; values = value; return this; },
        maybeSingle() { return run(true); },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
    },
    functions: { invoke: async (name, { body }) => {
      assert.equal(name, 'send-tmh-booking-confirmation'); emails.push(body);
      rows.booking_intents.find((row) => row.email.toLowerCase() === body.email).confirmation_sent = true;
      return { data: { ok: true }, error: null };
    } },
  };
  return { client, rows, calls, emails };
}

function load({ db = database(), events = [event()], invitees = [invitee()], api, env = {}, now = NOW } = {}) {
  let handler;
  const urls = [];
  const code = transformSync(readFileSync(new URL('../supabase/functions/calendly-poll-bookings/index.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(code, {
    require: (specifier) => specifier.includes('server.ts') ? { serve: (fn) => { handler = fn; } } : { createClient: () => db.client },
    Deno: { env: { get: (key) => ({ ...ENV, ...env })[key] } },
    fetch: async (url, options) => {
      assert.equal(options.headers.Authorization, `Bearer ${ENV.CALENDLY_API_TOKEN}`);
      const parsed = new URL(url); assert.equal(parsed.origin, 'https://api.calendly.com'); urls.push(parsed);
      if (api) return api(parsed);
      if (parsed.pathname === '/users/me') return json({ resource: { uri: 'https://api.calendly.com/users/owner' } });
      if (parsed.pathname === '/scheduled_events') return json({ collection: events });
      if (parsed.pathname.endsWith('/invitees')) return json({ collection: invitees });
      throw new Error('Unexpected URL');
    },
    Request, Response, Headers, URL, URLSearchParams, AbortSignal,
    Date: class extends Date { static now() { return now; } },
    console: { error() {} },
  });
  return { handler, db, urls };
}

test('rejects missing/wrong internal keys without making API or database calls', async () => {
  const { handler, urls, db } = load();
  assert.equal((await handler(request(null))).status, 401);
  assert.equal((await handler(request('wrong'))).status, 401);
  assert.equal(urls.length, 0); assert.equal(db.calls.length, 0);
  assert.equal((await load({ env: { INTERNAL_POLL_SECRET: undefined } }).handler(request())).status, 401);
});

test('skips processed events without fetching invitees or sending confirmation', async () => {
  const db = database({ calendly_processed_events: [{ id: 'done', event_uuid: 'event-1' }] });
  const { handler, urls } = load({ db });
  assert.deepEqual(await (await handler(request())).json(), { ok: true, scanned: 1, matched: 0 });
  assert.equal(urls.filter((url) => url.pathname.endsWith('/invitees')).length, 0);
  assert.equal(db.rows.calendly_processed_events.length, 1); assert.equal(db.emails.length, 0);
});

test('updates matching review and builds briefing from assessment and last five audit messages', async () => {
  const db = database({ brand_reviews: [{ id: 'review', email: 'owner@example.com', pre_call_briefing: null, haven_score: 72, biggest_leak: 'Weak CTA', assessment_summary: 'Clear brand', platform_type: 'website', main_goal: 'Growth' }], haven_sessions: [
    { review_id: 'review', scope: 'audit', updated_at: '2026-10-16', messages: Array.from({ length: 7 }, (_, i) => ({ role: 'user', content: `audit-${i}`, image: 'private-image' })) },
    { review_id: 'review', scope: 'support', updated_at: '2026-10-17', messages: [{ content: 'private-support' }] },
  ] });
  const { handler, urls } = load({ db });
  assert.deepEqual(await (await handler(request())).json(), { ok: true, scanned: 1, matched: 1 });
  const review = db.rows.brand_reviews[0]; assert.equal(review.call_booked_at, event().start_time);
  for (const expected of ['72', 'Weak CTA', 'Clear brand', 'website', 'Growth', 'audit-2', 'audit-6']) assert.ok(review.pre_call_briefing.includes(expected));
  for (const excluded of ['audit-0', 'audit-1', 'private-image', 'private-support']) assert.ok(!review.pre_call_briefing.includes(excluded));
  assert.equal(db.emails.length, 0); // A review alone must not send confirmation.
  assert.equal(db.rows.calendly_processed_events.length, 0); // A late intent must remain discoverable.
  const query = urls.find((url) => url.pathname === '/scheduled_events').searchParams;
  assert.equal(query.get('user'), 'https://api.calendly.com/users/owner'); assert.equal(query.get('status'), 'active'); assert.equal(query.get('count'), '100');
  assert.equal(Date.parse(query.get('min_start_time')), NOW - 3 * HOUR_MS);
  assert.equal(Date.parse(query.get('max_start_time')), NOW + 60 * 86400000);
});

test('preserves existing briefing while updating booked time and skips session query', async () => {
  const db = database({ brand_reviews: [{ id: 'review', email: 'owner@example.com', pre_call_briefing: 'Team-approved briefing' }] });
  await load({ db }).handler(request());
  assert.equal(db.rows.brand_reviews[0].pre_call_briefing, 'Team-approved briefing');
  assert.equal(db.rows.brand_reviews[0].call_booked_at, event().start_time);
  assert.ok(!db.calls.some((call) => call.table === 'haven_sessions'));
});

test('does not overwrite a briefing added concurrently after initial lookup', async () => {
  const db = database({ brand_reviews: [{ id: 'review', email: 'owner@example.com', pre_call_briefing: null }] }, {
    onRead(table, rows) { if (table === 'haven_sessions') rows.brand_reviews[0].pre_call_briefing = 'Added by team during poll'; },
  });
  assert.equal((await load({ db }).handler(request())).status, 200);
  assert.equal(db.rows.brand_reviews[0].pre_call_briefing, 'Added by team during poll');
});

test('sends only for matching unsent newest intent; sent or absent intent sends nothing', async () => {
  for (const confirmationSent of [false, true, 'absent']) {
    const intents = confirmationSent === 'absent' ? [] : [
      { id: 'old', email: 'owner@example.com', created_at: '2026-10-01', service_id: 'web', confirmation_sent: false },
      { id: 'new', email: 'owner@example.com', created_at: '2026-10-16', service_id: 'growth', confirmation_sent: confirmationSent },
    ];
    const db = database({ booking_intents: intents });
    const result = await load({ db }).handler(request()); assert.equal(result.status, 200);
    assert.equal(db.emails.length, confirmationSent === false ? 1 : 0);
    if (db.emails.length) {
      assert.equal(db.emails[0].email, 'owner@example.com'); assert.equal(db.emails[0].name, 'Owner'); assert.equal(db.emails[0].serviceId, 'growth');
    }
  }
});

test('records unmatched events so a second poll does not re-check invitees', async () => {
  const { handler, db, urls } = load();
  assert.deepEqual(await (await handler(request())).json(), { ok: true, scanned: 1, matched: 0 });
  assert.equal(db.rows.calendly_processed_events[0].event_uuid, 'event-1');
  assert.deepEqual(await (await handler(request())).json(), { ok: true, scanned: 1, matched: 0 });
  assert.equal(db.rows.calendly_processed_events.length, 1);
  assert.equal(urls.filter((url) => url.pathname.endsWith('/invitees')).length, 1);
});

test('Calendly API errors return ok:false without marking unfinished events', async () => {
  for (const failingPath of ['/users/me', '/scheduled_events', '/scheduled_events/event-1/invitees']) {
    const { handler, db } = load({ api: (url) => {
      if (url.pathname === failingPath) return json({ error: 'upstream failure' }, 403);
      if (url.pathname === '/users/me') return json({ resource: { uri: 'https://api.calendly.com/users/owner' } });
      return json({ collection: [event()] });
    } });
    const result = await handler(request()); assert.equal(result.status, 502); assert.deepEqual(await result.json(), { ok: false });
    assert.equal(db.rows.calendly_processed_events.length, 0);
  }
});

test('failed confirmation remains retryable and succeeds on the next poll', async () => {
  for (const fail of [
    async () => ({ data: { ok: false }, error: null }),
    async () => ({ data: null, error: { message: 'Resend delivery failed' } }),
    async () => { throw new Error('Network failure'); },
  ]) {
    const db = database({ booking_intents: [{ id: 'intent', email: 'owner@example.com', confirmation_sent: false, service_id: 'content' }] });
    const sendSuccessfully = db.client.functions.invoke;
    db.client.functions.invoke = fail;
    const { handler } = load({ db });
    const result = await handler(request());
    assert.equal(result.status, 500); assert.deepEqual(await result.json(), { ok: false });
    assert.equal(db.rows.calendly_processed_events.length, 0);
    db.client.functions.invoke = sendSuccessfully;
    assert.deepEqual(await (await handler(request())).json(), { ok: true, scanned: 1, matched: 1 });
    assert.equal(db.emails.length, 1);
    assert.equal(db.emails[0].bookingIntentId, 'intent');
    assert.equal(db.rows.calendly_processed_events.length, 1);
    assert.equal((await handler(request())).status, 200);
    assert.equal(db.emails.length, 1);
  }
});

test('review match waits for a late booking intent, then sends confirmation once', async () => {
  const db = database({ brand_reviews: [{ id: 'review', email: 'owner@example.com', pre_call_briefing: 'Existing briefing' }] });
  const { handler } = load({ db });
  assert.equal((await handler(request())).status, 200);
  assert.equal(db.rows.calendly_processed_events.length, 0);
  assert.equal(db.emails.length, 0);
  db.rows.booking_intents.push({ id: 'late', email: 'owner@example.com', confirmation_sent: false, service_id: 'growth' });
  assert.deepEqual(await (await handler(request())).json(), { ok: true, scanned: 1, matched: 1 });
  assert.equal(db.emails.length, 1);
  assert.equal(db.rows.calendly_processed_events.length, 1);
  assert.equal((await handler(request())).status, 200);
  assert.equal(db.emails.length, 1);
});

test('already-sent confirmations can complete events without another email', async () => {
  for (const seed of [
    { brand_reviews: [{ id: 'review', email: 'owner@example.com', booking_confirmation_sent: true, pre_call_briefing: 'Existing' }] },
    { booking_intents: [{ id: 'intent', email: 'owner@example.com', confirmation_sent: true }] },
  ]) {
    const db = database(seed);
    assert.equal((await load({ db }).handler(request())).status, 200);
    assert.equal(db.rows.calendly_processed_events.length, 1);
    assert.equal(db.emails.length, 0);
  }
});

test('failed confirmations age out after two hours from booking creation, including future meetings', async () => {
  const db = database({ booking_intents: [{ id: 'intent', email: 'owner@example.com', confirmation_sent: false }] });
  let attempts = 0;
  db.client.functions.invoke = async () => { attempts++; return { data: null, error: { message: 'Resend failed' } }; };
  const bookedAt = new Date(NOW - 2 * HOUR_MS - 1).toISOString();
  const { handler } = load({ db, events: [{ ...event(), created_at: bookedAt }] });
  assert.equal((await handler(request())).status, 200);
  assert.equal(db.rows.calendly_processed_events.length, 1);
  assert.equal(db.rows.booking_intents[0].confirmation_sent, false);
  assert.equal((await handler(request())).status, 200);
  assert.equal(attempts, 1);
});

test('review-only bookings age out and missing/invalid creation times fall back to meeting time', async () => {
  for (const createdAt of [undefined, 'invalid timestamp', new Date(NOW - 2 * HOUR_MS - 1).toISOString()]) {
    const db = database({ brand_reviews: [{ id: 'review', email: 'owner@example.com', pre_call_briefing: 'Existing' }] });
    const pastEvent = { ...event(), created_at: createdAt, start_time: new Date(NOW - 2 * HOUR_MS - 1).toISOString() };
    const { handler, urls } = load({ db, events: [pastEvent] });
    assert.equal((await handler(request())).status, 200);
    assert.equal(db.rows.calendly_processed_events.length, 1);
    const minStart = urls.find((url) => url.pathname === '/scheduled_events').searchParams.get('min_start_time');
    assert.ok(Date.parse(minStart) < Date.parse(pastEvent.start_time));
  }
});

test('a recent booking stays retryable even when the meeting started over two hours ago', async () => {
  const db = database({ booking_intents: [{ id: 'intent', email: 'owner@example.com', confirmation_sent: false }] });
  db.client.functions.invoke = async () => ({ data: { ok: false }, error: null });
  const recentBooking = { ...event(), start_time: new Date(NOW - 2 * HOUR_MS - 1).toISOString() };
  assert.equal((await load({ db, events: [recentBooking] }).handler(request())).status, 500);
  assert.equal(db.rows.calendly_processed_events.length, 0);
});

test('a failed event does not block confirmations and markers for later events', async () => {
  const db = database({ booking_intents: [
    { id: 'first', email: 'first@example.com', confirmation_sent: false },
    { id: 'second', email: 'second@example.com', confirmation_sent: false },
  ] });
  const sendSuccessfully = db.client.functions.invoke;
  db.client.functions.invoke = async (name, options) => options.body.email === 'first@example.com'
    ? { data: null, error: { message: 'Resend failed' } } : sendSuccessfully(name, options);
  const { handler } = load({ db, api: (url) => {
    if (url.pathname === '/users/me') return json({ resource: { uri: 'https://api.calendly.com/users/owner' } });
    if (url.pathname === '/scheduled_events') return json({ collection: [event('event-1'), event('event-2')] });
    return json({ collection: [invitee(url.pathname.includes('event-1') ? 'first@example.com' : 'second@example.com')] });
  } });
  assert.equal((await handler(request())).status, 500);
  assert.equal(db.emails.length, 1);
  assert.equal(db.emails[0].email, 'second@example.com');
  assert.deepEqual(db.rows.calendly_processed_events.map((row) => row.event_uuid), ['event-2']);
});

test('group event waits for every invitee and retries only confirmations still unsent', async () => {
  const db = database({ booking_intents: [
    { id: 'first', email: 'first@example.com', confirmation_sent: false },
    { id: 'second', email: 'second@example.com', confirmation_sent: false },
  ] });
  const sendSuccessfully = db.client.functions.invoke;
  db.client.functions.invoke = async (name, options) => options.body.email === 'first@example.com'
    ? { data: null, error: { message: 'Resend failed' } } : sendSuccessfully(name, options);
  const { handler } = load({ db, invitees: [invitee('first@example.com'), invitee('second@example.com'), invitee('unmatched@example.com')] });
  assert.equal((await handler(request())).status, 500);
  assert.equal(db.rows.calendly_processed_events.length, 0);
  assert.equal(db.emails.length, 1);
  db.client.functions.invoke = sendSuccessfully;
  assert.equal((await handler(request())).status, 200);
  assert.equal(db.rows.calendly_processed_events.length, 1);
  assert.deepEqual(db.emails.map((email) => email.email), ['second@example.com', 'first@example.com']);
});

test('follows event and invitee pagination and marks group event after all invitees', async () => {
  const { handler, db } = load({ api: (url) => {
    if (url.pathname === '/users/me') return json({ resource: { uri: 'https://api.calendly.com/users/owner' } });
    const second = url.searchParams.has('page_token');
    if (url.pathname === '/scheduled_events') return json({ collection: [event(second ? 'event-2' : 'event-1')], pagination: { next_page_token: second ? null : 'events-next' } });
    if (url.pathname.endsWith('/event-1/invitees')) return json({ collection: [invitee(second ? 'second@example.com' : 'first@example.com')], pagination: { next_page: second ? null : 'https://calendly.com/scheduled_events/event-1/invitees?page_token=invitees-next' } });
    return json({ collection: [invitee('third@example.com')] });
  } });
  assert.deepEqual(await (await handler(request())).json(), { ok: true, scanned: 2, matched: 0 });
  assert.equal(db.rows.calendly_processed_events.length, 2);
  assert.equal(db.calls.filter((call) => call.table === 'brand_reviews').length, 3);
});

test('database marker failure reports failure instead of success', async () => {
  const db = database({}, { failInsert: true });
  const result = await load({ db }).handler(request()); assert.equal(result.status, 500);
  assert.deepEqual(await result.json(), { ok: false }); assert.equal(db.rows.calendly_processed_events.length, 0);
});

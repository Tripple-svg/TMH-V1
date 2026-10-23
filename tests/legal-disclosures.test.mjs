import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function render(path, name, overrides = {}) {
  let state = 0;
  const source = read(path).replace(/^import[^\n]*\r?\n/gm, '').replace('export default function ', 'function ');
  const context = {
    module: { exports: {} },
    React: { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) { const slot = state++; return [slot in overrides ? overrides[slot] : typeof initial === 'function' ? initial() : initial, () => {}]; },
    useEffect() {}, useRef: (initial) => ({ current: initial }),
    useSearchParams: () => [new URLSearchParams('token=verified-request')],
    motion: { div: 'div' }, Link: 'link', ArrowLeft: 'icon', ArrowUp: 'icon', CheckCircle2: 'icon', X: 'icon', AlertTriangle: 'icon', LoaderCircle: 'icon',
  };
  vm.runInNewContext(transformSync(`${source}\nmodule.exports=${name};`, { loader: 'jsx', format: 'cjs' }).code, context);
  return context.module.exports({ onClose() {} });
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (node == null || typeof node === 'boolean') return '';
  return typeof node === 'object' ? text(node.props.children) : String(node);
}
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((value) => find(value, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...find(node.props.children, predicate)];
}

test('privacy: saved review/support/service conversations and authorized team access are disclosed', () => {
  const page = render('src/pages/PrivacyPage.jsx', 'PrivacyPage');
  const copy = text(page);
  assert.match(copy, /brand review, support and service chat messages/i);
  assert.match(copy, /team members with admin access can read saved messages/i);
  assert.match(copy, /one saved brand review per email/i);
  assert.match(copy, /valid proof of access to a saved review/i);
  assert.match(copy, /do not link chat histories merely because someone types a matching email/i);
  assert.ok(!copy.includes('links multiple reviews'));
  assert.ok(!copy.includes('By using this website, you agree to this policy'));
});

test('privacy and terms: warning automation, human restriction review, and privacy rights remain explicit', () => {
  const privacy = text(render('src/pages/PrivacyPage.jsx', 'PrivacyPage'));
  const terms = text(render('src/pages/TermsPage.jsx', 'TermsPage'));
  for (const copy of [privacy, terms]) {
    assert.match(copy, /Nigeria Data Protection Act 2023/);
    assert.match(copy, /yellow warning/);
    assert.match(copy, /red (?:flag|restriction)/);
    assert.match(copy, /Resend/);
    assert.match(copy, /human review/);
    assert.match(copy, /NDPC/);
    assert.match(copy, /info@themarketinghaven\.xyz/);
  }
  assert.match(privacy, /legitimate interests/);
  assert.match(privacy, /consent must be requested separately/);
  assert.match(privacy, /data portability/);
  assert.match(terms, /statutory right that cannot lawfully be excluded/);
  assert.ok(!terms.includes('without notice and without refund'));
});

test('privacy: provider processing reflects paid Gemini guard without promising universal no-training', () => {
  const page = render('src/pages/PrivacyPage.jsx', 'PrivacyPage');
  const copy = text(page);
  assert.match(copy, /Groq for text processing/);
  assert.match(copy, /Gemini chat and image processing disabled until TMH confirms the paid-service configuration/);
  assert.match(copy, /possible human review/);
  assert.ok(!copy.includes('We do not use your conversations to train public models'));
  assert.ok(find(page, (node) => node.props.href === 'https://ai.google.dev/gemini-api/terms').length);
  assert.ok(find(page, (node) => node.props.href === 'https://ndpc.gov.ng/').length);
});

test('deletion disclosures: policies and request/confirmation pages describe the actual limited flow', () => {
  const pages = [
    render('src/pages/PrivacyPage.jsx', 'PrivacyPage'),
    render('src/pages/TermsPage.jsx', 'TermsPage'),
    render('src/components/legal/DataDeletionModal.jsx', 'DataDeletionDialog'),
    render('src/pages/DataDeletionConfirmPage.jsx', 'DataDeletionConfirmPage', { 0: { token: 'verified-request', status: 'success', error: '' } }),
  ];
  for (const page of pages) {
    const copy = text(page);
    assert.match(copy, /(?:linked chat|linked chats)/i);
    assert.match(copy, /screenshots/i);
    assert.match(copy, /purchase/i);
    assert.match(copy, /booking/i);
    assert.match(copy, /unlinked guest/i);
    assert.match(copy, /info@themarketinghaven\.xyz/);
    assert.ok(!copy.includes('All records, chat transcripts, and screenshots associated with your email have been permanently removed'));
    assert.ok(!copy.includes('permanently deletes all of your reviews'));
  }
  const privacy = text(pages[0]);
  assert.match(privacy, /session ID alone is not proof of ownership/);
  assert.match(privacy, /Never send private access keys in an ordinary email/);
  assert.match(text(pages[2]), /Requesting a link keeps this device/);
});

function deletionHandler(name) {
  let handler;
  const emails = [];
  const client = { from(table) {
    return {
      select() { return this; }, eq() { return this; }, ilike() { return this; }, limit() { return this; },
      update() { return this; }, insert() { return this; },
      async maybeSingle() { return { data: { id: 'request-1', email: 'owner@example.com', expires_at: new Date(Date.now() + 60000).toISOString(), status: 'pending' }, error: null }; },
      then(resolve, reject) { return Promise.resolve({ data: table === 'brand_reviews' && name === 'request-data-deletion' ? [{ id: 'review-1', email: 'owner@example.com' }] : [], error: null }).then(resolve, reject); },
    };
  } };
  const code = transformSync(read(`supabase/functions/${name}/index.ts`), { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(code, {
    require: (module) => module.includes('server.ts') ? { serve: (callback) => { handler = callback; } } : { createClient: () => client },
    Deno: { env: { get: () => 'configured-for-test' } },
    Response, Request, Uint8Array, crypto: webcrypto,
    fetch: async (_, options) => { emails.push(JSON.parse(options.body)); return new Response(JSON.stringify({ id: 'email-1' })); },
    console: { error() {} },
  });
  return { handler, emails };
}

test('deletion emails: request and completion messages avoid promising every record is erased', async () => {
  for (const name of ['request-data-deletion', 'confirm-data-deletion']) {
    const { handler, emails } = deletionHandler(name);
    const response = await handler(new Request('https://project.supabase.co/functions/v1/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://themarketinghaven.xyz' },
      body: JSON.stringify(name === 'request-data-deletion' ? { email: 'owner@example.com' } : { token: 'verified-request' }),
    }));
    assert.equal(response.status, 200);
    assert.equal(emails.length, 1);
    assert.match(emails[0].subject, /saved review deletion/i);
    assert.match(emails[0].text, /linked chat sessions/);
    assert.match(emails[0].text, /Purchase, booking/);
    assert.match(emails[0].text, /unlinked guest chats/);
    assert.ok(!emails[0].text.includes('All records'));
  }
});

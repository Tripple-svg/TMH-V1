import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { reviewScreenshotError, reviewScreenshotFileError } from '../src/lib/reviewScreenshot.js';

const REVIEW_ID = '18db594d-00f2-45b8-8039-3c67af2575e0';
const SESSION_ID = '70f66ca0-dbef-4314-b4b4-bec51ee341ee';
const ACCESS_TOKEN = 'ab'.repeat(32);
const SAVE_ERROR = 'Something went wrong saving your review. Please try again.';
const IMAGE = 'data:image/png;base64,aW1hZ2U=';
const ORIGINAL_IMAGE = 'data:image/png;base64,b3JpZ2luYWw=';
const EDITED_IMAGE = 'data:image/png;base64,ZWRpdGVk';
const screenshotValidators = { reviewScreenshotError, reviewScreenshotFileError };
const fixture = {
  fullName: 'Ada Founder', brandName: 'Ada Studio', whatsapp: '+2348000000000', email: 'ada@example.com',
  mainGoal: 'More Leads & Enquiries', platformType: 'social', socialPlatform: 'Instagram',
  socialLink: '@adastudio', websiteUrl: '',
};
const storage = (items = new Map()) => ({
  getItem: (key) => items.get(key) ?? null,
  setItem: (key, value) => items.set(key, value),
  removeItem: (key) => items.delete(key),
});
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const compile = (source, loader = 'jsx') => transformSync(source, { loader, format: 'cjs' }).code;
const envSource = (source) => source
  .replaceAll('import.meta.env.VITE_SUPABASE_URL', "'https://project.supabase.co'")
  .replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY', "'public-anon-key'");
const textContent = (value) => Array.isArray(value) ? value.map(textContent).join('')
  : typeof value === 'string' ? value : value && typeof value === 'object' ? textContent(value.props?.children) : '';

function service(fetch, saved = new Map(), timeout = AbortSignal) {
  const context = {
    module: { exports: {} }, crypto: webcrypto, Uint8Array, AbortSignal: timeout,
    sessionStorage: storage(saved), fetch,
    require(name) {
      if (name.endsWith('reviewScreenshot')) return screenshotValidators;
      return { supabase: new Proxy({}, { get() { throw new Error('Creation must not use browser database/storage writes'); } }) };
    },
  };
  vm.runInNewContext(compile(envSource(read('src/lib/brandReviewService.js')), 'js'), context);
  return context.module.exports.createBrandReview;
}

function component(source, { requires = {}, props, globals = {}, exportName = 'default' } = {}) {
  let cursor = 0;
  const slots = [], effects = [];
  const react = {
    lazy: () => 'LazyPage', Suspense: 'Suspense',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!(index in slots) || deps.some((value, i) => value !== slots[index][i])) effects.push(effect);
      slots[index] = deps;
    },
  };
  const context = {
    module: { exports: {} }, crypto: webcrypto, React: react,
    document: { body: { style: {} } },
    window: { addEventListener() {}, removeEventListener() {} },
    localStorage: storage(), sessionStorage: storage(),
    require(name) {
      if (name === 'react') return react;
      if (name === 'framer-motion') return { motion: new Proxy({}, { get: (_, name) => name }), AnimatePresence: 'presence', useReducedMotion: () => false };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, name) => name });
      if (name.endsWith('reviewScreenshot')) return screenshotValidators;
      return requires[name] || { default: name, __esModule: true };
    },
    ...globals,
  };
  vm.runInNewContext(compile(envSource(source)), context);
  function render() {
    cursor = 0;
    const nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node); walk(node.props?.children);
    }
    walk(context.module.exports[exportName](props));
    return nodes;
  }
  return { render, mount() { render(); effects.splice(0).forEach((effect) => effect()); return render(); } };
}

function reviewModal(onSubmit, saved = new Map()) {
  let closed = 0, cleared = 0, resets = 0;
  const ui = component(read('src/components/modals/BrandReviewModal.jsx'), {
    props: { isOpen: true, onClose() { closed++; }, onSubmit },
    requires: {
      '@hcaptcha/react-hcaptcha': { default: 'captcha', __esModule: true },
      '../haven/utils/reviewPersistence': {
        DEFAULT_FORM_DATA: { ...fixture, fullName: '' }, loadReviewFormData: () => ({ ...fixture }), loadReviewFormStep: () => 1,
        saveReviewFormData() {}, saveReviewFormStep() {}, clearReviewFormData() { cleared++; },
      },
    },
    globals: {
      sessionStorage: storage(saved),
      fetch: async (url) => {
        assert.ok(url.endsWith('/check-email-exists'), 'The browser must not consume the CAPTCHA separately');
        return Response.json({ exists: false });
      },
      FileReader: class {
        readAsDataURL() { this.result = 'data:image/png;base64,aW1hZ2U='; this.onload(); }
      },
    },
  });
  ui.mount();
  async function ready({ chooseImage = true } = {}) {
    ui.render().find((node) => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } });
    const next = ui.render().find((node) => node.type === 'button' && textContent(node).includes('Continue to Step 2'));
    await next.props.onClick();
    if (chooseImage) ui.render().find((node) => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [{ name: 'profile.png', type: 'image/png', size: 100 }] } });
    verify('captcha-first');
  }
  function verify(token) {
    const captcha = ui.render().find((node) => node.type === 'captcha');
    captcha.props.ref.current = { resetCaptcha() { resets++; } };
    captcha.props.onVerify(token);
  }
  const submit = () => ui.render().find((node) => node.type === 'button' && /Start Free Brand Review|Saving…/.test(textContent(node)));
  return { ...ui, ready, verify, submit, get closed() { return closed; }, get cleared() { return cleared; }, get resets() { return resets; } };
}

test('creation sends CAPTCHA and screenshot only to server, with a bounded request and private stable credentials', async () => {
  const saved = new Map();
  let requestBody, deadline;
  const create = service(async (url, options) => {
    assert.equal(url, 'https://project.supabase.co/functions/v1/create-brand-review');
    assert.equal(options.method, 'POST');
    requestBody = JSON.parse(options.body);
    return Response.json({ ok: true, reviewId: requestBody.id, sessionId: requestBody.sessionId });
  }, saved, { timeout(ms) { deadline = ms; return AbortSignal.timeout(ms); } });
  const result = await create({ id: REVIEW_ID, ...fixture, hcaptchaToken: 'single-use', screenshotBase64: IMAGE });
  assert.equal(result.success, true); assert.equal(result.reviewId, REVIEW_ID);
  assert.match(result.accessToken, /^[a-f\d]{64}$/); assert.equal(result.accessToken, requestBody.accessToken);
  assert.equal(requestBody.hcaptchaToken, 'single-use'); assert.equal(requestBody.screenshotBase64, IMAGE);
  assert.equal(deadline, 30000); assert.equal(saved.size, 0);
});

test('lost-response and reload retry reuse the same review/session/token rather than creating a second record', async () => {
  const saved = new Map(), attempts = [];
  const first = service(async (_url, options) => { attempts.push(JSON.parse(options.body)); throw new Error('Response lost after server commit'); }, saved);
  assert.equal((await first({ id: REVIEW_ID, ...fixture, hcaptchaToken: 'first', screenshotBase64: ORIGINAL_IMAGE, screenshotFileName: 'original.png' })).success, false);
  assert.equal(saved.size, 1);
  assert.ok(![...saved.values()][0].includes('hcaptchaToken'));
  const retry = service(async (_url, options) => {
    const body = JSON.parse(options.body); attempts.push(body);
    return Response.json({ ok: true, reviewId: body.id, sessionId: body.sessionId });
  }, saved);
  const result = await retry({ id: REVIEW_ID, ...fixture, hcaptchaToken: 'fresh' });
  assert.equal(result.success, true);
  for (const key of ['id', 'sessionId', 'accessToken']) assert.equal(attempts[0][key], attempts[1][key]);
  assert.equal(attempts[1].screenshotBase64, ORIGINAL_IMAGE); assert.equal(attempts[1].screenshotFileName, 'original.png');
  assert.equal(attempts[1].hcaptchaToken, 'fresh'); assert.equal(saved.size, 0);
});

test('screenshot quota failure still preserves small credentials for a reload retry with the original image', async () => {
  class LimitedStorage extends Map {
    set(key, value) {
      if (value.length > 1000) throw new DOMException('Storage full', 'QuotaExceededError');
      return super.set(key, value);
    }
  }
  const saved = new LimitedStorage(), bodies = [];
  const payload = { id: REVIEW_ID, ...fixture, screenshotBase64: 'data:image/png;base64,' + 'a'.repeat(2000), screenshotFileName: 'original.png' };
  const first = service(async (_url, options) => { bodies.push(JSON.parse(options.body)); throw new Error('Lost response'); }, saved);
  await first(payload);
  const persisted = JSON.parse([...saved.values()][0]);
  assert.equal(persisted.submission.screenshotBase64, null); assert.equal(persisted.submission.screenshotFileName, 'original.png');
  const retry = service(async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    return Response.json({ ok: true, reviewId: body.id, sessionId: body.sessionId });
  }, saved);
  assert.equal((await retry(payload)).success, true);
  assert.equal(bodies[1].accessToken, bodies[0].accessToken);
  assert.equal(bodies[1].screenshotBase64, payload.screenshotBase64);
});

test('retry refuses changed details and still accepts a fresh CAPTCHA for the unchanged submission', async () => {
  const saved = new Map(), bodies = [];
  const create = service(async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    if (bodies.length === 1) throw new Error('Lost response');
    return Response.json({ ok: true, reviewId: body.id, sessionId: body.sessionId });
  }, saved);
  const original = { id: REVIEW_ID, ...fixture, screenshotBase64: ORIGINAL_IMAGE, screenshotFileName: 'original.png', hcaptchaToken: 'first' };
  await create(original);
  const result = await create({ ...original, fullName: 'Edited Name', email: 'edited@example.com', screenshotBase64: EDITED_IMAGE, hcaptchaToken: 'fresh' });
  assert.equal(result.success, false); assert.equal(result.code,'pending_submission_changed'); assert.equal(bodies.length,1);
  const retryResult = await create({ ...original, hcaptchaToken:'fresh' });
  assert.equal(retryResult.success,true);
  for (const field of ['fullName', 'email', 'screenshotBase64', 'screenshotFileName']) {
    assert.equal(bodies[1][field], original[field]);
    assert.equal(retryResult.submission[field], original[field]);
  }
  assert.equal(bodies[1].hcaptchaToken, 'fresh');
  assert.equal(retryResult.submission.hcaptchaToken, undefined);
});

test('HTTP errors, malformed replies, mismatched IDs and timeout never become a saved review', async () => {
  const replies = [
    () => Response.json({ ok: true }, { status: 500 }),
    () => new Response('not json'),
    () => Response.json({ ok: true, reviewId: REVIEW_ID, sessionId: 'unrelated-session' }),
    () => { throw new DOMException('Timed out', 'TimeoutError'); },
  ];
  for (const reply of replies) {
    const result = await service(reply)({ id: REVIEW_ID, ...fixture });
    assert.equal(result.success, false); assert.equal(result.reviewId, null); assert.equal(result.accessToken, null);
  }
});

test('modal awaits deferred save, blocks close and double submit, and retains screenshot/form until success', async () => {
  let finish, attempts = 0, submitted;
  const ui = reviewModal((payload) => { attempts++; submitted = payload; return new Promise((resolve) => { finish = resolve; }); });
  await ui.ready();
  const originalSubmit = ui.submit();
  const saving = originalSubmit.props.onClick();
  await originalSubmit.props.onClick();
  const pending = ui.render();
  assert.equal(attempts, 1); assert.equal(ui.cleared, 0);
  assert.equal(ui.submit().props.disabled, true);
  pending.find((node) => node.props['aria-label'] === 'Close').props.onClick();
  assert.equal(ui.closed, 0);
  assert.ok(pending.some((node) => node.type === 'img' && node.props.src === submitted.screenshotBase64));
  assert.equal(submitted.fullName, fixture.fullName); assert.equal(submitted.hcaptchaToken, 'captcha-first');
  finish({ success: true }); await saving;
  assert.equal(ui.cleared, 1); assert.ok(!ui.render().some((node) => node.type === 'img'));
});

test('failed save preserves the form/image, shows the exact alert, resets CAPTCHA and retries the same submission ID', async () => {
  const attempts = [];
  const ui = reviewModal(async (payload) => { attempts.push(payload); return { success: attempts.length > 1 }; });
  await ui.ready(); await ui.submit().props.onClick();
  const failed = ui.render();
  assert.equal(ui.closed, 0); assert.equal(ui.cleared, 0); assert.equal(ui.resets, 1);
  assert.equal(failed.find((node) => node.props.role === 'alert').props.children.join(''), SAVE_ERROR);
  assert.ok(failed.some((node) => node.type === 'img' && node.props.src === attempts[0].screenshotBase64));
  ui.verify('captcha-retry'); await ui.submit().props.onClick();
  assert.equal(attempts[1].id, attempts[0].id); assert.equal(attempts[1].screenshotBase64, attempts[0].screenshotBase64);
  assert.equal(attempts[1].hcaptchaToken, 'captcha-retry'); assert.equal(ui.cleared, 1);
});

test('a rejected submit promise keeps the draft and reports failure instead of resetting', async () => {
  const ui = reviewModal(async () => { throw new Error('Connection failed'); });
  await ui.ready(); await ui.submit().props.onClick();
  assert.equal(ui.cleared, 0); assert.equal(ui.closed, 0);
  assert.equal(ui.render().find((node) => node.props.role === 'alert').props.children.join(''), SAVE_ERROR);
});

test('a reloaded pending modal restores the original screenshot and reuses its submission ID', async () => {
  const saved = new Map([
    ['tmh_review_submission_id_v1', REVIEW_ID],
    [`haven_review_creation_${REVIEW_ID}`, JSON.stringify({ sessionId: SESSION_ID, accessToken: ACCESS_TOKEN, screenshotBase64: 'data:image/png;base64,b3JpZ2luYWw=', screenshotFileName: 'original.png' })],
  ]);
  let submitted;
  const ui = reviewModal(async (payload) => { submitted = payload; return { success: true }; }, saved);
  await ui.ready({ chooseImage: false });
  assert.ok(ui.render().some((node) => node.type === 'img' && node.props.src === 'data:image/png;base64,b3JpZ2luYWw='));
  await ui.submit().props.onClick();
  assert.equal(submitted.id, REVIEW_ID);
  assert.equal(saved.has('tmh_review_submission_id_v1'), false);
});

test('quota-limited reload asks for the original screenshot and blocks submission until it is selected', async () => {
  const saved = new Map([
    ['tmh_review_submission_id_v1', REVIEW_ID],
    [`haven_review_creation_${REVIEW_ID}`, JSON.stringify({ sessionId: SESSION_ID, accessToken: ACCESS_TOKEN, submission: { ...fixture, agreedToTerms: true, screenshotBase64: null, screenshotFileName: 'original.png' } })],
  ]);
  let submitted = 0;
  const ui = reviewModal(async () => { submitted++; return { success: true }; }, saved);
  await ui.ready({ chooseImage: false });
  await ui.submit().props.onClick();
  assert.equal(submitted, 0);
  assert.match(textContent(ui.render().find((node) => node.props.role === 'alert')), /reselect your original screenshot/);
  ui.render().find((node) => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [{ name: 'original.png', type: 'image/png', size: 100 }] } });
  await ui.submit().props.onClick();
  assert.equal(submitted, 1);
});

function app(createBrandReview) {
  const source = read('src/App.jsx').replace('function AppInner()', 'export function AppInner()');
  const opened = [], timers = [], saved = new Map();
  const ui = component(source, {
    exportName: 'AppInner',
    requires: {
      'react-router-dom': { useNavigate: () => () => {} },
      './components/haven/context/HavenContext': { useHaven: () => ({ openDrawer: (...args) => opened.push(args), hasExistingReview: () => false }) },
      './lib/brandReviewService': { createBrandReview },
      './lib/trackingUtils': { captureTrackingData: () => ({ utmSource: 'test' }) },
    },
    globals: { localStorage: storage(saved), setTimeout: (callback) => timers.push(callback) },
  });
  ui.mount();
  const getModal = () => ui.render().find((node) => node.type === './components/modals/BrandReviewModal');
  ui.render().find((node) => node.type === './components/layout/Header').props.onOpenReview();
  return { ...ui, getModal, opened, timers, saved };
}

test('App keeps the form open and never opens a ghost drawer after a failed save', async () => {
  const ui = app(async () => ({ success: false }));
  const result = await ui.getModal().props.onSubmit({ id: REVIEW_ID, ...fixture });
  assert.equal(result.success, false); assert.equal(ui.getModal().props.isOpen, true);
  assert.equal(ui.opened.length, 0); assert.equal(ui.timers.length, 0); assert.equal(ui.saved.size, 0);
});

test('App waits for a saved review, forwards CAPTCHA and opens the drawer only with the returned capability', async () => {
  let finish, submitted;
  const ui = app((payload) => { submitted = payload; return new Promise((resolve) => { finish = resolve; }); });
  const pending = ui.getModal().props.onSubmit({ id: REVIEW_ID, ...fixture, hcaptchaToken: 'captcha-server-only' });
  assert.equal(ui.getModal().props.isOpen, true); assert.equal(ui.opened.length, 0);
  assert.equal(submitted.hcaptchaToken, 'captcha-server-only');
  finish({ success: true, reviewId: REVIEW_ID, sessionId: SESSION_ID, accessToken: ACCESS_TOKEN });
  assert.equal((await pending).success, true); assert.equal(ui.getModal().props.isOpen, false);
  ui.timers.forEach((callback) => callback());
  assert.equal(ui.opened.length, 1);
  assert.equal(ui.opened[0][1].profileData.accessToken, ACCESS_TOKEN);
  assert.equal(ui.saved.get('haven_review_id'), REVIEW_ID);
});

test('App rejects incomplete success responses instead of opening a drawer without ownership', async () => {
  for (const missing of ['reviewId', 'sessionId', 'accessToken']) {
    const result = { success: true, reviewId: REVIEW_ID, sessionId: SESSION_ID, accessToken: ACCESS_TOKEN };
    delete result[missing];
    const ui = app(async () => result);
    assert.equal((await ui.getModal().props.onSubmit({ id: REVIEW_ID, ...fixture })).success, false);
    assert.equal(ui.getModal().props.isOpen, true); assert.equal(ui.opened.length, 0);
  }
});

test('App opens the saved original profile after retry, including its original email and screenshot filename', async () => {
  let attempts = 0;
  const create = service(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (++attempts === 1) throw new Error('Response lost');
    return Response.json({ ok: true, reviewId: body.id, sessionId: body.sessionId });
  });
  const ui = app(create);
  const payload = { id: REVIEW_ID, ...fixture, screenshotBase64: ORIGINAL_IMAGE, screenshotFileName: 'original.png', hcaptchaToken: 'first' };
  assert.equal((await ui.getModal().props.onSubmit(payload)).success, false);
  assert.equal((await ui.getModal().props.onSubmit({ ...payload, fullName: 'Edited', email: 'edited@example.com', hcaptchaToken: 'fresh' })).success, false);
  assert.equal(ui.opened.length,0);
  assert.equal((await ui.getModal().props.onSubmit({ ...payload, hcaptchaToken:'fresh' })).success,true);
  ui.timers.forEach((callback) => callback());
  const profile = ui.opened[0][1].profileData;
  assert.equal(profile.name, fixture.fullName); assert.equal(profile.email, fixture.email);
  assert.equal(profile.screenshot, ORIGINAL_IMAGE); assert.equal(profile.screenshotFileName, 'original.png');
});

test('invalid screenshots cannot poison creation retries; a valid replacement for the same ID succeeds', async () => {
  const saved = new Map();
  let requests = 0;
  const create = service(async (_url, options) => {
    requests++;
    const body = JSON.parse(options.body);
    assert.equal(body.screenshotBase64, IMAGE);
    return Response.json({ ok: true, reviewId: body.id, sessionId: body.sessionId });
  }, saved);
  const invalid = ['data:image/gif;base64,aW1hZ2U=', 'data:image/png;base64,a===', 'data:image/png;base64,' + 'A'.repeat(7_000_000)];
  for (const screenshotBase64 of invalid) {
    assert.equal((await create({ id: REVIEW_ID, ...fixture, screenshotBase64 })).success, false);
    assert.equal(saved.size, 0); assert.equal(requests, 0);
  }
  assert.equal((await create({ id: REVIEW_ID, ...fixture, screenshotBase64: IMAGE })).success, true);
  assert.equal(requests, 1);
});

test('the modal rejects unsupported and oversized files visibly before reading them, then permits a valid replacement', async () => {
  let attempts = 0;
  const ui = reviewModal(async () => { attempts++; return { success: true }; });
  await ui.ready({ chooseImage: false });
  for (const file of [{ name: 'animation.gif', type: 'image/gif', size: 100 }, { name: 'large.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 }]) {
    const input = ui.render().find((node) => node.type === 'input' && node.props.type === 'file');
    assert.equal(input.props.accept, 'image/png,image/jpeg,image/webp');
    input.props.onChange({ target: { files: [file] } });
    assert.ok(ui.render().some((node) => node.props.role === 'alert'));
    await ui.submit().props.onClick(); assert.equal(attempts, 0);
  }
  ui.render().find((node) => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [{ name: 'valid.png', type: 'image/png', size: 100 }] } });
  await ui.submit().props.onClick(); assert.equal(attempts, 1);
});

import * as lockout from '../src/lib/adminLockout.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as passwords from '../src/lib/adminPassword.js';
import * as mfa from '../src/lib/adminMfa.js';

const pass = { password: 'a unique password for this account', confirmation: 'a unique password for this account' };
function authFixture({ user = { id: 'owner-id', email: 'owner@example.com', app_metadata: { role: 'admin' } }, session = { access_token: 'signed-token' }, passwordError, updateError } = {}) {
  const calls = [];
  return { calls, auth: {
    mfa:{listFactors:async()=>({data:{all:user.factors||[]}}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1',nextLevel:'aal1'}})},
    async getSession() { calls.push(['session']); return { data: { session } }; },
    async getUser(token) { calls.push(['user', token]); return { data: { user } }; },
    async signInWithPassword(credentials) { calls.push(['reauth', credentials]); return { data: { user, session }, error: passwordError }; },
    async updateUser(input) { calls.push(['update', input]); return { error: updateError }; },
    async signOut(input) { calls.push(['out', input]); },
  } };
}
test('password callback retains only safe status, catches consumed links and treats direct visits as changes', () => {
  const callback = passwords.readAdminAuthLink('https://themarketinghaven.xyz/admin/accept-invite#access_token=never-store&refresh_token=never-store&type=recovery');
  assert.deepEqual(callback, { problem: null, change: false, type: 'recovery' });
  assert.equal(JSON.stringify(callback).includes('never-store'), false);
  assert.deepEqual(passwords.readAdminAuthLink('https://themarketinghaven.xyz/admin/accept-invite?error_code=otp_expired'), { problem: 'expired', change: false, type: null });
  assert.match(passwords.adminLinkError('expired'), /already been used/);
  assert.equal(passwords.readAdminAuthLink('https://themarketinghaven.xyz/admin/accept-invite').type, null);
  assert.equal(passwords.readAdminAuthLink('https://themarketinghaven.xyz/admin/accept-invite#type=invite').type, null);
  assert.equal(passwords.readAdminAuthLink('https://themarketinghaven.xyz/admin/accept-invite#type=recovery&access_token=&refresh_token=').type, null);
  assert.equal(passwords.readAdminAuthLink('https://themarketinghaven.xyz/admin/accept-invite?flow=change').change, true);
});
test('forgot password uses the exact existing callback and reveals no account existence', async () => {
  const calls = [];
  const auth = { async resetPasswordForEmail(...args) { calls.push(args); return { error: null }; } };
  const text = await passwords.requestAdminPasswordReset(auth, ' unknown@example.com ', 'https://themarketinghaven.xyz');
  assert.equal(text, passwords.ADMIN_RECOVERY_CONFIRMATION);
  assert.deepEqual(calls, [['unknown@example.com', { redirectTo: 'https://themarketinghaven.xyz/admin/accept-invite' }]]);
  await assert.rejects(passwords.requestAdminPasswordReset(auth, 'bad address', 'https://themarketinghaven.xyz'), error => error.code === 'invalid_email');
  assert.equal(calls.length, 1);
});
test('reset email provider errors are safe and throttling cannot be mistaken for delivery', async () => {
  for (const error of [{ status: 429 }, { code: 'over_email_send_rate_limit' }]) {
    await assert.rejects(passwords.requestAdminPasswordReset({ resetPasswordForEmail: async () => ({ error }) }, 'owner@example.com', 'https://themarketinghaven.xyz'), result => result.code === 'rate_limited');
  }
  await assert.rejects(passwords.requestAdminPasswordReset({ resetPasswordForEmail: async () => ({ error: { message: 'private SMTP credential error' } }) }, 'owner@example.com', 'https://themarketinghaven.xyz'), error => error.code === 'unavailable' && !error.message.includes('private'));
});
test('recovery verifies the server account and cannot promote editable user metadata', async () => {
  const forged = authFixture({ user: { id: 'customer', user_metadata: { role: 'admin' } } });
  await assert.rejects(passwords.saveAdminPassword(forged.auth, pass), error => error.code === 'not_admin');
  assert.equal(forged.calls.some(([type]) => type === 'update'), false);
  const expired = authFixture({ session: null });
  await assert.rejects(passwords.saveAdminPassword(expired.auth, pass), error => error.code === 'session_missing');
  assert.deepEqual(expired.calls, [['session']]);
});
test('recovery updates only password after a verified session, with no role writes', async () => {
  const f = authFixture();
  await passwords.saveAdminPassword(f.auth, pass);
  assert.deepEqual(f.calls, [['session'], ['user', 'signed-token'], ['update', { password: pass.password }]]);
  await assert.rejects(passwords.saveAdminPassword(f.auth, { ...pass, confirmation: 'different' }), error => error.code === 'invalid_password');
});
test('authenticated password change requires current-password verification before any write', async () => {
  const wrong = authFixture({ passwordError: { code: 'invalid_credentials' } });
  await assert.rejects(passwords.saveAdminPassword(wrong.auth, { ...pass, requireCurrentPassword: true, currentPassword: 'wrong' }), error => error.code === 'current_password');
  assert.equal(wrong.calls.some(([type]) => type === 'update'), false);
  const f = authFixture();
  await passwords.saveAdminPassword(f.auth, { ...pass, requireCurrentPassword: true, currentPassword: 'old password' });
  assert.deepEqual(f.calls.slice(-2), [['reauth', { email: 'owner@example.com', password: 'old password' }], ['update', { password: pass.password }]]);
});
test('an identity switch during reauthentication fails closed and signs out the local session', async () => {
  const f = authFixture();
  f.auth.signInWithPassword = async () => ({ data: { user: { id: 'other-id', app_metadata: { role: 'admin' } }, session: { access_token: 'other' } } });
  await assert.rejects(passwords.saveAdminPassword(f.auth, { ...pass, currentPassword: 'old', requireCurrentPassword: true }), error => error.code === 'session_missing');
  assert.deepEqual(f.calls.at(-1), ['out', { scope: 'local' }]);
  assert.equal(f.calls.some(([type]) => type === 'update'), false);
});
test('expired password session asks for a fresh reset and never exposes raw provider errors', async () => {
  const f = authFixture({ updateError: { code: 'reauthentication_needed', message: 'private details' } });
  await assert.rejects(passwords.saveAdminPassword(f.auth, pass), error => error.code === 'session_missing' && /fresh password reset/.test(error.message) && !error.message.includes('private'));
});

function signInUi(auth) {
  const states = []; let cursor = 0;
  const react = { useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; }, useRef:value=>({current:value}),useEffect() {} };
  const context = { module: { exports: {} }, require: name => name === 'react' ? react : name.includes('adminLockout')?lockout:name.includes('adminPassword') ? passwords : { adminSupabase: { auth } }, window: { location: { origin: 'https://themarketinghaven.xyz' } }, React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) } };
  vm.runInNewContext(transformSync(readFileSync(new URL('../src/components/admin/AdminSignIn.jsx', import.meta.url), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, context);
  const render = () => { cursor = 0; const result = []; const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; result.push(node); walk(node.props.children); }; walk(context.module.exports.default({ onAuth() {} })); return result; };
  return { render };
}
test('forgot-password form removes password input, sends recovery and blocks immediate repeat', async () => {
  const calls = [], ui = signInUi({ resetPasswordForEmail: async (...args) => { calls.push(args); return { error: null }; } });
  ui.render().find(node => node.type === 'input' && node.props.type === 'email').props.onChange({ target: { value: 'owner@example.com' } });
  ui.render().find(node => node.type === 'button' && node.props.type === 'button').props.onClick();
  let nodes = ui.render(); assert.equal(nodes.some(node => node.type === 'input' && node.props.type === 'password'), false);
  await nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  nodes = ui.render(); assert.ok(nodes.find(node => node.props.role === 'status')); assert.equal(nodes.find(node => node.type === 'button' && !node.props.type).props.disabled, true);
  await nodes.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); assert.equal(calls.length, 1);
});

function passwordPage(auth, link) {
  const states = [], effects = []; let cursor = 0;
  const react = { useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; }, useEffect(effect) { if (!effects.length) effects.push(effect); } };
  const context = { module: { exports: {} }, require: name => name === 'react' ? react : name.includes('adminPassword') ? passwords : name.includes('adminMfa') ? mfa : { adminSupabase: { auth }, initialAdminAuthLink: link }, React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) } };
  vm.runInNewContext(transformSync(readFileSync(new URL('../src/pages/AdminInvitePage.jsx', import.meta.url), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, context);
  const render = () => { cursor = 0; const result = []; const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; result.push(node); walk(node.props.children); }; walk(context.module.exports.default()); return result; };
  return { render, async mount() { render(); effects[0](); for (let index = 0; index < 8; index++) await Promise.resolve(); } };
}
test('an expired callback refuses an existing tab session and provides the reset entry point', async () => {
  const f = authFixture(), ui = passwordPage(f.auth, { problem: 'expired', type: null, change: false });
  await ui.mount(); const nodes = ui.render();
  assert.equal(f.calls.length, 0);
  assert.equal(nodes.some(node => node.type === 'form'), false);
  assert.match(nodes.find(node => node.props.role === 'alert').props.children[0], /expired or has already been used/);
  assert.ok(nodes.find(node => node.type === 'a' && node.props.href === '/admin'));
});
test('a valid recovery callback offers a password form without asking for the forgotten password', async () => {
  const f = authFixture(), ui = passwordPage(f.auth, { problem: null, type: 'recovery', change: false });
  await ui.mount(); const inputs = ui.render().filter(node => node.type === 'input');
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every(node => node.props.autoComplete === 'new-password'));
});
test('a direct visit with an authenticated admin requires the current password', async () => {
  const f = authFixture(), ui = passwordPage(f.auth, { problem: null, type: null, change: false });
  await ui.mount(); const inputs = ui.render().filter(node => node.type === 'input');
  assert.equal(inputs.length, 3);
  assert.equal(inputs[0].props.autoComplete, 'current-password');
});


test('an enrolled recovery session requires its authenticator before offering a new password form',async()=>{
  const factor={id:'totp-fixture',factor_type:'totp',status:'verified'};
  const f=authFixture({user:{id:'owner-id',email:'owner@example.com',app_metadata:{role:'admin'},factors:[factor]}});
  const ui=passwordPage(f.auth,{problem:null,type:'recovery',change:false});await ui.mount();await new Promise(resolve=>setImmediate(resolve));
  const nodes=ui.render();assert.equal(nodes.some(node=>node.type==='form'),false);assert.equal(nodes.find(node=>node.props.factors)?.props.factors[0].id,factor.id);
  assert.equal(f.calls.some(([action])=>action==='update'),false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {readCookiePreference,COOKIE_NOTICE_VERSION} from '../src/lib/cookiePreference.js';

const source = readFileSync(new URL('../src/lib/trackingUtils.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm,'').replaceAll('export async function', 'async function').replaceAll('export function', 'function').replace('export { getOrCreateVisitorId };','');
function capture(consent, blocked = false) {
  const values = new Map(consent === undefined ? [] : [['tmh_cookie_consent', String(consent)],['tmh_cookie_consent_version',COOKIE_NOTICE_VERSION],['tmh_cookie_consent_recorded','true'],['tmh_cookie_consent_at',new Date().toISOString()]]), writes = [];
  const context = { readCookiePreference,URLSearchParams, Date, navigator: { userAgent: 'Android Mobile' },
    window: { location: { search: '?utm_source=test&utm_campaign=launch' } }, document: { referrer: 'https://example.com' },
    localStorage: { getItem: (key) => { if (blocked) throw new Error('disabled'); return values.get(key) ?? null; },
      setItem: (key, value) => { writes.push(key); values.set(key, value); } },
  };
  vm.runInNewContext(`${source}\nglobalThis.capture=captureTrackingData;`, context);
  return { run: context.capture, writes };
}
test('tracking: optional counters and attribution stay off before consent or after declining', () => {
  for (const consent of [undefined, false]) {
    const app = capture(consent), data = app.run();
    assert.equal(app.writes.length, 0); assert.equal(data.utmSource, null); assert.equal(data.referrerUrl, null); assert.equal(data.deviceType, 'mobile');
  }
});
test('tracking: accepted visit counters increment while disabled storage never breaks startup', () => {
  const app = capture(true); assert.equal(app.run().visitCount, 1); assert.equal(app.run().visitCount, 2);
  assert.equal(app.run().utmSource, 'test');
  const blocked = capture(undefined, true); assert.doesNotThrow(() => blocked.run()); assert.equal(blocked.writes.length, 0);
});

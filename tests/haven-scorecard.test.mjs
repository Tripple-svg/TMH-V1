import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';

const require = createRequire(import.meta.url);
const source = buildSync({
  entryPoints: [new URL('../src/components/haven/components/HavenScoreCard.jsx', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
  bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent',
  external: ['react', 'framer-motion', 'lucide-react'],
}).outputFiles[0].text;
const module = { exports: {} };
vm.runInNewContext(source, { module, exports: module.exports, require });
const Scorecard = module.exports.default;
function render(preflight) { return renderToStaticMarkup(React.createElement(Scorecard, { preflight, onProceed() {}, onRetry() {} })); }

test('scorecard: unreadable content has a clear explanation and continue action with no numeric score', () => {
  const html = render({ status: 'bad_data', score: 99 });
  assert.match(html, /Not enough readable content to score/); assert.match(html, /Continue to Chat/);
  assert.doesNotMatch(html, />99<\/span>|\/ 100|Below pass mark/);
});
test('scorecard: network failure offers retry and continue separately from bad data', () => {
  const html = render({ status: 'failed', retryCount: 0 });
  assert.match(html, /Try again/); assert.match(html, /Skip and continue to chat/);
  assert.match(html, /unexpected error while reading your web/); assert.doesNotMatch(html, /\/ 100/);
});
test('scorecard: genuine low and zero scores are rendered rather than treated as unavailable', () => {
  for (const score of [0, 20]) {
    const html = render({ status: 'ready', score, breakdown: { clarity: 4, trust: 4, conversion: 4, technical: 4, content: 4 } });
    assert.ok(html.includes(`>${score}</span>`)); assert.match(html, /\/ 100/);
    assert.match(html, /Below pass mark/); assert.doesNotMatch(html, /Score unavailable|Not enough readable content/);
  }
});
test('scorecard: social bad data uses screenshot-specific copy rather than inventing a website failure', () => {
  const html = renderToStaticMarkup(React.createElement(Scorecard, { kind: 'social', preflight: { status: 'bad_data' }, onProceed() {} }));
  assert.match(html, /screenshot didn/); assert.doesNotMatch(html, /complex scripts/);
});

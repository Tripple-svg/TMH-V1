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
  bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent', jsx: 'automatic',
  external: ['react', 'framer-motion', 'lucide-react'],
}).outputFiles[0].text;
const module = { exports: {} };
vm.runInNewContext(source, { module, exports: module.exports, require });
const Scorecard = module.exports.default;
function render(preflight) { return renderToStaticMarkup(React.createElement(Scorecard, { preflight, onProceed() {}, onRetry() {} })); }

test('scorecard: unreadable content has a clear explanation and continue action with no numeric score', () => {
  const html = render({ status: 'bad_data', score: 99 });
  assert.match(html, /Not enough evidence to score/); assert.match(html, /Continue to Chat/);
  assert.doesNotMatch(html, />99<\/span>|\/ 100|Below pass mark/);
});
test('scorecard: network failure offers retry and continue separately from bad data', () => {
  const html = render({ status: 'failed', retryCount: 0 });
  assert.match(html, /Retry this source/); assert.match(html, /Continue to Chat/);
  assert.match(html, /scoring service did not complete/); assert.doesNotMatch(html, /\/ 100/);
});
test('scorecard: genuine low and zero scores are rendered rather than treated as unavailable', () => {
  for (const score of [0, 20]) {
    const html = render({ status: 'ready', score, breakdown: { clarity: 4, trust: 4, conversion: 4, technical: 4, content: 4 } });
    assert.ok(html.includes(`>${score}<span`)); assert.match(html, /\/ 100/);
    assert.doesNotMatch(html, /pass mark/); assert.doesNotMatch(html, /Score unavailable|Not enough readable content/);
  }
});
test('scorecard: social bad data uses screenshot-specific copy rather than inventing a website failure', () => {
  const html = renderToStaticMarkup(React.createElement(Scorecard, { kind: 'social', preflight: { status: 'bad_data' }, onProceed() {} }));
  assert.match(html, /screenshot did not/); assert.doesNotMatch(html, /complex scripts/);
});

test('scorecard: current rubric explains scope, keeps optional evidence and exposes source correction', () => {
  const html = renderToStaticMarkup(React.createElement(Scorecard, {
    preflight: { status: 'ready', score: 60, rubricVersion: '2026-10-27',
      breakdown: { clarity: 15, trust: 15, positioning: 15, conversion: 15 },
      evidence: { positioning: { observation: 'The offer names a specific buyer.', quote: 'Bread for office lunches', improvement: 'Explain the delivery area.' } } },
    onProceed() {}, onCorrect() {},
  }));
  assert.match(html, /Your Haven score reviews how clearly this page communicates your offer and next step, using the text we could read/);
  assert.match(html, /How this score was reached/); assert.match(html, /Positioning/);
  assert.match(html, /Bread for office lunches/); assert.match(html, /Wrong website\/screenshot\? Try Again/);
  assert.doesNotMatch(html, /pass mark|Technical experience|Content consistency/);
});

test('scorecard: ownership recovery keeps correction controls unavailable', () => {
  const html = renderToStaticMarkup(React.createElement(Scorecard, {
    preflight: { status: 'failed', error: 'This saved review needs access recovery.' }, onCorrect() {}, onRetry() {}, onProceed() {},
  }));
  assert.match(html, /access recovery/); assert.doesNotMatch(html, /Wrong website|Review this source|Retry this source/);
});

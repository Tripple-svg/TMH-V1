import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function imageFixture() {
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], (value) => { states[index] = value; }]; },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useEffect(effect) { effects.push(effect); },
  };
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/components/ui/ProgressiveImage.jsx', import.meta.url), 'utf8');
  vm.runInNewContext(transformSync(source, { loader: 'jsx', format: 'cjs' }).code, { React: react, require: () => react, module, exports: module.exports });
  return { refs, effects, render(props) { stateIndex = refIndex = 0; return module.exports.default(props); } };
}

test('progressive image: reserves the frame while loading, reveals loaded images, and hides stale images on a source change', () => {
  const f = imageFixture(), props = { src: '/photo.jpg', alt: 'Team member', className: 'relative h-20 w-20' };
  let tree = f.render(props);
  assert.equal(tree.props['aria-busy'], true);
  assert.match(tree.props.children[1].props.className, /opacity-0/);
  tree.props.children[1].props.onLoad();
  tree = f.render(props); assert.equal(tree.props['aria-busy'], false);
  assert.match(tree.props.children[1].props.className, /opacity-100/);
  tree = f.render({ ...props, src: '/other.jpg' });
  assert.equal(tree.props['aria-busy'], true); assert.match(tree.props.children[1].props.className, /opacity-0/);
});

test('progressive image: cached images skip the skeleton and failed images retain an accessible fallback', () => {
  const f = imageFixture(), props = { src: '/cached.jpg', alt: 'Team member', fallback: 'TMH' };
  f.render(props); f.refs[0].current = { complete: true, naturalWidth: 100 };
  f.effects[0](); assert.equal(f.render(props).props['aria-busy'], false);
  const error = f.render({ ...props, src: '/missing.jpg' }); error.props.children[1].props.onError();
  const failed = f.render({ ...props, src: '/missing.jpg' });
  assert.equal(failed.props['aria-busy'], false);
  assert.equal(failed.props.children[0].props.children[0], 'TMH');
  assert.doesNotMatch(failed.props.children[0].props.className, /animate-pulse/);
});

test('progressive image: review screenshots use contain without a competing cover utility', () => {
  const f = imageFixture();
  const tree = f.render({ src: '/review.jpg', fit: 'contain', className: 'relative aspect-[1080/477]' });
  const classes = tree.props.children[1].props.className;
  assert.match(classes, /object-contain/); assert.doesNotMatch(classes, /object-cover/);
});

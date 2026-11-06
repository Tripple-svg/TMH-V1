import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import * as adminProduction from '../src/lib/adminProduction.js';

function calendar(bookings, now) {
  const state = [];
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useMemo: callback => callback(),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], next => { state[index] = next; }];
    },
  };
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/components/admin/BookingCalendar.jsx', import.meta.url), 'utf8');
  const code = transformSync(source, { loader: 'jsx', format: 'cjs' }).code;
  vm.runInNewContext(code, { React, module, require: name => name === 'react' ? React : adminProduction });
  return () => {
    cursor = 0;
    const nodes = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      visit(node.children);
    }
    visit(module.exports.default({ bookings, now }));
    return nodes;
  };
}

test('monthly booking calendar marks past and upcoming dates in Lagos and opens past details', () => {
  const render = calendar([
    { id: 'past', start_time: '2026-10-21T11:00:00Z', status: 'active', full_name: 'Past test guest' },
    { id: 'overnight', start_time: '2026-10-31T23:30:00Z', status: 'completed' },
    { id: 'upcoming', start_time: '2026-11-06T14:00:00Z', status: 'confirmed' },
    { id: 'cancelled', start_time: '2026-11-06T17:00:00Z', status: 'cancelled' },
    { id: 'next', start_time: '2026-12-04T10:00:00Z', status: 'active' },
  ], Date.parse('2026-11-06T12:00:00Z'));

  const byLabel = (nodes, label) => nodes.find(node => node.props?.['aria-label'] === label);
  const november = render();
  assert.equal(byLabel(november, '2026-11-06, 0 past, 1 upcoming').props['aria-current'], 'date');
  assert.ok(byLabel(november, '2026-11-01, 1 past, 0 upcoming'));
  byLabel(november, 'Previous month').props.onClick();
  const october = render();
  byLabel(october, '2026-10-21, 1 past, 0 upcoming').props.onClick();
  assert.ok(render().some(node => node.type === 'p' && node.children.includes('Past test guest')));
  byLabel(render(), 'Next month').props.onClick();
  byLabel(render(), 'Next month').props.onClick();
  assert.ok(byLabel(render(), '2026-12-04, 0 past, 1 upcoming'));
});

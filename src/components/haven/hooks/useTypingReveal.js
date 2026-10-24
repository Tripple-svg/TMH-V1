import { useEffect, useState } from 'react';

const KEY = 'tmh_haven_revealed_messages_v1';
let seen;
function revealedMessages() {
  if (!seen) {
    try { seen = new Set(JSON.parse(localStorage.getItem(KEY) || '[]').slice(-500)); }
    catch { seen = new Set(); }
  }
  return seen;
}
export function revealLength(text, elapsed) {
  if (!text) return 0;
  const duration = Math.min(4200, Math.max(700, text.length * 12));
  if (elapsed < 220) return 0;
  return Math.min(text.length, Math.ceil(text.length * (elapsed - 220) / duration));
}

export default function useTypingReveal(id, text, eligible, reducedMotion) {
  const [shouldAnimate] = useState(() => Boolean(id && eligible && !reducedMotion && !revealedMessages().has(id)));
  const [count, setCount] = useState(() => shouldAnimate ? 0 : text.length);
  useEffect(() => {
    if (!shouldAnimate || reducedMotion) return;
    const ledger = revealedMessages(); ledger.add(id);
    seen = new Set([...ledger].slice(-500));
    try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch { /* Device storage is optional. */ }
    const started = performance.now();
    const timer = setInterval(() => {
      const next = revealLength(text, performance.now() - started);
      setCount(next);
      if (next >= text.length) clearInterval(timer);
    }, 32);
    return () => clearInterval(timer);
  }, [id, text, reducedMotion, shouldAnimate]);
  return { text: text.slice(0, reducedMotion ? text.length : count), complete: reducedMotion || count >= text.length };
}

import { useEffect, useImperativeHandle, useRef, useState } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const RETRY_DELAYS = [1000, 3000, 8000];
let loadingScript;

function loadTurnstile() {
  if (typeof window.turnstile?.render === 'function') return Promise.resolve(window.turnstile);
  if (!loadingScript) {
    loadingScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const finish = (api) => {
        clearTimeout(deadline);
        script.onload = script.onerror = null;
        if (typeof api?.render === 'function') resolve(api);
        else {
          script.remove();
          reject(new Error('Turnstile failed to load'));
        }
      };
      const deadline = setTimeout(finish, 10000);
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => finish(window.turnstile);
      script.onerror = () => finish();
      document.head.append(script);
    }).finally(() => { loadingScript = null; });
  }
  return loadingScript;
}

export default function TurnstileWidget({ action, onVerify, onExpire, onError, ref }) {
  const container = useRef(null);
  const restart = useRef(null);
  const handlers = useRef({ onVerify, onExpire, onError });
  const [unavailable, setUnavailable] = useState(false);
  const sitekey = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY?.trim();

  useEffect(() => { handlers.current = { onVerify, onExpire, onError }; }, [onVerify, onExpire, onError]);
  useImperativeHandle(ref, () => ({
    reset: () => restart.current?.(),
  }), []);

  useEffect(() => {
    if (!sitekey) return;
    let disposed = false;
    let generation = 0;
    let retryCount = 0;
    let retryTimer;
    let challengeTimer;
    let widget;
    const retire = () => {
      generation++;
      clearTimeout(retryTimer);
      clearTimeout(challengeTimer);
      if (widget) widget.api.remove(widget.id);
      widget = null;
    };
    const render = async () => {
      const attempt = ++generation;
      const active = () => !disposed && generation === attempt;
      const retry = (expired = false) => {
        if (!active()) return true;
        retire();
        if (expired) handlers.current.onExpire?.();
        else handlers.current.onError?.();
        const delay = RETRY_DELAYS[retryCount++];
        if (delay === undefined) setUnavailable(true);
        else retryTimer = setTimeout(render, delay);
        return true;
      };
      try {
        const api = await loadTurnstile();
        if (!active()) return;
        challengeTimer = setTimeout(() => retry(), 18000);
        const id = api.render(container.current, {
          sitekey,
          action,
          appearance: 'interaction-only',
          size: container.current.clientWidth < 300 ? 'compact' : 'normal',
          'response-field': false,
          retry: 'never',
          'refresh-expired': 'never',
          'refresh-timeout': 'never',
          callback: token => {
            if (!active()) return;
            if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
              retry();
              return;
            }
            clearTimeout(challengeTimer);
            retryCount = 0;
            setUnavailable(false);
            handlers.current.onVerify(token);
          },
          'before-interactive-callback': () => { if (active()) clearTimeout(challengeTimer); },
          'expired-callback': () => retry(true),
          'error-callback': () => retry(),
          'timeout-callback': () => retry(),
          'unsupported-callback': () => retry(),
        });
        if (active()) widget = { api, id };
        else api.remove(id);
      } catch { retry(); }
    };
    restart.current = () => {
      retire();
      retryCount = 0;
      setUnavailable(false);
      handlers.current.onExpire?.();
      void render();
    };
    void render();
    return () => {
      disposed = true;
      restart.current = null;
      retire();
    };
  }, [action, sitekey]);

  return <div className="w-full min-w-0">
    <div ref={container} />
    {(!sitekey || unavailable) && <p role="status" className="text-xs text-amber-600 dark:text-amber-300">If the security check stays stuck, refresh this page to try again.</p>}
  </div>;
}

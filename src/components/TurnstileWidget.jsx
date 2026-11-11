import { useEffect, useImperativeHandle, useRef, useState } from 'react';

export default function TurnstileWidget({ action, onVerify, onExpire, onError, ref }) {
  const container = useRef(null);
  const widget = useRef(null);
  const handlers = useRef({ onVerify, onExpire, onError });
  const [unavailable, setUnavailable] = useState(false);
  const sitekey = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY?.trim();

  useEffect(() => { handlers.current = { onVerify, onExpire, onError }; }, [onVerify, onExpire, onError]);
  useImperativeHandle(ref, () => ({
    reset() {
      if (widget.current !== null) window.turnstile?.reset(widget.current);
    },
  }), []);

  useEffect(() => {
    if (!sitekey) return;
    let disposed = false;
    const fail = () => {
      if (disposed) return;
      setUnavailable(true);
      handlers.current.onError?.();
    };
    const deadline = setTimeout(fail,15000);
    const render = () => {
      if (disposed || widget.current !== null) return;
      try {
        widget.current = window.turnstile.render(container.current, {
          sitekey,
          action,
          appearance: 'interaction-only',
          'response-field': false,
          'refresh-expired': 'auto',
          callback: token => {
            if (disposed) return;
            setUnavailable(false);
            handlers.current.onVerify(token);
          },
          'expired-callback': () => { if (!disposed) handlers.current.onExpire?.(); },
          'error-callback': fail,
          'timeout-callback': fail,
        });
        clearTimeout(deadline);
      } catch { fail(); }
    };
    const script = document.getElementById('turnstile-script');
    script?.addEventListener('load', render);
    script?.addEventListener('error', fail);
    if (window.turnstile) render();
    return () => {
      disposed = true;
      clearTimeout(deadline);
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', fail);
      if (widget.current !== null) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [action, sitekey]);

  return <div>
    <div ref={container} />
    {(!sitekey || unavailable) && <p role="status" className="text-xs text-amber-600 dark:text-amber-300">The security check could not load. Refresh this page to try again.</p>}
  </div>;
}

import { useEffect, useRef, useState } from 'react';

// Reserves the parent's dimensions; cached images skip the placeholder immediately.
export default function ProgressiveImage({ src, alt = '', className = '', imageClassName = '', loading = 'lazy', fallback = '', fit = 'cover', ...props }) {
  const ref = useRef(null);
  const [resolved, setResolved] = useState(null);
  const [failed, setFailed] = useState(null);
  const ready = resolved === src;
  const broken = failed === src;
  useEffect(() => {
    if (ref.current?.complete && ref.current.naturalWidth > 0) setResolved(src);
  }, [src]);
  return <span className={`block overflow-hidden bg-zinc-200 dark:bg-zinc-800 ${className}`} aria-busy={!ready && !broken}>
    {!ready && <span aria-hidden="true" className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-300 via-zinc-200 to-zinc-300 text-xl text-zinc-500 dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800 ${broken ? '' : 'animate-pulse motion-reduce:animate-none'}`}>{fallback}</span>}
    <img {...props} ref={ref} src={src} alt={alt} loading={loading} decoding="async" onLoad={() => setResolved(src)} onError={() => setFailed(src)}
      className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} transition-[opacity,filter,transform] duration-500 motion-reduce:transition-none ${ready ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-sm scale-[1.03]'} ${imageClassName}`} />
    {broken && alt && <span className="sr-only">{alt}: image unavailable</span>}
  </span>;
}

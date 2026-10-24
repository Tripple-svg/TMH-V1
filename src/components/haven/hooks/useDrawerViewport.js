import { useEffect, useRef } from 'react';

export default function useDrawerViewport(isOpen, followRef) {
  const shellRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const body = document.body, root = document.documentElement;
    const scrollY = window.scrollY;
    const saved = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow, overscrollBehavior: root.style.overscrollBehavior };
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%', overflow: 'hidden' });
    root.style.overscrollBehavior = 'none';
    const viewport = window.visualViewport;
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const shell = shellRef.current;
        if (!shell) return;
        // Size the untransformed shell, not the sliding dialog or the document.
        shell.style.top = `${Math.max(0, viewport?.offsetTop || 0)}px`;
        shell.style.height = `${Math.round(viewport?.height || window.innerHeight)}px`;
        followRef.current?.();
      });
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      Object.assign(body.style, { position: saved.position, top: saved.top, width: saved.width, overflow: saved.overflow });
      root.style.overscrollBehavior = saved.overscrollBehavior;
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, [isOpen, followRef]);
  return shellRef;
}

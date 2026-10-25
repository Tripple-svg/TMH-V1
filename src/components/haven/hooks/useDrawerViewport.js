import { useEffect, useRef } from 'react';

export default function useDrawerViewport(isOpen, followRef) {
  const shellRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const body = document.body, root = document.documentElement;
    const scrollY = window.scrollY;
    const app = document.getElementById('root');
    const saved = { position: body.style.position, top: body.style.top, width: body.style.width, height: body.style.height, overflow: body.style.overflow, rootOverflow: root.style.overflow, rootHeight: root.style.height, overscrollBehavior: root.style.overscrollBehavior, inert: app?.inert };
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%', height: '100%', overflow: 'hidden' });
    Object.assign(root.style, { overflow: 'hidden', height: '100%' });
    root.style.overscrollBehavior = 'none';
    // The drawer is portalled outside #root. Safari can still pan a locked body
    // with the keyboard open, so the background must also stop receiving input.
    if (app) app.inert = true;
    let touchY = 0;
    const touchStart = (event) => { touchY = event.touches[0]?.clientY || 0; };
    const touchMove = (event) => {
      if (event.touches.length !== 1) return; // Preserve pinch zoom.
      const nextY = event.touches[0].clientY, delta = nextY - touchY;
      touchY = nextY;
      let node = event.target instanceof Element ? event.target : null;
      const overlay = node?.closest('[data-haven-overlay]');
      while (overlay && node && node !== overlay) {
        const scrollable = /auto|scroll/.test(getComputedStyle(node).overflowY);
        if (scrollable && node.scrollHeight > node.clientHeight + 1 &&
          ((delta < 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) || (delta > 0 && node.scrollTop > 0))) return;
        node = node.parentElement;
      }
      if (event.cancelable) event.preventDefault();
    };
    document.addEventListener('touchstart', touchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', touchMove, { passive: false, capture: true });
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
      document.removeEventListener('touchstart', touchStart, true);
      document.removeEventListener('touchmove', touchMove, true);
      Object.assign(body.style, { position: saved.position, top: saved.top, width: saved.width, height: saved.height, overflow: saved.overflow });
      Object.assign(root.style, { overflow: saved.rootOverflow, height: saved.rootHeight });
      root.style.overscrollBehavior = saved.overscrollBehavior;
      if (app) app.inert = saved.inert;
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, [isOpen, followRef]);
  return shellRef;
}

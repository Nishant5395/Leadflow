import { useEffect } from 'react';

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
export function useHotkeys(map, { disabled = false } = {}) {
  useEffect(() => {
    if (disabled) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const handler = map[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [map, disabled]);
}

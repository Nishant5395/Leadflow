import { useCallback, useState } from 'react';

const KEY = 'leadflow-theme';

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  const toggle = useCallback(() => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
    }
    setTheme(next);
  }, []);

  return [theme, toggle];
}

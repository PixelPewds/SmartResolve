import { useEffect, useReducer } from 'react';
import { THEME_EVENT } from './theme.jsx';

// Recharts writes colours into SVG attributes, where CSS var() is not
// reliable. Read the resolved token values on every render (cheap: one
// getComputedStyle), and re-render when either the OS scheme or the in-app
// theme toggle changes.
const NAMES = ['ink', 'ink-2', 'muted', 'faint', 'line', 'line-strong', 'surface', 'sunken',
  'p1', 'p2', 'p3', 'p4', 'neg', 'neu', 'pos'];

export function useTokens() {
  const [, rerender] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', rerender);
    window.addEventListener(THEME_EVENT, rerender);
    return () => {
      mq.removeEventListener('change', rerender);
      window.removeEventListener(THEME_EVENT, rerender);
    };
  }, []);
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(NAMES.map((n) => [n, cs.getPropertyValue(`--color-${n}`).trim()]));
}

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from '@phosphor-icons/react';

const KEY = 'sr-theme';
export const THEME_EVENT = 'sr-themechange';

function read() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

function apply(mode) {
  const root = document.documentElement;
  if (mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = mode;
  try { mode === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, mode); } catch { /* private mode */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useTheme() {
  const [mode, setMode] = useState(read);
  useEffect(() => {
    const on = () => setMode(read());
    window.addEventListener(THEME_EVENT, on);
    return () => window.removeEventListener(THEME_EVENT, on);
  }, []);
  return [mode, apply];
}

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeToggle({ className = '' }) {
  const [mode, setMode] = useTheme();
  return (
    <div role="radiogroup" aria-label="Colour theme" className={`inline-flex rounded-md border border-line bg-sunken p-0.5 ${className}`}>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={mode === value} aria-label={label} title={label}
          onClick={() => setMode(value)}
          className={`grid h-6 w-7 place-items-center rounded-[5px] transition-colors ${
            mode === value ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-muted hover:text-ink'}`}>
          <Icon size={14} weight={mode === value ? 'fill' : 'regular'} />
        </button>
      ))}
    </div>
  );
}

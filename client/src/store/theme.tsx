import { useEffect, useMemo, useState } from 'react';
import { ThemeContext, getInitialTheme, resolveTheme, type Theme } from './theme-context';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = resolveTheme(theme);
      document.documentElement.classList.toggle('dark', resolved === 'dark');
    };
    apply();
    window.addEventListener('storage', apply);
    mq.addEventListener('change', apply);
    return () => {
      window.removeEventListener('storage', apply);
      mq.removeEventListener('change', apply);
    };
  }, [theme]);

  const setTheme = (next: Theme) => {
    localStorage.setItem('taskflow-theme', next);
    setThemeState(next);
  };

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme: resolveTheme(theme) }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
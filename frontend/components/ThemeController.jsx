'use client';

import { useEffect } from 'react';

export const THEME_STORAGE_KEY = 'crease-theme';
export const THEMES = ['red-ball'];

export function setTheme(theme) {
  const next = 'red-ball';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_STORAGE_KEY, next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    '#B91C1C',
  );
}

export default function ThemeController() {
  useEffect(() => {
    const apply = (event) => setTheme(event.detail);
    window.addEventListener('crease-theme-change', apply);
    return () => window.removeEventListener('crease-theme-change', apply);
  }, []);
  return null;
}

'use client';

import { useEffect } from 'react';

export const THEME_STORAGE_KEY = 'crease-theme';
export const THEMES = ['classic', 'red-ball', 'blue'];

export function setTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'classic';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_STORAGE_KEY, next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    next === 'red-ball' ? '#B91C1C' : next === 'blue' ? '#2563EB' : '#166534',
  );
}

export default function ThemeController() {
  useEffect(() => {
    setTheme(localStorage.getItem(THEME_STORAGE_KEY) || 'classic');
    const apply = (event) => setTheme(event.detail);
    window.addEventListener('crease-theme-change', apply);
    return () => window.removeEventListener('crease-theme-change', apply);
  }, []);
  return null;
}

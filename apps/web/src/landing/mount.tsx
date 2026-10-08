// The landing on its own (main.tsx, signed out visit to `/`): dark, status color variables, the page.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installThemeVars } from '@/styles/themeVars';
import { Landing } from './Landing';

export function mountLanding(root: HTMLElement): void {
  installThemeVars();
  document.documentElement.dataset.theme = 'dark';
  createRoot(root).render(
    <StrictMode>
      <Landing />
    </StrictMode>,
  );
}

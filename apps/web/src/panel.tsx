// The panel: providers, router, theme. Loaded by main.tsx for every path except a signed out visit to `/`.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/components/AppProviders';
import { router } from './router';
import { installThemeVars } from './styles/themeVars';
import './lib/theme';

export function mountPanel(root: HTMLElement): void {
  installThemeVars();
  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}

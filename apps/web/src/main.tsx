import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/components/AppProviders';
import { router } from './router';
import { installThemeVars } from './styles/themeVars';
import './styles/global.css';
import './lib/theme';

installThemeVars();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);

import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Projects appear as the lanes create them; a missing folder is skipped instead of failing the run.
// apps/mobile runs only the pure library tests (no React Native imports) under src/lib.
// apps/web runs the pure tests under src (export builders, formatters) with the panel's `@` alias.
const projects = [
  'packages/shared',
  'packages/design',
  'supabase/functions/_shared',
  'supabase/functions/ai-verify',
  'supabase/functions/ai-shift-summary',
  'supabase/functions/ai-explain-rating',
  'apps/mobile',
  'apps/web',
].filter((dir) => existsSync(dir));

const include = (root: string): string[] =>
  root === 'apps/mobile' ? ['src/lib/**/*.test.ts'] : root === 'apps/web' ? ['src/**/*.test.ts'] : ['**/*.test.ts'];

export default defineConfig({
  test: {
    passWithNoTests: true,
    ...(projects.length > 0
      ? {
          projects: projects.map((root) => ({
            ...(root === 'apps/web'
              ? { resolve: { alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) } } }
              : {}),
            test: {
              name: root,
              root,
              include: include(root),
              exclude: ['**/node_modules/**'],
            },
          })),
        }
      : { include: ['packages/**/*.test.ts'] }),
  },
});

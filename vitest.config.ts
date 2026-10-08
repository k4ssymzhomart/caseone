import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Projects appear as the lanes create them; a missing folder is skipped instead of failing the run.
// apps/mobile runs only the pure library tests (no React Native imports) under src/lib.
const projects = [
  'packages/shared',
  'packages/design',
  'supabase/functions/_shared',
  'supabase/functions/ai-verify',
  'supabase/functions/ai-insights',
  'apps/mobile',
].filter((dir) => existsSync(dir));

export default defineConfig({
  test: {
    passWithNoTests: true,
    ...(projects.length > 0
      ? {
          projects: projects.map((root) => ({
            test: {
              name: root,
              root,
              include: root === 'apps/mobile' ? ['src/lib/**/*.test.ts'] : ['**/*.test.ts'],
              exclude: ['**/node_modules/**'],
            },
          })),
        }
      : { include: ['packages/**/*.test.ts'] }),
  },
});
